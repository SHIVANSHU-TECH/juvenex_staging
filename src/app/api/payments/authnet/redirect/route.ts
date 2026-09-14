import { NextRequest } from 'next/server'

const ALLOWED_TARGETS = new Set([
  'https://accept.authorize.net/payment/payment',
  'https://test.authorize.net/payment/payment',
])

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function GET(request: NextRequest): Response {
  const token = request.nextUrl.searchParams.get('token')
  const target = request.nextUrl.searchParams.get('target')

  if (!token || !target || !ALLOWED_TARGETS.has(target)) {
    return new Response('Invalid Authorize.net redirect', { status: 400 })
  }

  const safeToken = escapeHtml(token)
  const safeTarget = escapeHtml(target)

  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Redirecting to secure payment</title>
  </head>
  <body>
    <main style="min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#FAF9F6;color:#2D352C;padding:24px;text-align:center">
      <div>
        <h1 style="font-size:20px;margin:0 0 8px">Opening secure payment...</h1>
        <p style="margin:0 0 18px;color:#6B7567">You are being redirected to Authorize.net.</p>
        <form id="authnet-payment-form" method="post" action="${safeTarget}">
          <input type="hidden" name="token" value="${safeToken}">
          <button type="submit" style="min-height:44px;border:0;border-radius:12px;background:#2D352C;color:white;font-weight:700;padding:0 18px">Continue to payment</button>
        </form>
      </div>
    </main>
    <script>
      document.getElementById('authnet-payment-form')?.submit();
    </script>
  </body>
</html>`,
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    }
  )
}
