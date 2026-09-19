import { Hono } from 'hono'
import { config } from './config'
import { isImage, markupFor, redeemTicket } from './fileTickets'
import * as api from './journals'

/**
 * Where the one-time links from create_file_upload and create_file_download
 * land. There is no bearer token on these requests: the ticket in the path is
 * the credential, it was minted for one user and one file, and it works once.
 */

export function fileRoutes(): Hono {
  const app = new Hono()

  app.put('/mcp/files/up/:token', async (c) => {
    const ticket = redeemTicket(c.req.param('token'), 'upload')
    if (!ticket) return c.json({ error: 'This upload link is unknown, already used or expired. Mint a new one with create_file_upload.' }, 404)
    if (!config.publicApiUrl) return c.json({ error: 'JOURNALS_PUBLIC_API_URL is not set on the server' }, 500)

    // The whole body is read before answering, even one that is too big. A
    // proxy that is still sending when the reply comes reports a bad gateway,
    // and the sender never sees why. Nothing past the limit is kept.
    const chunks: Uint8Array[] = []
    let size = 0
    for await (const chunk of (c.req.raw.body ?? []) as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength
      if (size <= config.maxUploadBytes) chunks.push(chunk)
      else chunks.length = 0
    }
    if (size > config.maxUploadBytes) return c.json({ error: `The file is ${size} bytes, over the ${config.maxUploadBytes} byte limit` }, 413)
    if (!size) return c.json({ error: 'The request had no body. Send the file with curl -X PUT --data-binary @file' }, 400)
    const bytes = await new Blob(chunks).arrayBuffer()

    const stored = await api
      .uploadFile(ticket.username, ticket.pageId, ticket.filename, bytes, c.req.header('content-type') ?? 'application/octet-stream')
      .catch((error: unknown) => (error instanceof api.ApiError ? error : Promise.reject(error)))
    if (stored instanceof api.ApiError) return c.json({ error: `The API did not take the file: ${stored.message}` }, 502)
    const url = `${config.publicApiUrl}/${stored.path}`
    return c.json({
      uploaded: true,
      page: ticket.pageId,
      filename: stored.filename,
      url,
      bytes: bytes.byteLength,
      image: isImage(stored.filename),
      // The upload alone shows nowhere. This is what puts it on the page.
      markup: markupFor(url, ticket.filename),
      next: 'Insert markup into the page with edit_page or edit_table_rows. In a mini app, pass filename to Journals.getFileUrl.',
    })
  })

  app.get('/mcp/files/down/:token', async (c) => {
    const ticket = redeemTicket(c.req.param('token'), 'download')
    if (!ticket) return c.json({ error: 'This download link is unknown, already used or expired. Mint a new one with create_file_download.' }, 404)

    const upstream = await api.fetchUpload(ticket.username, ticket.filename)
    if (!upstream.ok || !upstream.body) return c.json({ error: 'The file is not there any more' }, 404)
    return new Response(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
        // This origin also serves the app. An uploaded file is only ever handed
        // over as a download here, never shown as a page.
        'Content-Disposition': `attachment; filename="${ticket.filename}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    })
  })

  return app
}
