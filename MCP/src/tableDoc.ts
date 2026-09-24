/**
 * The Table page document, and the column profiling that replaces shipping
 * rows to the agent.
 *
 * Shape verified against real page content and Table.svelte. Empty string is
 * the default for every column option, never null (Table.svelte:1848-1875).
 */

export type TableColumn = {
  name: string
  label?: string
  wrap?: '' | 'No'
  align?: '' | 'Center' | 'Right'
  type?: '' | 'Input (Plain Text)' | 'Computed'
  expression?: string
  style?: string
  autocomplete?: '' | 'Yes'
  filterable?: '' | 'Yes'
}

export type StatsWidget = {
  id: string
  title: string
  type: 'stat' | 'bar' | 'line' | 'pie'
  colSpan?: number
  align?: string
  expression: string
}

export type TableDocument = {
  columns: TableColumn[]
  /** Rows keyed by column *name*, not index. Values are HTML strings. */
  items: Record<string, string>[]
  totals?: Record<string, string>
  widths?: Record<string, string>
  rowStyle?: string
  startupScript?: string
  /** Run only when the person presses Pull, and saved only after they have
   *  seen its diff (TablePullModal.svelte). */
  pullScript?: string
  customFunctions?: string
  note?: string
  stats?: { widgets?: StatsWidget[] }
}

/** Opening a table in the app runs its startup script, and the app saves the
 *  rows back when the script changed them (Table.svelte:175-186). So a page
 *  with one can move on from what was read without anyone editing it, and a
 *  refused save should say so rather than look inexplicable. */
export const startupHint = (doc: TableDocument): string =>
  doc.startupScript?.trim()
    ? 'This table has a startup script: the app runs it when the page is opened and saves the rows it changes, so viewing the page alone can move the revision on.'
    : ''

export function parseTableDocument(content: string | null): TableDocument {
  // A never-saved page is the document the app itself starts from
  // (Table.svelte:147-158). Every key is there because a save writes this back.
  if (!content) {
    return { columns: [], items: [], totals: {}, widths: {}, rowStyle: '', startupScript: '', pullScript: '', customFunctions: '', note: '' }
  }
  const parsed = JSON.parse(content) as TableDocument
  return {
    ...parsed,
    columns: parsed.columns ?? [],
    items: parsed.items ?? [],
    // The app reads totals with no fallback and then walks its keys
    // (Table.svelte:161, 263), so a document without it does not load.
    totals: parsed.totals ?? {},
  }
}

/** Cells hold HTML. Every expression that compares text has to do this, and
 *  the in-app prompt tells the model as much (Table.svelte:1470). */
export function stripHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

const DATE_PATTERNS = [
  /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/, // 25-Apr-23, the format in real pages
  /^\d{4}-\d{2}-\d{2}/, // ISO
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
]

const isDateish = (text: string) => DATE_PATTERNS.some((p) => p.test(text))

export type ColumnProfile = {
  name: string
  /** Computed columns hold no stored value, so the value statistics below are
   *  absent rather than zero. Use evaluate_table_script to see what one produces. */
  computed?: true
  rowCount: number
  nonEmpty: number
  distinct: number | string
  htmlTags: string[]
  kind: 'numeric' | 'date' | 'text' | 'empty' | 'computed'
  parseFailures: number
  min?: number
  max?: number
  topValues?: { value: string; count: number }[]
}

const DISTINCT_CAP = 500
const TOP_VALUES_MAX = 12

/**
 * Bounded whatever the row count. Over a few thousand rows "8 distinct values"
 * or "31 rows do not parse as numbers" is information that no sample conveys,
 * at any sample size.
 */
export function isComputed(column: TableColumn): boolean {
  return column.type === 'Computed' || Boolean(column.expression)
}

export function profileColumn(
  column: TableColumn,
  items: Record<string, string>[],
): ColumnProfile {
  const name = column.name
  if (isComputed(column)) {
    // Its cells are derived at render time, so there is nothing in items to
    // measure. Reporting nonEmpty 0 here would read as "this column is blank".
    return {
      name,
      computed: true,
      rowCount: items.length,
      nonEmpty: 0,
      distinct: 0,
      htmlTags: [],
      kind: 'computed',
      parseFailures: 0,
    }
  }
  const counts = new Map<string, number>()
  let nonEmpty = 0
  let numeric = 0
  let dateish = 0
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  const tags = new Set<string>()
  let overflowed = false

  for (const item of items) {
    const raw = item?.[name]
    for (const match of String(raw ?? '').matchAll(/<([a-zA-Z][a-zA-Z0-9]*)/g)) {
      tags.add(match[1]!.toLowerCase())
    }
    const text = stripHtml(raw)
    if (!text) continue
    nonEmpty++

    if (counts.size < DISTINCT_CAP) {
      counts.set(text, (counts.get(text) ?? 0) + 1)
    } else if (!counts.has(text)) {
      overflowed = true
    }

    const asNumber = Number(text)
    if (text !== '' && Number.isFinite(asNumber)) {
      numeric++
      if (asNumber < min) min = asNumber
      if (asNumber > max) max = asNumber
    }
    if (isDateish(text)) dateish++
  }

  let kind: ColumnProfile['kind'] = 'text'
  if (nonEmpty === 0) kind = 'empty'
  else if (numeric / nonEmpty >= 0.8) kind = 'numeric'
  else if (dateish / nonEmpty >= 0.8) kind = 'date'

  const profile: ColumnProfile = {
    name,
    rowCount: items.length,
    nonEmpty,
    distinct: overflowed ? `${DISTINCT_CAP}+` : counts.size,
    htmlTags: [...tags].sort(),
    kind,
    parseFailures:
      kind === 'numeric' ? nonEmpty - numeric : kind === 'date' ? nonEmpty - dateish : 0,
  }

  if (kind === 'numeric' && numeric > 0) {
    profile.min = min
    profile.max = max
  }
  if (!overflowed && counts.size > 0 && counts.size <= TOP_VALUES_MAX) {
    profile.topValues = [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
  }

  return profile
}

/**
 * A sample picked on purpose rather than by position. The in-app panel sends
 * the first three rows (SAMPLE_ROWS_LIMIT, Table.svelte:1352), which on most
 * tables are the cleanest three rows in it, so the values that actually break
 * expressions never appear.
 */
export function chooseSample(
  columns: TableColumn[],
  items: Record<string, string>[],
  profiles: ColumnProfile[],
  perGroup = 3,
): { rowIndex: number; reason: string; values: Record<string, string> }[] {
  const picked = new Map<number, string>()
  const take = (index: number, reason: string) => {
    if (index >= 0 && index < items.length && !picked.has(index)) picked.set(index, reason)
  }

  for (let i = 0; i < Math.min(perGroup, items.length); i++) take(i, 'head')
  for (let i = Math.max(0, items.length - perGroup); i < items.length; i++) take(i, 'tail')
  for (let i = 0; i < perGroup && items.length > perGroup * 2; i++) {
    take(Math.floor(Math.random() * items.length), 'random')
  }

  // The awkward ones. These are what computed expressions break on. Computed
  // columns are skipped: they store nothing, so every row would look empty.
  const stored = columns.filter((c) => !isComputed(c))
  const numericColumns = new Set(
    profiles.filter((p) => p.kind === 'numeric').map((p) => p.name),
  )
  let longest = { index: -1, length: -1 }
  let emptyRow = -1
  let parseFailure = -1

  items.forEach((item, index) => {
    for (const column of stored) {
      const raw = String(item?.[column.name] ?? '')
      if (raw.length > longest.length) longest = { index, length: raw.length }
      const text = stripHtml(raw)
      if (emptyRow < 0 && !text) emptyRow = index
      if (
        parseFailure < 0 &&
        numericColumns.has(column.name) &&
        text &&
        !Number.isFinite(Number(text))
      ) {
        parseFailure = index
      }
    }
  })

  take(longest.index, 'longest value')
  take(emptyRow, 'empty cell')
  take(parseFailure, 'does not parse as a number')

  return [...picked.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rowIndex, reason]) => ({
      rowIndex,
      reason,
      values: Object.fromEntries(
        columns.map((column) => {
          const text = stripHtml(items[rowIndex]?.[column.name])
          return [column.name, text.length > 120 ? `${text.slice(0, 117)}...` : text]
        }),
      ),
    }))
}
