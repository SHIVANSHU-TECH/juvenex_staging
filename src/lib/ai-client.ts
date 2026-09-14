// Unified AI chat completion client.
// Abstracts provider differences (xAI Grok, Anthropic Claude, OpenAI) behind
// a single interface so API routes don't need to care which backend is configured.
//
// Provider selection:
//   AI_PROVIDER = 'openai' | 'grok' | 'anthropic'
//   OPENAI_API_KEY      + OPENAI_MODEL       (default: gpt-4o-mini)
//   XAI_API_KEY         + GROK_MODEL         (default: grok-4-1-fast-non-reasoning)
//   ANTHROPIC_API_KEY   + CLAUDE_MODEL       (default: claude-sonnet-4-20250514)
//
// HIPAA Safe Harbor — see src/lib/phi-sanitizer.ts. All outgoing AI calls are
// de-identified here, so plain Grok/Anthropic/OpenAI API usage (no BAA) is compliant.

import { deidentifyMessage, deidentifyText } from './phi-sanitizer'
import { logger } from './logger'

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ChatCompletionOptions {
  system?: string
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
  tool?: ToolSchema
}

export interface ChatCompletionResult {
  text: string
  toolInput: Record<string, unknown> | null
}

type Provider = 'openai' | 'grok' | 'anthropic'

function getProvider(): Provider {
  const explicit = process.env.AI_PROVIDER?.toLowerCase()
  if (explicit === 'openai') return 'openai'
  if (explicit === 'anthropic') return 'anthropic'
  if (explicit === 'grok' || explicit === 'xai') return 'grok'
  if (process.env.OPENAI_API_KEY) return 'openai'
  if (process.env.XAI_API_KEY) return 'grok'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  return 'grok'
}

function isKeyConfigured(key: string | undefined, placeholder: string): boolean {
  return Boolean(key && key !== placeholder)
}

export function isAIConfigured(): boolean {
  const provider = getProvider()
  if (provider === 'openai') return isKeyConfigured(process.env.OPENAI_API_KEY, 'your_openai_api_key_here')
  if (provider === 'grok') return isKeyConfigured(process.env.XAI_API_KEY, 'your_xai_api_key_here')
  return isKeyConfigured(process.env.ANTHROPIC_API_KEY, 'your_anthropic_api_key_here')
}

export async function chatCompletion(
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  // HIPAA Safe Harbor: de-identify all free-text prompt material before
  // forwarding to an external AI provider. Tool parameter schemas are static
  // (developer-authored) and do not carry PHI, so they pass through unchanged.
  const sanitized: ChatCompletionOptions = {
    ...options,
    system: options.system ? deidentifyText(options.system) : options.system,
    messages: options.messages.map((m) => {
      const cleaned = deidentifyMessage(m)
      // Preserve role typing — deidentifyMessage returns string role.
      return { role: m.role, content: cleaned.content }
    }),
  }

  const provider = getProvider()
  if (provider === 'openai') return openaiCompletion(sanitized)
  if (provider === 'grok') return grokCompletion(sanitized)
  return anthropicCompletion(sanitized)
}

async function openaiCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    throw new Error('OPENAI_API_KEY not configured')
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  const apiMessages: Array<{ role: string; content: string }> = []
  if (options.system) apiMessages.push({ role: 'system', content: options.system })
  for (const m of options.messages) apiMessages.push({ role: m.role, content: m.content })

  const body: Record<string, unknown> = {
    model,
    messages: apiMessages,
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.7,
  }

  if (options.tool) {
    body.tools = [
      {
        type: 'function',
        function: {
          name: options.tool.name,
          description: options.tool.description,
          parameters: options.tool.parameters,
        },
      },
    ]
    body.tool_choice = { type: 'function', function: { name: options.tool.name } }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)
  let response: Response
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') {
      logger.error('[ai-client] OpenAI request timed out after 30s', { model })
      throw new Error('AI request timed out')
    }
    logger.error('[ai-client] OpenAI request failed', { model, error: err instanceof Error ? err.message : String(err) })
    throw new Error('AI upstream error')
  }
  clearTimeout(timeoutId)

  if (!response.ok) {
    await response.body?.cancel()
    logger.error('[ai-client] OpenAI API error', { status: response.status, model })
    throw new Error('AI upstream error')
  }

  const data = (await response.json()) as {
    choices: Array<{
      message: {
        content: string | null
        tool_calls?: Array<{
          function: { name: string; arguments: string }
        }>
      }
    }>
  }

  const choice = data.choices?.[0]?.message
  if (!choice) throw new Error('OpenAI returned no message')

  let toolInput: Record<string, unknown> | null = null
  if (options.tool && choice.tool_calls?.length) {
    const call = choice.tool_calls.find((c) => c.function.name === options.tool?.name)
    if (call) {
      try {
        toolInput = JSON.parse(call.function.arguments) as Record<string, unknown>
      } catch {
        toolInput = null
      }
    }
  }

  return {
    text: choice.content ?? '',
    toolInput,
  }
}

async function grokCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey || apiKey === 'your_xai_api_key_here') {
    throw new Error('XAI_API_KEY not configured')
  }

  const model = process.env.GROK_MODEL || 'grok-4-1-fast-non-reasoning'

  const apiMessages: Array<{ role: string; content: string }> = []
  if (options.system) apiMessages.push({ role: 'system', content: options.system })
  for (const m of options.messages) apiMessages.push({ role: m.role, content: m.content })

  const body: Record<string, unknown> = {
    model,
    messages: apiMessages,
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.7,
  }

  if (options.tool) {
    body.tools = [
      {
        type: 'function',
        function: {
          name: options.tool.name,
          description: options.tool.description,
          parameters: options.tool.parameters,
        },
      },
    ]
    body.tool_choice = { type: 'function', function: { name: options.tool.name } }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)
  let response: Response
  try {
    response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') {
      logger.error('[ai-client] Grok request timed out after 30s', { model })
      throw new Error('AI request timed out')
    }
    logger.error('[ai-client] Grok request failed', { model, error: err instanceof Error ? err.message : String(err) })
    throw new Error('AI upstream error')
  }
  clearTimeout(timeoutId)

  if (!response.ok) {
    await response.body?.cancel()
    logger.error('[ai-client] Grok API error', { status: response.status, model })
    throw new Error('AI upstream error')
  }

  const data = (await response.json()) as {
    choices: Array<{
      message: {
        content: string | null
        tool_calls?: Array<{
          function: { name: string; arguments: string }
        }>
      }
    }>
  }

  const choice = data.choices?.[0]?.message
  if (!choice) throw new Error('Grok returned no message')

  let toolInput: Record<string, unknown> | null = null
  if (options.tool && choice.tool_calls?.length) {
    const call = choice.tool_calls.find((c) => c.function.name === options.tool?.name)
    if (call) {
      try {
        toolInput = JSON.parse(call.function.arguments) as Record<string, unknown>
      } catch {
        toolInput = null
      }
    }
  }

  return {
    text: choice.content ?? '',
    toolInput,
  }
}

async function anthropicCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'

  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.7,
    messages: options.messages,
  }
  if (options.system) body.system = options.system

  if (options.tool) {
    body.tools = [
      {
        name: options.tool.name,
        description: options.tool.description,
        input_schema: options.tool.parameters,
      },
    ]
    body.tool_choice = { type: 'tool', name: options.tool.name }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)
  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') {
      logger.error('[ai-client] Anthropic request timed out after 30s', { model })
      throw new Error('AI request timed out')
    }
    logger.error('[ai-client] Anthropic request failed', { model, error: err instanceof Error ? err.message : String(err) })
    throw new Error('AI upstream error')
  }
  clearTimeout(timeoutId)

  if (!response.ok) {
    await response.body?.cancel()
    logger.error('[ai-client] Anthropic API error', { status: response.status, model })
    throw new Error('AI upstream error')
  }

  const data = (await response.json()) as {
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; name: string; input: Record<string, unknown> }
    >
  }

  const textBlock = data.content.find((b) => b.type === 'text')
  const toolBlock = data.content.find((b) => b.type === 'tool_use')

  return {
    text: textBlock && textBlock.type === 'text' ? textBlock.text : '',
    toolInput: toolBlock && toolBlock.type === 'tool_use' ? toolBlock.input : null,
  }
}
