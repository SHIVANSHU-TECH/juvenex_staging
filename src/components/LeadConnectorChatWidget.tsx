'use client'

import { useEffect } from 'react'

const SCRIPT_ID = 'leadconnector-chat-widget'

/**
 * GoHighLevel chat widget (same loader HappyLabCo uses). Mounted once from
 * the root layout. CSP already allows *.leadconnectorhq.com.
 */
export default function LeadConnectorChatWidget() {
  useEffect(() => {
    if (document.getElementById(SCRIPT_ID)) return

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = 'https://widgets.leadconnectorhq.com/loader.js'
    script.async = true
    script.setAttribute(
      'data-resources-url',
      'https://widgets.leadconnectorhq.com/chat-widget/loader.js',
    )
    script.setAttribute('data-widget-id', '6abeb0facb9ce9d3ea202ffe')
    document.body.appendChild(script)
  }, [])

  return null
}
