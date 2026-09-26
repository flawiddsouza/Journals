import { diffArrays, diffLines } from 'diff'
import { type TableColumn, type TableDocument, isComputed } from './tableDoc'

/**
 * What changed between two saved versions of a page, for get_page_history.
 *
 * The Table half repeats the app's history view: rowDiff.js pairs rows and
 * tableHistoryDiff.js compares columns and settings. uiContract.test.ts runs
 * the app's version beside this one.
 */

type Row = Record<string, string>

// An empty cell and a missing one read the same, and key order means nothing.
function rowKey(row: Row): string {
  return JSON.stringify(
    Object.keys(row)
      .filter((key) => row[key] !== '' && row[key] !== null && row[key] !== undefined)
      .sort()
      .map((key) => [key, row[key]]),
  )
}

type RowChange = { type: 'same' | 'add' | 'remove' | 'change' }

/** rowDiff.js diffRows, reduced to the order of changes. A run of removed rows
 *  followed by added ones is read as rows changed in place, paired in order. */
function diffRowKinds(before: Row[], after: Row[]): RowChange[] {
  const parts = diffArrays(before.map(rowKey), after.map(rowKey))
  const changes: RowChange[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    if (!part.added && !part.removed) {
      for (let k = 0; k < part.value.length; k++) changes.push({ type: 'same' })
      continue
    }
    const next = parts[i + 1]
    let removedCount = part.removed ? part.value.length : 0
    let addedCount = part.added ? part.value.length : 0
    if (next && (next.added || next.removed) && next.added !== part.added) {
      if (next.removed) removedCount = next.value.length
      else addedCount = next.value.length
      i++
    }
    const paired = Math.min(removedCount, addedCount)
    for (let k = 0; k < paired; k++) changes.push({ type: 'change' })
    for (let k = paired; k < removedCount; k++) changes.push({ type: 'remove' })
    for (let k = paired; k < addedCount; k++) changes.push({ type: 'add' })
  }
  return changes
}

const COLUMN_FIELDS = ['label', 'type', 'expression', 'wrap', 'align', 'autocomplete', 'filterable'] as const
const TEXT_SETTINGS = ['note', 'startupScript', 'pullScript', 'customFunctions', 'rowStyle'] as const
const OTHER_SETTINGS = ['totals', 'stats', 'widths'] as const

// The app saves stats as { widgets: [] } before any widget exists, so an
// object of empty things is as empty as a missing one.
const blank = (value: unknown): boolean =>
  value === undefined || value === null || value === '' ||
  (typeof value === 'object' && Object.values(value).every(blank))
const same = (left: unknown, right: unknown) =>
  (blank(left) && blank(right)) || JSON.stringify(left) === JSON.stringify(right)

export type TableRowChange =
  | { type: 'add'; after: Row; rowNumber: number }
  | { type: 'remove'; before: Row; rowNumber: number }
  | { type: 'change'; before: Row; after: Row; rowNumber: number }

/** tableHistoryDiff.js diffTableContent. Rows are compared on the non-computed
 *  columns both versions have, so a column added or removed shows once, as a
 *  column. rowNumber is 1-based: in newer for an added or changed row, in
 *  older for a removed one. */
export function diffTableDocuments(older: TableDocument, newer: TableDocument) {
  const olderNames = older.columns.map((column) => column.name)
  const newerNames = newer.columns.map((column) => column.name)
  const columnsAdded = newerNames.filter((name) => !olderNames.includes(name))
  const columnsRemoved = olderNames.filter((name) => !newerNames.includes(name))

  const columnsChanged: { name: string; fields: { field: string; before: string; after: string }[] }[] = []
  for (const column of newer.columns) {
    const columnOlder = older.columns.find((c) => c.name === column.name)
    if (!columnOlder) continue
    const fields = COLUMN_FIELDS.filter((key) => !same(columnOlder[key], column[key])).map((field) => ({
      field,
      before: columnOlder[field] ?? '',
      after: column[field] ?? '',
    }))
    if (fields.length) columnsChanged.push({ name: column.name, fields })
  }

  const sharedOlder = olderNames.filter((name) => newerNames.includes(name))
  const sharedNewer = newerNames.filter((name) => olderNames.includes(name))
  const columnsReordered = sharedOlder.some((name, index) => sharedNewer[index] !== name)

  const computed = (name: string) => [...older.columns, ...newer.columns].some((c: TableColumn) => c.name === name && isComputed(c))
  const rowColumns = sharedNewer.filter((name) => !computed(name))
  const project = (row: Row) => Object.fromEntries(rowColumns.map((name) => [name, row?.[name] ?? '']))

  const rows: TableRowChange[] = []
  let olderIndex = 0
  let newerIndex = 0
  for (const change of diffRowKinds(older.items.map(project), newer.items.map(project))) {
    if (change.type === 'same') {
      olderIndex++
      newerIndex++
    } else if (change.type === 'change') {
      rows.push({ type: 'change', before: older.items[olderIndex++]!, after: newer.items[newerIndex++]!, rowNumber: newerIndex })
    } else if (change.type === 'remove') {
      rows.push({ type: 'remove', before: older.items[olderIndex++]!, rowNumber: olderIndex })
    } else {
      rows.push({ type: 'add', after: newer.items[newerIndex++]!, rowNumber: newerIndex })
    }
  }

  const settings = TEXT_SETTINGS.filter((key) => !same(older[key], newer[key])).map((setting) => ({
    setting,
    before: older[setting] ?? '',
    after: newer[setting] ?? '',
  }))
  const settingsOther = OTHER_SETTINGS.filter((key) => !same(older[key], newer[key]))

  return { columnsAdded, columnsRemoved, columnsChanged, columnsReordered, rows, rowColumns, settings, settingsOther }
}

/** A script or note before and after, as "-", "+" and " " lines. */
export function textDiff(before: string, after: string): string {
  const withNewline = (text: string) => (text && !text.endsWith('\n') ? text + '\n' : text)
  return diffLines(withNewline(before), withNewline(after))
    .flatMap((part) => {
      const mark = part.added ? '+' : part.removed ? '-' : ' '
      return part.value.replace(/\n$/, '').split('\n').map((line) => `${mark} ${line}`)
    })
    .join('\n')
}

export type LineHunk = { text: string; added: number; removed: number }

/** Two versions of a page's numbered lines as hunks: " ", "-" and "+" before
 *  the line number, a tab, then the line. A removed line carries its number in
 *  older, the rest their number in newer. */
export function diffPageLines(older: string[], newer: string[], context = 2): LineHunk[] {
  type Mark = { mark: ' ' | '-' | '+'; number: number; line: string }
  const marks: Mark[] = []
  let olderNumber = 1
  let newerNumber = 1
  for (const part of diffArrays(older, newer)) {
    for (const line of part.value) {
      if (part.removed) marks.push({ mark: '-', number: olderNumber++, line })
      else if (part.added) marks.push({ mark: '+', number: newerNumber++, line })
      else {
        marks.push({ mark: ' ', number: newerNumber++, line })
        olderNumber++
      }
    }
  }
  const changed = marks.flatMap((m, index) => (m.mark === ' ' ? [] : [index]))
  const hunks: LineHunk[] = []
  let c = 0
  while (c < changed.length) {
    // One hunk runs over changes whose contexts would touch or overlap.
    const first = changed[c]!
    while (c + 1 < changed.length && changed[c + 1]! - changed[c]! <= context * 2 + 1) c++
    const last = changed[c++]!
    const shown = marks.slice(Math.max(0, first - context), Math.min(marks.length, last + context + 1))
    hunks.push({
      text: shown.map((m) => `${m.mark} ${m.number}\t${m.line}`).join('\n'),
      added: shown.filter((m) => m.mark === '+').length,
      removed: shown.filter((m) => m.mark === '-').length,
    })
  }
  return hunks
}
