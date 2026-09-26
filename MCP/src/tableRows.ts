import { evaluateScript } from './evaluate'
import { htmlToLine, htmlToText, lineToHtml } from './lines/flat'
import { CodecError } from './lines/inline'
import { type TableDocument, isComputed } from './tableDoc'

/**
 * Reading and changing the rows of a Table page.
 *
 * A cell is the innerHTML of a contenteditable (tableCellEditor.js:52), the
 * same HTML a Flat Page line holds, so cells go through the same line form:
 * plain text with **bold**, [label](address) and [[Page name|id]]. A row is
 * keyed by column name and carries every column but the computed ones, as
 * emptyRow() in Table.svelte:636 makes it.
 */

export type CellValue = string | number | boolean | null
export type RowValues = Record<string, CellValue>

export const cellText = (html: unknown): string => {
  const source = String(html ?? '')
  return htmlToLine(source) ?? htmlToText(source)
}

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
    .filter((index) => !needle || stored.some((c) => cellText(doc.items[index]?.[c.name]).toLowerCase().includes(needle)))

  const limit = options.limit ?? 100
  const start = options.start ?? 0
  const from = Math.min(Math.max(0, start < 0 ? matching.length + start : start), matching.length)
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
    start: from,
    rows: window.map((index) => ({
      row: index,
      values: Object.fromEntries(
        shown.map((c) => [c.name, isComputed(c) ? (computed.get(c.name)?.get(index) ?? '') : cellText(doc.items[index]?.[c.name])]),
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
 * Applies one batch to the document in place. Every row number means the table
 * as it was read, whatever else the batch does: updates land first, then
 * removals, then the new rows go in.
 */
export function editRows(doc: TableDocument, edit: RowEdit): { updated: number; removed: number; added: number; firstAdded: number | null } {
  const count = doc.items.length
  const inRange = (row: number, what: string) => {
    if (!Number.isInteger(row) || row < 0 || row >= count) {
      throw new CodecError(`${what} ${row} does not exist. Rows are numbered 0 to ${count - 1}, as get_table_rows reports them.`)
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
  if (edit.addBefore !== undefined && edit.addBefore !== count) inRange(edit.addBefore, 'addBefore row')
  const updates = update.map(({ row, values }) => ({ row, cells: toCells(doc, values) }))
  const additions = add.map((values) => ({
    ...emptyRow(doc),
    ...toCells(doc, values),
  }))

  for (const { row, cells } of updates) doc.items[row] = { ...doc.items[row], ...cells }

  const removing = new Set(remove)
  // A new table is one blank row, which is the app's placeholder and not data.
  // Rows added to it take its place instead of landing under a gap.
  const blank = (row: Record<string, string> | undefined) => Object.values(row ?? {}).every((cell) => !cellText(cell))
  if (additions.length && count === 1 && blank(doc.items[0])) removing.add(0)
  const at = edit.addBefore ?? count
  const insertAt = at - [...removing].filter((row) => row < at).length
  doc.items = doc.items.filter((_, index) => !removing.has(index))
  doc.items.splice(insertAt, 0, ...additions)

  // The app never leaves a table without a row (Table.svelte:667).
  if (!doc.items.length) doc.items.push(emptyRow(doc))

  return { updated: updates.length, removed: remove.length, added: additions.length, firstAdded: additions.length ? insertAt : null }
}
