import { CodecError } from './inline'

/**
 * A page as numbered lines, and one edit against them.
 *
 * A unit is the smallest piece that can be replaced on its own: a top-level
 * block, or one top-level list item with everything nested under it. An edit
 * re-parses only the units it touches. Every other unit is written back
 * exactly as it was read, which is what keeps table widths, alignment and
 * pasted formatting intact.
 */

export type Unit<T> = {
  /** What the agent sees. May be empty, for whitespace between blocks. */
  lines: string[]
  /** Set when the unit cannot be reproduced from its lines. The value is the
   *  reason, worded to follow "lines 4-9 are". */
  readOnly?: string
  /** True when an indented line after this unit would nest under it. */
  nestable?: boolean
  data: T
}

export type LineCodec<T> = {
  read(content: string | null): Unit<T>[]
  parse(lines: string[]): Unit<T>[]
  /** Must produce loadable content even for no units at all. */
  write(units: Unit<T>[]): string
}

/** `after` inserts below that line, 0 meaning the top. Otherwise lines
 *  start..end, inclusive and 1-based, are replaced. */
export type LineEdit = { start: number; end: number; lines: string[] } | { after: number; lines: string[] }

export const linesOf = <T>(units: Unit<T>[]) => units.flatMap((u) => u.lines)

export function applyLineEdit<T>(
  codec: LineCodec<T>,
  units: Unit<T>[],
  edit: LineEdit,
): { content: string; lines: string[]; changed: { start: number; end: number } } {
  const total = linesOf(units).length
  // An insert is a replace of the empty range just below `after`.
  const start = 'after' in edit ? edit.after + 1 : edit.start
  const end = 'after' in edit ? edit.after : edit.end
  if ('after' in edit) {
    if (edit.after < 0 || edit.after > total) {
      throw new CodecError(`after must be between 0 and ${total}, the number of lines on the page`)
    }
  } else if (!total) {
    // "1 <= start <= end <= 0" is arithmetic, not an answer.
    throw new CodecError('This page has no lines yet, so there is nothing to replace. Write the first lines with after: 0.')
  } else if (start < 1 || end > total || end < start) {
    throw new CodecError(`start and end must satisfy 1 <= start <= end <= ${total}, the number of lines on the page`)
  }

  // Where each unit's lines begin, 1-based.
  const first: number[] = []
  let line = 1
  for (const unit of units) {
    first.push(line)
    line += unit.lines.length
  }
  const last = (i: number) => first[i]! + units[i]!.lines.length - 1

  // For an insert this finds the one unit the insertion point falls inside, if
  // any. Between two units it finds nothing.
  const touched = units.map((_, i) => i).filter((i) => units[i]!.lines.length > 0 && first[i]! <= end && last(i) >= start)
  let from: number
  let to: number
  if (touched.length) {
    from = touched[0]!
    to = touched[touched.length - 1]! + 1
  } else {
    from = units.findIndex((_, i) => first[i]! >= start)
    if (from < 0) from = units.length
    to = from
  }

  const span = linesOf(units.slice(from, to))
  const offset = touched.length ? start - first[from]! : 0
  let text = [...span.slice(0, offset), ...edit.lines, ...span.slice(offset + (end - start + 1))]

  let replacement: Unit<T>[]
  if (touched.length && text.length === 0) {
    // Removing whole units needs no parsing, so it works on read-only ones too.
    replacement = []
  } else {
    for (const i of touched) {
      if (!units[i]!.readOnly) continue
      throw new CodecError(
        `Lines ${first[i]}-${last(i)} are ${units[i]!.readOnly}, which this tool can show but not rewrite. Edit around them, or remove them by replacing exactly lines ${first[i]}-${last(i)} with empty text.`,
      )
    }
    // An indented first line means "under the item above", so that item has to
    // be parsed together with it.
    const above = units[from - 1]
    if (offset === 0 && /^\s/.test(text[0] ?? '') && above?.nestable && !above.readOnly) {
      from--
      text = [...above.lines, ...text]
    }
    replacement = codec.parse(text)
  }

  const next = [...units.slice(0, from), ...replacement, ...units.slice(to)]
  const content = codec.write(next)

  // What was written must read back as exactly the lines intended. This is the
  // guard against a codec bug quietly rearranging a page. A page emptied
  // entirely is the exception: it reads back as the type's blank page.
  // Ordered list numbers are compared loosely, because items below an insert
  // are renumbered without having been touched.
  const expected = linesOf(next)
  const actual = linesOf(codec.read(content))
  const loose = (l: string) => l.replace(/^\d+\. /, '#. ')
  if (expected.length && (expected.length !== actual.length || expected.some((l, i) => loose(l) !== loose(actual[i]!)))) {
    throw new Error('line edit did not read back as written')
  }

  const changedStart = linesOf(units.slice(0, from)).length + 1
  return {
    content,
    lines: actual,
    changed: { start: changedStart, end: changedStart + linesOf(replacement).length - 1 },
  }
}
