import { createHash, randomBytes } from 'node:crypto'

/**
 * One-time links for moving a file between the agent's machine and a page,
 * so the bytes never pass through the conversation. A tool mints a ticket, the
 * agent uses the link once with curl, and the ticket is gone.
 *
 * Tickets live in memory. They last fifteen minutes, so a restart costs an
 * agent one retry, and nothing about them is worth a table.
 */

export const TICKET_TTL_MS = 15 * 60 * 1000

export type Ticket =
  | { kind: 'upload'; username: string; pageId: number; filename: string }
  | { kind: 'download'; username: string; filename: string }

const tickets = new Map<string, { ticket: Ticket; expiresAt: number }>()
const keyOf = (token: string) => createHash('sha256').update(token).digest('hex')

export function createTicket(ticket: Ticket, now = Date.now()): { token: string; expiresAt: number } {
  for (const [key, entry] of tickets) if (entry.expiresAt < now) tickets.delete(key)
  const token = randomBytes(32).toString('base64url')
  const expiresAt = now + TICKET_TTL_MS
  tickets.set(keyOf(token), { ticket, expiresAt })
  return { token, expiresAt }
}

/** Takes the ticket out, so a second use of the same link finds nothing. */
export function redeemTicket<K extends Ticket['kind']>(token: string, kind: K, now = Date.now()): Extract<Ticket, { kind: K }> | null {
  const key = keyOf(token)
  const entry = tickets.get(key)
  if (!entry || entry.ticket.kind !== kind) return null
  tickets.delete(key)
  return entry.expiresAt < now ? null : (entry.ticket as Extract<Ticket, { kind: K }>)
}

const extensionOf = (filename: string) => filename.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase() ?? ''

/**
 * Types a browser runs when it opens them. The API serves an upload from its
 * own origin with the type its extension implies, and that origin is where the
 * login cookie lives. A person uploading such a file does it to themselves. An
 * agent that was talked into it would be planting a page that acts as them.
 */
const ACTIVE = new Set(['html', 'htm', 'xhtml', 'shtml', 'svg', 'xml', 'xsl', 'mht', 'mhtml'])

const IMAGES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'])

export function checkFilename(filename: string): string {
  const name = filename.trim()
  if (!name || /[\\/\r\n]/.test(name)) return 'A file name is a plain name like photo.png, without a path'
  const extension = extensionOf(name)
  if (!extension) return 'The file name needs an extension, such as .png or .pdf: it is all the API keeps of the name'
  if (ACTIVE.has(extension)) return `.${extension} files are not accepted here, because a browser runs them when they are opened from the API's address`
  return ''
}

export const isImage = (filename: string) => IMAGES.has(extensionOf(filename))

/** What to write into a page to show or link the file, in the line form. */
export const markupFor = (url: string, label: string) => (isImage(url) ? `![](${url})` : `[${label.replace(/[\\\]]/g, '\\$&')}](${url})`)

/** The stored file name out of whatever a page holds: the bare name the API
 *  returned, a path, or the full address in an image or link. */
export function storedName(file: string): string | null {
  const name = file.trim().split(/[?#]/)[0]!.split('/').pop() ?? ''
  return /^[\w.-]+$/.test(name) && name !== '.' && name !== '..' ? name : null
}
