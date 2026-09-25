/**
 * The outside service e2e.ts points its integrations at, so a run never calls
 * a real one. It answers the few paths the integration checks use, over https
 * with the certificate e2e.ts makes and has the API trust.
 */

// A 1×1 PNG, so a binary answer is a real image.
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

Bun.serve({
  port: 443,
  tls: { cert: Bun.file('/e2e/service.crt'), key: Bun.file('/e2e/service.key') },
  async fetch(request) {
    const { pathname } = new URL(request.url)
    if (request.method === 'GET' && pathname === '/zen') {
      // A cookie, so the check that the API drops it has one to drop.
      return new Response('Keep it logically awesome.', { headers: { 'content-type': 'text/plain; charset=utf-8', 'set-cookie': 'session=1' } })
    }
    if (request.method === 'GET' && pathname === '/u/1') {
      return new Response(PNG, { headers: { 'content-type': 'image/png' } })
    }
    if (pathname === '/anything') {
      // What was sent, the way httpbin.org/anything reports it.
      const type = request.headers.get('content-type') ?? ''
      const bytes = new Uint8Array(await request.arrayBuffer())
      const text = new TextDecoder().decode(bytes)
      return Response.json({
        method: request.method,
        data: type.startsWith('application/json') ? text : `data:${type};base64,${Buffer.from(bytes).toString('base64')}`,
        json: type.startsWith('application/json') ? JSON.parse(text) : null,
      })
    }
    return new Response('Not Found', { status: 404 })
  },
})

console.log('ready')
