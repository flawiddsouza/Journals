import { evaluateScript } from './evaluate'
import { htmlToLine, htmlToText, lineToHtml } from './lines/flat'
import { CodecError } from './lines/inline'
import { type TableColumn, type TableDocument, isComputed } from './tableDoc'

/**
 * Reading and changing the rows of a Table page.
 *
 * A cell is the innerHTML of a contenteditable (tableCellEditor.js:52), the
 * same HTML a Flat Page line holds, so cells go through the same line form:
 * plain text with **bold**, [label](address) and [[Page name|id]]. A row is
 * keyed by column name and carries every column but the computed ones, as
 * emptyRow() in Table.svelte:636 makes it.
 *
 * An "Input (Plain Text)" column is the exception. The app edits it as
 * contenteditable="plaintext-only", so a cell holds escaped text with real line
 * breaks and no markup, and its scripts split it on "\n". Those cells are read
 * and written as that text.
 *
 * Rows are numbered from 1, as the app and the page history number them.
 */

export type CellValue = string | number | boolean | null
export type RowValues = Record<string, CellValue>

export const cellText = (html: unknown): string => {
  const source = String(html ?? '')
  return htmlToLine(source) ?? htmlToText(source)
}

const isPlainText = (column: TableColumn) => column.type === 'Input (Plain Text)'

export const columnText = (column: TableColumn, html: unknown) => (isPlainText(column) ? htmlToText(String(html ?? '')) : cellText(html))

// The HTML the app's plaintext-only editor leaves: the text escaped, line breaks
// kept as they are. A <br> written in the line form's way is a line break too.
const plainTextToHtml = (text: string) =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

export type ReadOptions = {
  start?: number
  limit?: number
  search?: string
  columns?: string[]
  totals?: boolean
}

export function readRows(doc: TableDocument, options: ReadOptions) {
  const known = doc.columns.map((c) => c.name)
  for (const name of options.columns ?? []) assertColumn(doc, name)
  const shown = doc.columns.filter((c) => !options.columns || options.columns.includes(c.name))
  const stored = doc.columns.filter((c) => !isComputed(c))

  // Search looks at what is stored. Computed values would mean running every
  // expression over every row just to filter.
  const needle = options.search?.trim().toLowerCase()
  const matching = doc.items
    .map((_, index) => index)
    .filter((index) => !needle || stored.some((c) => columnText(c, doc.items[index]?.[c.name]).toLowerCase().includes(needle)))

  const limit = options.limit ?? 100
  // start counts from 1, or from the end when negative.
  const start = options.start ?? 1
  const from = Math.min(Math.max(0, start < 0 ? matching.length + start : start - 1), matching.length)
  const window = matching.slice(from, from + limit)

  const computed = new Map<string, Map<number, string>>()
  for (const column of shown.filter(isComputed)) {
    // Only the rows being returned are evaluated. A computed column they read
    // is still resolved for whichever rows the expression reaches.
    const result = evaluateScript(doc, 'computed', column.expression ?? '', column.name, {
      onlyRows: window,
      rows: window,
      rowCap: doc.items.length,
      timeoutMs: 2000,
    })
    const values = new Map(result.sample.map((s) => [s.rowIndex, htmlToText(s.output)]))
    for (const error of result.errors) values.set(error.rowIndex, `#ERROR ${error.message}`)
    if (result.timedOut || !result.compiled) for (const index of window) values.set(index, `#ERROR ${result.errors[0]?.message ?? 'did not run'}`)
    computed.set(column.name, values)
  }

  const totals = options.totals
    ? Object.fromEntries(
        Object.entries(doc.totals ?? {})
          .filter(([name, code]) => code && known.includes(name))
          .map(([name, code]) => {
            const result = evaluateScript(doc, 'total', code, name, { rowCap: doc.items.length, timeoutMs: 2000 })
            return [name, result.sample[0] ? htmlToText(result.sample[0].output) : `#ERROR ${result.errors[0]?.message ?? 'did not run'}`]
          }),
      )
    : undefined

  return {
    rowCount: doc.items.length,
    ...(needle ? { matched: matching.length } : {}),
    columns: doc.columns.map((c) => ({ name: c.name, ...(isComputed(c) ? { computed: true } : {}) })),
    start: from + 1,
    rows: window.map((index) => ({
      row: index + 1,
      values: Object.fromEntries(
        shown.map((c) => [c.name, isComputed(c) ? (computed.get(c.name)?.get(index) ?? '') : columnText(c, doc.items[index]?.[c.name])]),
      ),
    })),
    ...(totals ? { totals } : {}),
  }
}

function assertColumn(doc: TableDocument, name: string) {
  if (!doc.columns.some((c) => c.name === name)) {
    const has = doc.columns.length ? `This table has: ${doc.columns.map((c) => c.name).join(', ')}` : 'This table has no columns yet. Add them with edit_table_columns.'
    throw new CodecError(`No column named ${name}. ${has}`)
  }
}

function toCells(doc: TableDocument, values: RowValues): Record<string, string> {
  const cells: Record<string, string> = {}
  for (const [name, value] of Object.entries(values)) {
    assertColumn(doc, name)
    const column = doc.columns.find((c) => c.name === name)!
    if (isComputed(column)) {
      throw new CodecError(`${name} is a computed column, so it has no stored value to set. Change what it shows with set_table_script.`)
    }
    const text = value === null ? '' : String(value)
    if (isPlainText(column)) {
      cells[name] = plainTextToHtml(text)
      continue
    }
    if (/[\r\n]/.test(text)) throw new CodecError(`A cell value is one line. Use <br> for a line break inside the cell ${name}.`)
    cells[name] = lineToHtml(text)
  }
  return cells
}

export type RowEdit = {
  update?: { row: number; values: RowValues }[]
  remove?: number[]
  add?: RowValues[]
  addBefore?: number
}

// A computed column's value comes from its expression, so rows hold no key for it.
const emptyRow = (doc: TableDocument) =>
  Object.fromEntries(doc.columns.filter((c) => c.type !== 'Computed').map((c) => [c.name, '']))

/**
 * Applies one batch to the document in place. Row numbers count from 1, and
 * every one means the table as it was read, whatever else the batch does:
 * updates land first, then removals, then the new rows go in.
 */
export function editRows(doc: TableDocument, edit: RowEdit): { updated: number; removed: number; added: number; firstAdded: number | null } {
  const count = doc.items.length
  const inRange = (row: number, what: string) => {
    if (!Number.isInteger(row) || row < 1 || row > count) {
      throw new CodecError(`${what} ${row} does not exist. Rows are numbered 1 to ${count}, as get_table_rows reports them.`)
    }
  }
  const update = edit.update ?? []
  const remove = [...new Set(edit.remove ?? [])]
  const add = edit.add ?? []
  if (!update.length && !remove.length && !add.length) throw new CodecError('Nothing to change: pass update, remove or add')
  if (edit.addBefore !== undefined && !add.length) throw new CodecError('addBefore only means something with add')

  // Everything is checked before anything changes, so a bad batch changes nothing.
  for (const { row } of update) inRange(row, 'Row')
  for (const row of remove) inRange(row, 'Row')
  // One past the last row adds at the bottom, as leaving addBefore out does.
  if (edit.addBefore !== undefined && edit.addBefore !== count + 1) inRange(edit.addBefore, 'addBefore row')
  const updates = update.map(({ row, values }) => ({ row: row - 1, cells: toCells(doc, values) }))
  const additions = add.map((values) => ({
    ...emptyRow(doc),
    ...toCells(doc, values),
  }))

  for (const { row, cells } of updates) doc.items[row] = { ...doc.items[row], ...cells }

  const removing = new Set(remove.map((row) => row - 1))
  // A new table is one blank row, which is the app's placeholder and not data.
  // Rows added to it take its place instead of landing under a gap.
  const blank = (row: Record<string, string> | undefined) => Object.values(row ?? {}).every((cell) => !cellText(cell))
  if (additions.length && count === 1 && blank(doc.items[0])) removing.add(0)
  const at = edit.addBefore === undefined ? count : edit.addBefore - 1
  const insertAt = at - [...removing].filter((row) => row < at).length
  doc.items = doc.items.filter((_, index) => !removing.has(index))
  doc.items.splice(insertAt, 0, ...additions)

  // The app never leaves a table without a row (Table.svelte:667).
  if (!doc.items.length) doc.items.push(emptyRow(doc))

  return { updated: updates.length, removed: remove.length, added: additions.length, firstAdded: additions.length ? insertAt + 1 : null }
}
