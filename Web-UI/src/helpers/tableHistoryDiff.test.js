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

    it('ignores a plain-text line-break storage conversion and keeps both original rows', () => {
        const columns = [{ name: 'Note', type: 'Input (Plain Text)' }]
        const older = table(columns, [{ Note: 'first<br>second' }])
        const newer = table(columns, [{ Note: 'first\nsecond' }])
        const diff = diffTableContent(older, newer)
        expect(diff.rows).toEqual([])
        expect(diff.rowsAligned).toEqual([
            { type: 'same', before: older.items[0], after: newer.items[0], rowNumber: 1 },
        ])
    })

    it('still counts real line-break edits and rich-text cell changes', () => {
        const plain = [{ name: 'Note', type: 'Input (Plain Text)' }]
        expect(diffTableContent(
            table(plain, [{ Note: 'first second' }]),
            table(plain, [{ Note: 'first\nsecond' }]),
        ).rows).toHaveLength(1)
        expect(diffTableContent(
            table(['Note'], [{ Note: 'first<br>second' }]),
            table(['Note'], [{ Note: 'first\nsecond' }]),
        ).rows).toHaveLength(1)
    })

    it('shows calculated changes even when the stored notes display identically', () => {
        const columns = [
            { name: 'Note', type: 'Input (Plain Text)' },
            { name: 'Entries', type: 'Computed', expression: "return item.Note.split('\\n').length" },
            { name: 'Doubled', type: 'Computed', expression: 'return twice(item.Entries)' },
        ]
        const older = table(columns, [{ Note: 'one<br>two' }], { customFunctions: 'function twice(n) { return n * 2 }' })
        const newer = table(columns, [{ Note: 'one\ntwo' }], { customFunctions: older.customFunctions })
        const original = JSON.stringify([older, newer])
        const diff = diffTableContent(older, newer)
        expect(diff.rows.map((row) => row.rowNumber)).toEqual([1])
        expect(diff.cellsOlder.get(older.items[0]).Note.html).toBe(diff.cellsNewer.get(newer.items[0]).Note.html)
        expect(diff.cellsOlder.get(older.items[0]).Entries.html).toBe('1')
        expect(diff.cellsNewer.get(newer.items[0]).Entries.html).toBe('2')
        expect(diff.cellsOlder.get(older.items[0]).Doubled.html).toBe('2')
        expect(diff.cellsNewer.get(newer.items[0]).Doubled.html).toBe('4')
        expect(JSON.stringify([older, newer])).toBe(original)
    })

    it('keeps row alignment when an insertion changes following running totals', () => {
        const columns = ['Amount', { name: 'Running', type: 'Computed', expression: 'return items.slice(0, rowIndex + 1).reduce((sum, row) => sum + Number(row.Amount), 0)' }]
        const older = table(columns, [{ Amount: '10' }, { Amount: '20' }])
        const newer = table(columns, [{ Amount: '5' }, { Amount: '10' }, { Amount: '20' }])
        const diff = diffTableContent(older, newer)
        expect(diff.rows.map((row) => [row.type, row.rowNumber])).toEqual([['add', 1], ['change', 2], ['change', 3]])
        expect(diff.rows[1].before).toEqual({ Amount: '10' })
        expect(diff.cellsOlder.get(diff.rows[1].before).Running.html).toBe('10')
        expect(diff.cellsNewer.get(diff.rows[1].after).Running.html).toBe('15')
    })

    it('compares row styles, column styles, markup, totals and setting values', () => {
        const columns = [{ name: 'Note', style: "return item.Note.includes('strong') ? 'color: green' : 'color: red'" }]
        const older = table(columns, [{ Note: '<em>same</em>' }], { rowStyle: "return 'font-size: 12px'", totals: { Note: 'return items.length' }, widths: { Note: '100px' } })
        const newer = table(columns, [{ Note: '<strong>same</strong>' }], { rowStyle: "return 'font-size: 18px'", totals: { Note: 'return items.length * 2' }, widths: { Note: '150px' } })
        const diff = diffTableContent(older, newer)
        expect(diff.rows).toHaveLength(1)
        expect(diff.cellsOlder.get(older.items[0]).Note.style).toContain('font-size: 12px; color: red')
        expect(diff.cellsNewer.get(newer.items[0]).Note.style).toContain('font-size: 18px; color: green')
        expect(diff.totalsChanged).toEqual([{ name: 'Note', before: '1', after: '2' }])
        expect(diff.settingsOtherValues.find((setting) => setting.label === 'Column widths')).toMatchObject({ before: expect.stringContaining('100px'), after: expect.stringContaining('150px') })
    })

    it('uses empty HTML for null calculated values and preserves literal null text', () => {
        const older = table([{ name: 'Value', type: 'Computed', expression: 'return null' }], [{}])
        const newer = table([{ name: 'Value', type: 'Computed', expression: "return 'null'" }], [{}])
        const diff = diffTableContent(older, newer)
        expect(diff.cellsOlder.get(older.items[0]).Value.html).toBe('')
        expect(diff.cellsNewer.get(newer.items[0]).Value.html).toBe('null')
        expect(diff.rows).toHaveLength(1)
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
