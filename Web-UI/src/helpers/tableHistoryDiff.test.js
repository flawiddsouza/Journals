import { describe, expect, it } from 'vitest'
import { diffTableContent, parseTableContent, rowsForDisplay } from './tableHistoryDiff.js'

const table = (columns, items, extra = {}) => ({
    columns: columns.map((name) => (typeof name === 'string' ? { name, label: name, type: '' } : name)),
    items,
    ...extra,
})

describe('diffTableContent', () => {
    it('numbers added and changed rows in the newer version, removed ones in the older', () => {
        const older = table(['Item', 'Qty'], [
            { Item: 'a', Qty: '1' },
            { Item: 'b', Qty: '2' },
            { Item: 'c', Qty: '3' },
        ])
        const newer = table(['Item', 'Qty'], [
            { Item: 'a', Qty: '1' },
            { Item: 'c', Qty: '4' },
            { Item: 'd', Qty: '5' },
        ])
        const { rows } = diffTableContent(older, newer)
        expect(rows.map((row) => [row.type, row.rowNumber])).toEqual([
            ['change', 2],
            ['change', 3],
        ])
        expect(rows[0].before).toEqual({ Item: 'b', Qty: '2' })
        expect(rows[0].after).toEqual({ Item: 'c', Qty: '4' })
    })

    it('reads appended and deleted rows as additions and removals', () => {
        const older = table(['Item'], [{ Item: 'a' }, { Item: 'b' }])
        const added = diffTableContent(older, table(['Item'], [{ Item: 'a' }, { Item: 'b' }, { Item: 'c' }]))
        expect(added.rows).toEqual([{ type: 'add', after: { Item: 'c' }, rowNumber: 3 }])
        const removed = diffTableContent(older, table(['Item'], [{ Item: 'b' }]))
        expect(removed.rows).toEqual([{ type: 'remove', before: { Item: 'a' }, rowNumber: 1 }])
    })

    it('shows an added column once, not as a change to every row', () => {
        const older = table(['Item'], [{ Item: 'a' }, { Item: 'b' }])
        const newer = table(['Item', 'Note'], [{ Item: 'a', Note: 'x' }, { Item: 'b', Note: '' }])
        const diff = diffTableContent(older, newer)
        expect(diff.columnsAdded).toEqual(['Note'])
        expect(diff.rows).toEqual([])
        expect(diff.rowColumns).toEqual(['Item'])
    })

    it('ignores the empty value rows keep under a computed column', () => {
        const computed = { name: 'Total', type: 'Computed', expression: '1' }
        const older = table(['Item', computed], [{ Item: 'a', Total: '' }])
        const newer = table(['Item', computed], [{ Item: 'a' }])
        expect(diffTableContent(older, newer).rows).toEqual([])
    })

    it('names the column fields that changed and notices reordering', () => {
        const older = table([{ name: 'A', type: 'Computed', expression: '1' }, 'B'], [])
        const newer = table(['B', { name: 'A', type: 'Computed', expression: '2' }], [])
        const diff = diffTableContent(older, newer)
        expect(diff.columnsChanged).toEqual([
            { name: 'A', fields: [{ label: 'Expression', before: '1', after: '2' }] },
        ])
        expect(diff.columnsReordered).toBe(true)
    })

    it('lists changed settings, treating missing and empty as the same', () => {
        const older = table(['A'], [], { startupScript: '', note: undefined, totals: {}, stats: { widgets: [] } })
        const newer = table(['A'], [], { startupScript: 'rows.x = 1', widths: { A: 100 } })
        const diff = diffTableContent(older, newer)
        expect(diff.settings).toEqual([{ label: 'Startup script', before: '', after: 'rows.x = 1' }])
        expect(diff.settingsOther).toEqual(['Column widths'])
    })
})

describe('parseTableContent', () => {
    it('reads missing or broken content as an empty table', () => {
        expect(parseTableContent('')).toEqual({ columns: [], items: [] })
        expect(parseTableContent('{')).toEqual({ columns: [], items: [] })
    })
})

describe('rowsForDisplay', () => {
    // A row per letter: s same, c change.
    const aligned = (pattern) => [...pattern].map((kind) => ({ type: kind === 'c' ? 'change' : 'same' }))
    const drawn = ({ items }) => items.map((item) => (item.gap !== undefined ? `gap${item.count}` : item.index)).join()

    it('keeps one unchanged row either side of a change and folds the rest', () => {
        expect(drawn(rowsForDisplay(aligned('sssscsssss')))).toBe('gap3,3,4,5,gap4')
    })

    it('draws a gap of one row as the row', () => {
        expect(drawn(rowsForDisplay(aligned('cssc')))).toBe('0,1,2,3')
        expect(drawn(rowsForDisplay(aligned('csssc')))).toBe('0,1,2,3,4')
    })

    it('opens a gap it is asked to', () => {
        expect(drawn(rowsForDisplay(aligned('csssss'), { gapsOpen: new Set([2]) }))).toBe('0,1,2,3,4,5')
    })

    it('stops after the changes it may show, with their trailing context', () => {
        const result = rowsForDisplay(aligned('cscsssc'), { changesShown: 2 })
        expect(drawn(result)).toBe('0,1,2,3')
        expect(result.changesHidden).toBe(1)
    })

    it('counts what isChange picks as a change', () => {
        const rows = [{ type: 'same', Store: '' }, { type: 'same', Store: '' }, { type: 'same', Store: '' }, { type: 'same', Store: 'x' }]
        expect(drawn(rowsForDisplay(rows, { isChange: (row) => row.Store !== '' }))).toBe('gap2,2,3')
    })

    it('lines up unchanged rows with both copies', () => {
        const columns = [{ name: 'Item' }]
        const { rowsAligned } = diffTableContent(
            { columns, items: [{ Item: 'a' }, { Item: 'b' }] },
            { columns, items: [{ Item: 'a' }, { Item: 'c' }] },
        )
        expect(rowsAligned).toEqual([
            { type: 'same', before: { Item: 'a' }, after: { Item: 'a' }, rowNumber: 1 },
            { type: 'change', before: { Item: 'b' }, after: { Item: 'c' }, rowNumber: 2 },
        ])
    })
})
