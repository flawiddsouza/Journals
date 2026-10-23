// What changed in a Table between two saved versions of it: columns, rows
// and the page's settings, for the page history view.

import { diffRows } from './rowDiff.js'
import { createTableHistorySnapshot } from './tableHistorySnapshot.js'

const COLUMN_FIELDS = [
    ['label', 'Label'],
    ['type', 'Type'],
    ['expression', 'Expression'],
    ['wrap', 'Wrap'],
    ['align', 'Align'],
    ['autocomplete', 'Autocomplete'],
    ['filterable', 'Filter'],
    ['style', 'Cell style'],
]

// Scripts and notes are compared as text; structured settings use JSON.
const TEXT_SETTINGS = [
    ['note', 'Note'],
    ['startupScript', 'Startup script'],
    ['pullScript', 'Pull script'],
    ['customFunctions', 'Custom functions'],
    ['rowStyle', 'Row style'],
]
const OTHER_SETTINGS = [
    ['totals', 'Totals'],
    ['stats', 'Stats'],
    ['widths', 'Column widths'],
]

// The app saves stats as { widgets: [] } before any widget exists, so an
// object of empty things is as empty as a missing one.
const blank = (value) =>
    value === undefined || value === null || value === '' ||
    (typeof value === 'object' && Object.values(value).every(blank))
const same = (left, right) =>
    (blank(left) && blank(right)) || JSON.stringify(left) === JSON.stringify(right)

/** A Table page's content as stored, or an empty table when there is none. */
export function parseTableContent(content) {
    let parsed = null
    try {
        parsed = content ? JSON.parse(content) : null
    } catch {
        parsed = null
    }
    return {
        ...parsed,
        columns: Array.isArray(parsed?.columns) ? parsed.columns : [],
        items: Array.isArray(parsed?.items) ? parsed.items : [],
    }
}

/**
 * The differences from `older` to `newer`, both parsed Table content:
 *   columnsAdded, columnsRemoved   column names
 *   columnsChanged                 [{ name, fields: [{ label, before, after }] }]
 *   columnsReordered               the columns in both are in another order
 *   rows                           rowDiff changes other than 'same', each with
 *                                  rowNumber: 1-based, in newer for an added or
 *                                  changed row, in older for a removed one
 *   rowsAligned                    every row of both versions in order, the
 *                                  unchanged ones as 'same' with both copies
 *   rowColumns                     the columns rows were compared on
 *   settings                       [{ label, before, after }] for text settings
 *   settingsOther                  labels of other settings that changed
 * Rows are aligned on shared stored columns, then compared on every shared
 * cell's displayed value and style. A new or removed column is reported once.
 */
export function diffTableContent(older, newer) {
    const olderNames = older.columns.map((column) => column.name)
    const newerNames = newer.columns.map((column) => column.name)
    const columnsAdded = newerNames.filter((name) => !olderNames.includes(name))
    const columnsRemoved = olderNames.filter((name) => !newerNames.includes(name))

    const columnsChanged = []
    for (const column of newer.columns) {
        const columnOlder = older.columns.find((c) => c.name === column.name)
        if (!columnOlder) continue
        const fields = COLUMN_FIELDS.filter(([key]) => !same(columnOlder[key], column[key])).map(
            ([key, label]) => ({ label, before: columnOlder[key] ?? '', after: column[key] ?? '' }),
        )
        if (fields.length) columnsChanged.push({ name: column.name, fields })
    }

    const sharedOlder = olderNames.filter((name) => newerNames.includes(name))
    const sharedNewer = newerNames.filter((name) => olderNames.includes(name))
    const columnsReordered = sharedOlder.some((name, index) => sharedNewer[index] !== name)

    const isComputed = (name) =>
        [...older.columns, ...newer.columns].some((c) => c.name === name && c.type === 'Computed')
    const rowColumns = sharedNewer
    const rowColumnsStored = rowColumns.filter((name) => !isComputed(name))
    const snapshotOlder = createTableHistorySnapshot(older)
    const snapshotNewer = createTableHistorySnapshot(newer)
    const cellsOlder = snapshotOlder.cells
    const cellsNewer = snapshotNewer.cells
    const project = (row, cells) => Object.fromEntries(rowColumnsStored.map((name) =>
        [name, cells.get(row)[name].html],
    ))

    // diffRows hands back rows by position, so the stored rows are matched to
    // its changes by walking both lists alongside it.
    /** @type {Array<
     * {type: 'same', before: Record<string, string>, after: Record<string, string>, rowNumber: number} |
     * {type: 'change', before: Record<string, string>, after: Record<string, string>, rowNumber: number} |
     * {type: 'add', after: Record<string, string>, rowNumber: number} |
     * {type: 'remove', before: Record<string, string>, rowNumber: number}
     * >} */
    const rowsAligned = []
    let olderIndex = 0
    let newerIndex = 0
    for (const change of diffRows(older.items.map((row) => project(row, cellsOlder)), newer.items.map((row) => project(row, cellsNewer)))) {
        if (change.type === 'same' || change.type === 'change') {
            const before = older.items[olderIndex++]
            const after = newer.items[newerIndex++]
            const changed = rowColumns.some((name) => !same(cellsOlder.get(before)[name], cellsNewer.get(after)[name]))
            rowsAligned.push({ type: changed ? 'change' : 'same', before, after, rowNumber: newerIndex })
        } else if (change.type === 'remove') {
            rowsAligned.push({ type: 'remove', before: older.items[olderIndex++], rowNumber: olderIndex })
        } else {
            rowsAligned.push({ type: 'add', after: newer.items[newerIndex++], rowNumber: newerIndex })
        }
    }
    const rows = rowsAligned.filter((row) => row.type !== 'same')

    const settings = TEXT_SETTINGS.filter(([key]) => !same(older[key], newer[key])).map(
        ([key, label]) => ({ label, before: older[key] ?? '', after: newer[key] ?? '' }),
    )
    const settingsOther = OTHER_SETTINGS.filter(([key]) => !same(older[key], newer[key])).map(
        ([, label]) => label,
    )
    const settingsOtherValues = OTHER_SETTINGS.filter(([key]) => !same(older[key], newer[key])).map(
        ([key, label]) => ({ label, before: JSON.stringify(older[key] ?? {}, null, 2), after: JSON.stringify(newer[key] ?? {}, null, 2) }),
    )
    const totalsChanged = [...new Set([...Object.keys(snapshotOlder.totals), ...Object.keys(snapshotNewer.totals)])]
        .filter((name) => snapshotOlder.totals[name] !== snapshotNewer.totals[name])
        .map((name) => ({ name, before: snapshotOlder.totals[name] ?? '', after: snapshotNewer.totals[name] ?? '' }))

    return {
        columnsAdded,
        columnsRemoved,
        columnsChanged,
        columnsReordered,
        rows,
        rowsAligned,
        rowColumns,
        settings,
        settingsOther,
        settingsOtherValues,
        cellsOlder,
        cellsNewer,
        totalsChanged,
    }
}

/**
 * Which of rowsAligned to draw: every row `isChange` picks, `context` rows
 * either side of one, and each longer run of other rows folded into a gap
 *   { gap: firstIndex, count }
 * unless `gapsOpen` has its firstIndex. Only the first `changesShown` changes
 * are drawn; changesHidden counts the rest.
 */
export function rowsForDisplay(
    rowsAligned,
    { context = 1, changesShown = Infinity, gapsOpen = new Set(), isChange = (row) => row.type !== 'same' } = {},
) {
    const changed = []
    rowsAligned.forEach((row, index) => {
        if (isChange(row)) changed.push(index)
    })
    const shown = changed.slice(0, changesShown)
    const end = shown.length < changed.length ? shown.at(-1) + context + 1 : rowsAligned.length
    const near = new Set()
    for (const index of shown) {
        for (let k = index - context; k <= index + context; k++) near.add(k)
    }
    const items = []
    let gap = null
    for (let index = 0; index < Math.min(end, rowsAligned.length); index++) {
        if (near.has(index)) {
            gap = null
            items.push({ row: rowsAligned[index], index })
            continue
        }
        if (!gap) {
            gap = { gap: index, count: 0 }
            items.push(gap)
        }
        gap.count++
    }
    // An open gap is drawn as its rows, and so is a gap of one row, which a
    // fold would take as much room as.
    const opened = items.flatMap((item) =>
        item.gap !== undefined && (gapsOpen.has(item.gap) || item.count === 1)
            ? Array.from({ length: item.count }, (_, k) => ({ row: rowsAligned[item.gap + k], index: item.gap + k }))
            : [item],
    )
    return { items: opened, changesHidden: changed.length - shown.length }
}
