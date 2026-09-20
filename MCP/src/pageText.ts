import { LINE_CODECS } from './lines/codecs'
import { linesOf } from './lines/edit'
import { parseMiniApp } from './miniApp'
import { parseTableDocument, stripHtml } from './tableDoc'

/**
 * What a page says, as text, for showing a search hit.
 *
 * The API's full text index is over the stored content column, so the snippet
 * it returns is the raw form: ProseMirror JSON for a Flat Page v2, the row
 * JSON for a Table (routes.cr:1612). That is unreadable, and unreadable is
 * the whole job of a snippet. So the page is decoded here instead, with the
 * codecs the read tools already use.
 */

/** Past this the content is left to the API's own snippet: a page this large
 *  is rare, and decoding it to show 240 characters is not worth the work. */
const MAX_DECODE = 2_000_000
const SNIPPET_CHARS = 240
const BEFORE_MATCH = 60

/** Keys that name a shape rather than say anything. Without this every block
 *  of a Rich Text page contributes its node name, and a snippet reads
 *  "paragraph paragraph header" before it reaches a word the page says. */
const STRUCTURAL = new Set(['type', 'id'])

/** Every string in a parsed document, in the order it appears. Covers the page
 *  types with no codec here (Rich Text, Kanban, Spreadsheet v2), whose content
 *  is JSON holding the text among its structure. `skipShape` is for those
 *  documents; what a Mini App stored is data, where a key named type or id
 *  holds something the page means to show. */
function jsonText(parsed: unknown, out: string[], skipShape: boolean, depth = 0): void {
  if (depth > 20 || out.length > 20_000) return
  if (typeof parsed === 'string') {
    const clean = stripHtml(parsed)
    if (clean) out.push(clean)
    return
  }
  if (Array.isArray(parsed)) {
    for (const item of parsed) jsonText(item, out, skipShape, depth + 1)
    return
  }
  if (parsed && typeof parsed === 'object') {
    for (const [key, value] of Object.entries(parsed)) {
      if (!(skipShape && STRUCTURAL.has(key))) jsonText(value, out, skipShape, depth + 1)
    }
  }
}

function tableText(content: string): string {
  const doc = parseTableDocument(content)
  const rows = doc.items.map((item) =>
    doc.columns
      .map((column) => [column.name, stripHtml(item[column.name])])
      .filter(([, value]) => value)
      .map(([name, value]) => `${name}: ${value}`)
      .join(' | '),
  )
  return [doc.columns.map((c) => c.label || c.name).join(' | '), doc.note ?? '', ...rows].filter(Boolean).join('\n')
}

function miniAppText(content: string): string | null {
  const app = parseMiniApp(content)
  if (!app) return null
  // What the app has stored is indexed with its code and is what the page
  // shows, so a search that matched an item finds that item here.
  const stored: string[] = []
  jsonText(app.kv, stored, false)
  return [app.files.html, app.files.css, app.files.js, ...app.files.modules.map((m) => `${m.name}\n${m.code}`), ...stored].filter(Boolean).join('\n')
}

/** Null when the page cannot be decoded here, which leaves the API's snippet
 *  as the only thing to show. */
export function pageText(type: string, content: string | null): string | null {
  if (!content || content.length > MAX_DECODE) return null
  try {
    if (LINE_CODECS[type]) return linesOf(LINE_CODECS[type]!.read(content)).join('\n')
    if (type === 'Table') return tableText(content)
    if (type === 'MiniApp') return miniAppText(content)
    if (content.trimStart().startsWith('{') || content.trimStart().startsWith('[')) {
      const found: string[] = []
      jsonText(JSON.parse(content), found, true)
      return found.join('\n')
    }
    return stripHtml(content)
  } catch {
    return null
  }
}

/** A window of text around what the query matched. No markers: a snippet is
 *  read back by the same agent that writes lines, and every marker worth
 *  using means something in the line form. */
export function snippetAround(text: string, query: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return ''
  const lower = flat.toLowerCase()
  const words = query.toLowerCase().split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length)
  let at = -1
  for (const needle of [query.toLowerCase().trim(), ...words]) {
    if (!needle) continue
    at = lower.indexOf(needle)
    if (at >= 0) break
  }
  if (flat.length <= SNIPPET_CHARS) return flat
  const from = at < 0 ? 0 : Math.max(0, Math.min(at - BEFORE_MATCH, flat.length - SNIPPET_CHARS))
  const to = Math.min(flat.length, from + SNIPPET_CHARS)
  return `${from > 0 ? '...' : ''}${flat.slice(from, to).trim()}${to < flat.length ? '...' : ''}`
}
