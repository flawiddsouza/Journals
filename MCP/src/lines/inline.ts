/**
 * The text form of one line's inline content, shared by every document page
 * type. It is Markdown's inline syntax, plus [[Page name|id]] for page links
 * and <br> for a line break inside a block.
 *
 * Rendering escapes every character the parser would read as markup, so text
 * that merely looks like markup survives a round trip unchanged.
 */

export class CodecError extends Error {}

/** In the order the editor's schema ranks them, which is the order it stores. */
export const MARKS = ['bold', 'code', 'italic', 'strike'] as const
export type Mark = (typeof MARKS)[number]

export type Inline =
  | { kind: 'text'; text: string; marks: Mark[] }
  | { kind: 'pageLink'; pageId: number; pageName: string; marks: Mark[] }
  | { kind: 'link'; href: string; label: string; marks: Mark[] }
  | { kind: 'image'; src: string; alt: string | null; title: string | null; marks: Mark[] }
  | { kind: 'break'; marks: Mark[] }

const DELIMITER: Record<Mark, string> = { bold: '**', italic: '*', strike: '~~', code: '`' }

const sortMarks = (marks: Iterable<Mark>): Mark[] => {
  const set = new Set(marks)
  return MARKS.filter((m) => set.has(m))
}

const escapeText = (text: string) =>
  text
    .replace(/[\\*`[]/g, '\\$&')
    .replace(/~(?=~)/g, '\\~')
    .replace(/<(?=br>)/g, '\\<')

const escapeWithin = (text: string, closers: RegExp) => escapeText(text).replace(closers, '\\$&')

export function renderInline(tokens: Inline[]): string {
  let out = ''
  let open: Mark[] = []
  const moveTo = (marks: Mark[]) => {
    for (const mark of [...open].reverse()) if (!marks.includes(mark)) out += DELIMITER[mark]
    for (const mark of marks) if (!open.includes(mark)) out += DELIMITER[mark]
    open = marks
  }

  for (const token of tokens) {
    // Code spans are raw, so nothing else can be open across one.
    const code = token.kind === 'text' && token.marks.includes('code')
    moveTo(code ? [] : sortMarks(token.marks))
    if (token.kind === 'text') out += code ? `\`${token.text}\`` : escapeText(token.text)
    else if (token.kind === 'break') out += '<br>'
    else if (token.kind === 'pageLink') out += `[[${escapeWithin(token.pageName, /[|\]]/g)}|${token.pageId}]]`
    else if (token.kind === 'link') out += `[${escapeWithin(token.label, /\]/g)}](${token.href})`
    else {
      const title = token.title === null ? '' : ` "${token.title}"`
      out += `![${escapeWithin(token.alt ?? '', /\]/g)}](${token.src}${title})`
    }
  }
  moveTo([])
  return out
}

const LINK_TARGET = /^(https?:\/\/|mailto:)/i
const IMAGE_TARGET = /^https?:\/\//i

type Piece = { at: number; length: number } & (
  | { type: 'delimiter'; mark: Mark }
  | { type: 'token'; token: Inline }
  | { type: 'char'; char: string }
)

/** Reads `text\]more` up to an unescaped closer. Returns the unescaped text and
 *  the index of the closer, or null when there is none. */
function readUntil(source: string, from: number, closer: string): { text: string; end: number } | null {
  let text = ''
  for (let i = from; i < source.length; i++) {
    if (source[i] === '\\' && i + 1 < source.length) text += source[++i]
    else if (source.startsWith(closer, i)) return { text, end: i }
    else text += source[i]
  }
  return null
}

export function parseInline(source: string, options: { links: boolean }): Inline[] {
  const pieces: Piece[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]!
    const rest = source.slice(i)

    if (ch === '\\' && i + 1 < source.length && /[!-/:-@[-`{-~]/.test(source[i + 1]!)) {
      pieces.push({ at: i, length: 2, type: 'char', char: source[i + 1]! })
      i += 2
      continue
    }
    if (rest.startsWith('<br>')) {
      pieces.push({ at: i, length: 4, type: 'token', token: { kind: 'break', marks: [] } })
      i += 4
      continue
    }
    if (ch === '`') {
      const close = source.indexOf('`', i + 1)
      if (close > i + 1) {
        const token: Inline = { kind: 'text', text: source.slice(i + 1, close), marks: ['code'] }
        pieces.push({ at: i, length: close + 1 - i, type: 'token', token })
        i = close + 1
        continue
      }
    }
    if (options.links) {
      const token = readLink(source, i)
      if (token) {
        pieces.push({ at: i, length: token.length, type: 'token', token: token.token })
        i += token.length
        continue
      }
    }
    const delimiter = rest.startsWith('**') ? 'bold' : ch === '*' ? 'italic' : rest.startsWith('~~') ? 'strike' : null
    if (delimiter) {
      const length = DELIMITER[delimiter].length
      // "2 * 3" is arithmetic, not emphasis.
      const spaced = /\s/.test(source[i - 1] ?? 'x') && /\s/.test(source[i + length] ?? 'x')
      if (!spaced) {
        pieces.push({ at: i, length, type: 'delimiter', mark: delimiter })
        i += length
        continue
      }
    }
    pieces.push({ at: i, length: 1, type: 'char', char: ch })
    i++
  }

  // A delimiter with no partner is literal text. With an odd count it is the
  // last one that has nothing to close.
  for (const mark of MARKS) {
    const found = pieces.filter((p) => p.type === 'delimiter' && p.mark === mark)
    const orphan = found.length % 2 ? found[found.length - 1] : undefined
    if (orphan) Object.assign(orphan, { type: 'char', char: DELIMITER[mark] })
  }

  const tokens: Inline[] = []
  const active = new Set<Mark>()
  for (const piece of pieces) {
    if (piece.type === 'delimiter') {
      if (active.has(piece.mark)) active.delete(piece.mark)
      else active.add(piece.mark)
      continue
    }
    const marks = sortMarks(active)
    if (piece.type === 'token') {
      const code = piece.token.kind === 'text' && piece.token.marks.includes('code')
      tokens.push({ ...piece.token, marks: code ? ['code'] : marks })
      continue
    }
    const last = tokens[tokens.length - 1]
    if (last?.kind === 'text' && !last.marks.includes('code') && last.marks.join() === marks.join()) {
      last.text += piece.char
    } else {
      tokens.push({ kind: 'text', text: piece.char, marks })
    }
  }
  return tokens
}

function readLink(source: string, at: number): { token: Inline; length: number } | null {
  if (source.startsWith('[[', at)) {
    const inner = readUntil(source, at + 2, ']]')
    if (!inner) return null
    const raw = source.slice(at + 2, inner.end)
    const split = raw.match(/^((?:\\.|[^\\|])*)\|(\d+)$/)
    if (!split) {
      throw new CodecError(
        `Page links are written [[Page name|id]], with the id from list_pages. Got [[${raw}]]. To write those brackets as text, escape them: \\[\\[`,
      )
    }
    const pageName = readUntil(split[1]! + '|', 0, '|')!.text
    return {
      token: { kind: 'pageLink', pageId: Number(split[2]), pageName, marks: [] },
      length: inner.end + 2 - at,
    }
  }

  const image = source[at] === '!' && source[at + 1] === '['
  if (source[at] !== '[' && !image) return null
  const labelStart = at + (image ? 2 : 1)
  const label = readUntil(source, labelStart, ']')
  if (!label || source[label.end + 1] !== '(') return null
  const close = source.indexOf(')', label.end + 2)
  if (close < 0) return null
  const target = source.slice(label.end + 2, close)
  const length = close + 1 - at

  if (image) {
    const parts = target.match(/^(\S+)(?: "(.*)")?$/)
    if (!parts) return null
    if (!IMAGE_TARGET.test(parts[1]!)) throw new CodecError(`Image addresses must start with http:// or https://. Got ${parts[1]}. To write it as text instead, escape the bracket: !\\[`)
    return { token: { kind: 'image', src: parts[1]!, alt: label.text || null, title: parts[2] ?? null, marks: [] }, length }
  }
  if (!target || /\s/.test(target)) return null
  if (!LINK_TARGET.test(target)) throw new CodecError(`Link addresses must start with http://, https:// or mailto:. Got ${target}. To write it as text instead, escape the bracket: \\[`)
  return { token: { kind: 'link', href: target, label: label.text, marks: [] }, length }
}

/** Plain text of a line, for blocks that are shown but cannot be edited. */
export const inlineText = (tokens: Inline[]): string =>
  tokens
    .map((t) =>
      t.kind === 'text' ? t.text : t.kind === 'break' ? ' ' : t.kind === 'pageLink' ? t.pageName : t.kind === 'link' ? t.label : (t.alt ?? 'image'),
    )
    .join('')
