import type { LineCodec, Unit } from './edit'
import { type Inline, type Mark, parseInline, renderInline } from './inline'

/**
 * Flat Page pages: the innerHTML of a contenteditable, one <div> per line
 * (FlatPage.svelte:60-68). The browser writes it, not the app, so anything can
 * be in there: bare text before the first <div>, pasted <span style>, nested
 * blocks, whole tables.
 *
 * Each block is a unit and keeps its exact HTML unless an edit replaces it. A line is editable only when everything in it has a spelling
 * in the line form. The rest is shown as plain text and marked read-only.
 *
 * The app renders this content with {@html}, so every character written here
 * is escaped and link targets are limited to http, https and mailto by the
 * inline parser.
 */

export type FlatData = { html: string }

const VOID = new Set(['br', 'img', 'hr', 'input', 'wbr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track'])
const BLOCK = new Set(['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'pre', 'blockquote', 'hr', 'section', 'article'])
const MARK_TAGS: Record<string, Mark> = { b: 'bold', strong: 'bold', i: 'italic', em: 'italic', strike: 'strike', s: 'strike', del: 'strike', code: 'code' }

const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g

const NAMED: Record<string, string> = { nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }

/** One pass, so "&amp;lt;" stays the text "&lt;" and is not decoded twice. */
const decode = (text: string) =>
  text
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|(nbsp|lt|gt|quot|apos|amp));/gi, (whole, dec?: string, hex?: string, name?: string) => {
      if (name) return NAMED[name.toLowerCase()]!
      const code = dec ? Number(dec) : parseInt(hex!, 16)
      // Not every number is a character. Such a reference is left as written.
      return code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole
    })
    .replace(/\u00a0/g, ' ')

const attribute = (attrs: string, name: string): string | null => {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'))
  return match ? decode(match[1] ?? match[2] ?? match[3] ?? '') : null
}

/** Splits content into top-level elements and the runs of text between them. */
function topLevel(html: string): { html: string; tag: string | null; attrs: string }[] {
  const parts: { html: string; tag: string | null; attrs: string }[] = []
  let runStart = 0
  let depth = 0
  let open: { at: number; tag: string; attrs: string } | null = null
  const flush = (end: number) => {
    if (end > runStart) parts.push({ html: html.slice(runStart, end), tag: null, attrs: '' })
  }
  for (const match of html.matchAll(TAG)) {
    const [whole, closing, rawName, attrs] = match
    if (!rawName) continue
    const name = rawName.toLowerCase()
    const at = match.index
    if (open) {
      if (VOID.has(name)) continue
      depth += closing ? -1 : 1
      if (depth === 0) {
        parts.push({ html: html.slice(open.at, at + whole.length), tag: open.tag, attrs: open.attrs })
        runStart = at + whole.length
        open = null
      }
    } else if (!closing && BLOCK.has(name)) {
      flush(at)
      if (VOID.has(name)) {
        parts.push({ html: whole, tag: name, attrs: attrs ?? '' })
        runStart = at + whole.length
      } else {
        open = { at, tag: name, attrs: attrs ?? '' }
        depth = 1
      }
    }
  }
  // An element that never closes keeps everything after it, untouched.
  if (open) parts.push({ html: html.slice(open.at), tag: open.tag, attrs: open.attrs })
  else flush(html.length)
  return parts
}

/** Inline HTML as tokens, or null when it holds something with no spelling. */
function toInline(html: string): Inline[] | null {
  const tokens: Inline[] = []
  const marks: Mark[] = []
  let anchor: { href: string; pageId: string | null; label: string } | null = null
  let at = 0
  const text = (raw: string) => {
    const value = decode(raw)
    if (!value) return
    if (anchor) anchor.label += value
    else tokens.push({ kind: 'text', text: value, marks: [...marks] })
  }
  for (const match of html.matchAll(TAG)) {
    text(html.slice(at, match.index))
    at = match.index + match[0].length
    const [, closing, rawName, attrs = ''] = match
    if (!rawName) continue
    const name = rawName.toLowerCase()
    // Anything inside a link other than its text has no spelling.
    if (anchor && !(closing && name === 'a')) return null
    if (name === 'br') tokens.push({ kind: 'break', marks: [...marks] })
    else if (name === 'img') {
      const src = attribute(attrs, 'src')
      if (!src) return null
      tokens.push({ kind: 'image', src, alt: attribute(attrs, 'alt') || null, title: attribute(attrs, 'title'), marks: [...marks] })
    } else if (name === 'a') {
      if (!closing) {
        const href = attribute(attrs, 'href')
        if (!href) return null
        anchor = { href, pageId: attribute(attrs, 'data-page-id'), label: '' }
      } else if (anchor) {
        tokens.push(
          anchor.pageId && /^\d+$/.test(anchor.pageId)
            ? { kind: 'pageLink', pageId: Number(anchor.pageId), pageName: anchor.label, marks: [...marks] }
            : { kind: 'link', href: anchor.href, label: anchor.label, marks: [...marks] },
        )
        anchor = null
      }
    } else if (MARK_TAGS[name] && !attrs.trim()) {
      const mark = MARK_TAGS[name]!
      if (!closing) marks.push(mark)
      else if (marks.includes(mark)) marks.splice(marks.lastIndexOf(mark), 1)
    } else return null
  }
  text(html.slice(at))
  return anchor ? null : tokens
}

/** Text only, one line per inner block, for units that cannot be edited. */
const plainLines = (html: string): string[] => {
  const lines = decode(html.replace(/<(br|\/div|\/p|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n').replace(TAG, ''))
    .split('\n')
    .map((l) => l.trimEnd())
  while (lines.length > 1 && !lines[lines.length - 1]) lines.pop()
  return lines
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** HTML collapses runs of spaces, so indentation and double spaces are kept
 *  with &nbsp;, the way the editor's own Tab key writes them. Only the ends of
 *  the line need it: a single space beside a tag renders fine as it is. */
const keepSpaces = (text: string, lineStart: boolean, lineEnd: boolean) => {
  let html = escapeHtml(text).replace(/ {2,}/g, (run) => ' ' + '&nbsp;'.repeat(run.length - 1))
  if (lineStart) html = html.replace(/^( |&nbsp;)+/, (run) => '&nbsp;'.repeat(run.replace(/&nbsp;/g, ' ').length))
  if (lineEnd) html = html.replace(/( |&nbsp;)+$/, (run) => '&nbsp;'.repeat(run.replace(/&nbsp;/g, ' ').length))
  return html
}

const TAG_FOR: Record<Mark, string> = { bold: 'b', italic: 'i', strike: 'strike', code: 'code' }
const quote = (value: string) => escapeHtml(value).replace(/"/g, '&quot;')

function toHtml(tokens: Inline[]): string {
  return tokens
    .map((token, index) => {
      let html: string
      if (token.kind === 'text') html = keepSpaces(token.text, index === 0, index === tokens.length - 1)
      else if (token.kind === 'break') html = '<br>'
      else if (token.kind === 'pageLink') {
        // The shape FlatPage.svelte:162-195 inserts. The API finds the link by
        // its data-page-id.
        html = `<a data-page-id="${token.pageId}" class="page-link" href="/page/${token.pageId}" target="_blank" contenteditable="false">${escapeHtml(token.pageName)}</a>`
      } else if (token.kind === 'link') {
        html = `<a href="${quote(token.href)}" target="_blank" contenteditable="false">${escapeHtml(token.label)}</a>`
      } else {
        const alt = token.alt ? ` alt="${quote(token.alt)}"` : ''
        const title = token.title ? ` title="${quote(token.title)}"` : ''
        html = `<img style="max-width: 100%" loading="lazy"${alt}${title} src="${quote(token.src)}">`
      }
      return [...token.marks].reverse().reduce((inner, mark) => `<${TAG_FOR[mark]}>${inner}</${TAG_FOR[mark]}>`, html)
    })
    .join('')
}

/** A written line as tokens. Tabs and non-breaking spaces become the spaces
 *  they are shown as, and a break that ends the line is dropped: HTML shows
 *  neither, and a line has to read back as it was written. */
function lineTokens(line: string): Inline[] {
  const tokens = parseInline(line.replace(/\t/g, '    ').replaceAll(String.fromCharCode(160), ' '), { links: true })
  while (tokens[tokens.length - 1]?.kind === 'break') tokens.pop()
  return tokens
}

/** Differences that are not differences: how a run of spaces is kept, and the
 *  semicolon the browser adds when it re-serialises the app's image style. */
const sameSpacing = (html: string) => html.replace(/&nbsp;/g, ' ').replace(/style="max-width: 100%;"/g, 'style="max-width: 100%"')

/** True when writing the line back would produce the HTML it came from, give
 *  or take how spaces are kept. That is what makes a line safe to hand out for
 *  editing: an attribute, a nesting or an address the line form would lose
 *  shows up here as a difference. */
function reproduces(line: string, html: string): boolean {
  try {
    return !line.includes('\n') && sameSpacing(toHtml(lineTokens(line))) === sameSpacing(html)
  } catch {
    return false
  }
}

/**
 * One line's worth of the app's contenteditable HTML as a line, or null when
 * the line form would lose something in it. Table cells hold the same HTML, so
 * they are read and written through these three as well.
 */
export function htmlToLine(html: string): string | null {
  // The browser ends an otherwise empty or trailing line with a <br>.
  const shown = html.replace(/<br>$/i, '')
  const tokens = toInline(shown)
  const line = tokens && renderInline(tokens)
  return line !== null && reproduces(line, shown) ? line : null
}

export const lineToHtml = (line: string): string => toHtml(lineTokens(line))

/** Text only, for HTML the line form cannot express. */
export const htmlToText = (html: string): string => plainLines(html).join('\n')

function toUnit(part: { html: string; tag: string | null; attrs: string }): Unit<FlatData> {
  const data = { html: part.html }
  if (part.tag === null && !part.html.trim()) return { lines: [], data }

  const plainDiv = part.tag === 'div' && !part.attrs.trim()
  if (part.tag === null || plainDiv) {
    const inner = plainDiv ? part.html.replace(/^<div>/i, '').replace(/<\/div>$/i, '') : part.html
    const line = htmlToLine(inner)
    if (line !== null) return { lines: [line], data }
  }
  const lines = plainLines(part.html)
  return { lines: lines.length ? lines : [''], readOnly: part.tag === 'table' ? 'a table' : 'formatting the line form cannot express', data }
}

/** A plain <div> holding other blocks is a wrapper, not a line. Browsers
 *  produce one around a whole page, or around everything after the first line,
 *  so its children are the lines. The wrapper's own tags become units with no
 *  lines, which keeps them in place and out of reach of an edit. */
function unitsOf(html: string): Unit<FlatData>[] {
  return topLevel(html).flatMap((part) => {
    const wrapper = part.tag === 'div' && !part.attrs.trim() ? part.html.match(/^(<div\s*>)([\s\S]*)(<\/div\s*>)$/i) : null
    // Lazily: on a wrapped page the first tag inside already answers it.
    const holdsBlocks = wrapper && wrapper[2]!.matchAll(TAG).some((m) => Boolean(m[2] && !m[1] && BLOCK.has(m[2].toLowerCase())))
    if (!wrapper || !holdsBlocks) return [toUnit(part)]
    return [{ lines: [], data: { html: wrapper[1]! } }, ...unitsOf(wrapper[2]!), { lines: [], data: { html: wrapper[3]! } }]
  })
}

export const flatCodec: LineCodec<FlatData> = {
  read: (content) => unitsOf(content ?? ''),

  parse: (lines) =>
    lines.map((line) => {
      const tokens = lineTokens(line)
      return { lines: [renderInline(tokens)], data: { html: `<div>${toHtml(tokens) || '<br>'}</div>` } }
    }),

  write: (units) => units.map((u) => u.data.html).join(''),
}
