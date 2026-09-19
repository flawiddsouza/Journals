import { CodecError } from './lines/inline'
import { type TableColumn, type TableDocument, isComputed } from './tableDoc'

/**
 * Adding, changing, removing and ordering the columns of a Table page, the way
 * addColumn, updateColumn and deleteColumn in Table.svelte:859-996 do it, with
 * two differences: a rename carries the column's total and width along, which
 * the app drops, and a removal takes them away, which the app leaves behind.
 *
 * Option values are the ones the app stores, so they match what
 * get_table_config shows: '' is always the default.
 */

export const COLUMN_OPTIONS = {
  wrap: ['', 'No'],
  align: ['', 'Center', 'Right'],
  type: ['', 'Input (Plain Text)'],
  autocomplete: ['', 'Yes'],
  filterable: ['', 'Yes'],
} as const

export type ColumnOptions = {
  label?: string
  wrap?: '' | 'No'
  align?: '' | 'Center' | 'Right'
  type?: '' | 'Input (Plain Text)'
  autocomplete?: '' | 'Yes'
  filterable?: '' | 'Yes'
  width?: string
}

export type ColumnEdit = {
  update?: ({ column: string; name?: string } & ColumnOptions)[]
  remove?: string[]
  add?: ({ name: string; before?: string } & ColumnOptions)[]
  order?: string[]
}

/** The app writes the width into a style attribute as it is, so it has to be a
 *  length and nothing more. */
const WIDTH = /^\d+(\.\d+)?(px|em|rem|ch|%|vw)$/

function checkName(name: string, taken: string[]): string {
  const clean = name.trim()
  if (!clean) throw new CodecError("A column name can't be empty")
  if (/[\r\n]/.test(clean)) throw new CodecError('A column name is one line')
  // Rows are plain objects keyed by column name.
  if (clean === '__proto__') throw new CodecError('__proto__ cannot be a column name')
  if (taken.includes(clean)) throw new CodecError(`There is already a column named ${clean}`)
  return clean
}

function setWidth(doc: TableDocument, name: string, width: string | undefined): void {
  if (width === undefined) return
  if (width !== '' && !WIDTH.test(width)) throw new CodecError(`A width is a number and a unit, like 120px or 12em. Got "${width}". An empty width means automatic.`)
  const widths = { ...(doc.widths ?? {}) }
  if (width) widths[name] = width
  else delete widths[name]
  doc.widths = widths
}

const moveKey = (map: Record<string, string> | undefined, from: string, to: string | null) => {
  if (!map || !(from in map)) return map
  const { [from]: value, ...rest } = map
  return to === null ? rest : { ...rest, [to]: value! }
}

/** Every script on the page that mentions a column name, so a rename or a
 *  removal can say what probably needs fixing. Scripts read a column as
 *  item['Name'], and nothing renames that for them. */
function mentions(doc: TableDocument, name: string): string[] {
  const found: string[] = []
  const has = (code: string | undefined) => Boolean(code && code.includes(name))
  for (const column of doc.columns) {
    if (has(column.expression)) found.push(`computed ${column.name}`)
    if (has(column.style)) found.push(`colStyle ${column.name}`)
  }
  for (const [column, code] of Object.entries(doc.totals ?? {})) if (has(code)) found.push(`total ${column}`)
  if (has(doc.rowStyle)) found.push('rowStyle')
  if (has(doc.startupScript)) found.push('startup')
  if (has(doc.customFunctions)) found.push('customFns')
  for (const widget of doc.stats?.widgets ?? []) if (has(widget.expression)) found.push(`statsWidget ${widget.id}`)
  return found
}

/**
 * Applies one batch to the document in place: updates and renames first, then
 * removals, then new columns, then the order. `update`, `remove` and `before`
 * name columns as they were read; `order` names them as the batch leaves them.
 */
export function editColumns(doc: TableDocument, edit: ColumnEdit): { columns: string[]; scriptsToCheck: { column: string; change: string; mentionedIn: string[] }[] } {
  const update = edit.update ?? []
  const remove = [...new Set(edit.remove ?? [])]
  const add = edit.add ?? []
  if (!update.length && !remove.length && !add.length && !edit.order) throw new CodecError('Nothing to change: pass update, remove, add or order')

  // Worked out on a copy, so a batch that fails half way changes nothing.
  const next: TableDocument = JSON.parse(JSON.stringify(doc))
  const missing = (name: string) => new CodecError(`No column named ${name}. This table has: ${doc.columns.map((c) => c.name).join(', ') || 'no columns yet'}`)
  const find = (name: string) => {
    const column = next.columns.find((c) => c.name === name)
    if (!column) throw missing(name)
    return column
  }
  // What each column the table was read with is called now.
  const original = new Map(doc.columns.map((c) => [c.name, c.name]))
  const nowCalled = (name: string) => {
    const current = original.get(name)
    if (current === undefined) throw missing(name)
    return current
  }
  const scriptsToCheck: { column: string; change: string; mentionedIn: string[] }[] = []
  const note = (column: string, change: string) => {
    const mentionedIn = mentions(doc, column)
    if (mentionedIn.length) scriptsToCheck.push({ column, change, mentionedIn })
  }

  for (const { column: name, name: renamed, width, ...options } of update) {
    const column = find(nowCalled(name))
    if (options.type !== undefined && isComputed(column)) {
      // Back to a stored column: without its expression it holds what is typed.
      delete column.expression
    }
    Object.assign(column, options)
    if (renamed !== undefined && renamed.trim() !== column.name) {
      const to = checkName(renamed, next.columns.filter((c) => c !== column).map((c) => c.name))
      const from = column.name
      for (const item of next.items) {
        item[to] = item[from] ?? ''
        delete item[from]
      }
      next.totals = moveKey(next.totals, from, to)
      next.widths = moveKey(next.widths, from, to)
      if (options.label === undefined && column.label === from) column.label = to
      column.name = to
      original.set(name, to)
      note(name, `renamed to ${to}`)
    }
    setWidth(next, column.name, width)
  }

  for (const name of remove) {
    const current = nowCalled(name)
    next.columns = next.columns.filter((c) => c.name !== current)
    for (const item of next.items) delete item[current]
    next.totals = moveKey(next.totals, current, null)
    next.widths = moveKey(next.widths, current, null)
    note(name, 'removed')
  }

  for (const { name, before, width, ...options } of add) {
    const clean = checkName(name, next.columns.map((c) => c.name))
    const column: TableColumn = { name: clean, label: clean, wrap: '', align: '', type: '', autocomplete: '', filterable: '', ...options }
    if (!column.label) column.label = clean
    const at = before === undefined ? next.columns.length : next.columns.indexOf(find(original.get(before) ?? before))
    next.columns.splice(at, 0, column)
    // Every row carries every column, and a table always has a row.
    if (!next.items.length) next.items.push({})
    for (const item of next.items) item[clean] = ''
    setWidth(next, clean, width)
  }

  if (edit.order) {
    const names = next.columns.map((c) => c.name)
    const same = edit.order.length === names.length && new Set(edit.order).size === names.length && edit.order.every((n) => names.includes(n))
    if (!same) throw new CodecError(`order has to list every column exactly once. After this change the columns are: ${names.join(', ')}`)
    next.columns = edit.order.map((n) => next.columns.find((c) => c.name === n)!)
  }

  Object.assign(doc, next)
  return { columns: doc.columns.map((c) => c.name), scriptsToCheck }
}
