import { describe, expect, test } from 'bun:test'
import { editRows, readRows } from './tableRows'
import type { TableDocument } from './tableDoc'

const LINK = '<a data-page-id="42" class="page-link" href="/page/42" target="_blank" contenteditable="false">Recipes</a>'

const table = (): TableDocument => ({
  columns: [
    { name: 'Item', type: '' },
    { name: 'Amount', type: '' },
    { name: 'Double', type: 'Computed', expression: "return dbl(Number(String(item['Amount']).replace(/<[^>]*>/g, '')))" },
  ],
  items: [
    { Item: 'milk', Amount: '2', Double: '' },
    { Item: `<b>eggs</b> from ${LINK}`, Amount: '<b>3</b>', Double: '' },
    { Item: '<span style="color: red;">bread</span>', Amount: 'n/a', Double: '' },
    { Item: 'oat milk', Amount: '5', Double: '' },
  ],
  totals: { Amount: "return items.reduce((a, r) => a + (Number(String(r['Amount']).replace(/<[^>]*>/g, '')) || 0), 0)" },
  widths: { Item: '200px' },
  customFunctions: 'function dbl(x){return x*2}',
})

describe('readRows', () => {
  test('cells as text, computed columns as what they show', () => {
    const result = readRows(table(), {})
    expect(result.rowCount).toBe(4)
    expect(result.columns).toEqual([{ name: 'Item' }, { name: 'Amount' }, { name: 'Double', computed: true }])
    expect(result.rows).toEqual([
      { row: 0, values: { Item: 'milk', Amount: '2', Double: '4' } },
      { row: 1, values: { Item: '**eggs** from [[Recipes|42]]', Amount: '**3**', Double: '6' } },
      // Styling the cell form cannot express reads as its text.
      { row: 2, values: { Item: 'bread', Amount: 'n/a', Double: 'NaN' } },
      { row: 3, values: { Item: 'oat milk', Amount: '5', Double: '10' } },
    ])
  })

  test('windows, from either end', () => {
    expect(readRows(table(), { start: 1, limit: 2 }).rows.map((r) => r.row)).toEqual([1, 2])
    expect(readRows(table(), { start: -1 }).rows.map((r) => r.row)).toEqual([3])
    expect(readRows(table(), { start: 99 }).rows).toEqual([])
  })

  test('search keeps real row numbers and says how many matched', () => {
    const result = readRows(table(), { search: 'MILK' })
    expect(result.matched).toBe(2)
    expect(result.rows.map((r) => r.row)).toEqual([0, 3])
    // Computed values are still right for a row that is not first in the window.
    expect(result.rows[1]!.values.Double).toBe('10')
  })

  test('choosing columns, and a computed column left out is not run', () => {
    const doc = table()
    doc.columns[2]!.expression = 'while(true){}'
    expect(readRows(doc, { columns: ['Item'], limit: 1 }).rows).toEqual([{ row: 0, values: { Item: 'milk' } }])
    expect(() => readRows(doc, { columns: ['Nope'] })).toThrow(/This table has: Item, Amount, Double/)
  })

  test('a computed column that throws or hangs is reported in the cell, not as a failed read', () => {
    const throws = table()
    throws.columns[2]!.expression = "if (rowIndex === 1) throw new Error('bad row'); return 1"
    expect(readRows(throws, {}).rows.map((r) => r.values.Double)).toEqual(['1', '#ERROR bad row', '1', '1'])
    const hangs = table()
    hangs.columns[2]!.expression = 'while(true){}'
    expect(readRows(hangs, { limit: 1 }).rows[0]!.values.Double).toMatch(/^#ERROR did not finish/)
  })

  test('totals on request', () => {
    expect(readRows(table(), {}).totals).toBeUndefined()
    expect(readRows(table(), { totals: true }).totals).toEqual({ Amount: '10' })
  })

  test('a never-saved table has no rows and no columns', () => {
    expect(readRows({ columns: [], items: [] }, {})).toMatchObject({ rowCount: 0, columns: [], rows: [] })
  })
})

describe('editRows', () => {
  test('update touches only the named cells', () => {
    const doc = table()
    editRows(doc, { update: [{ row: 1, values: { Amount: 4 } }] })
    expect(doc.items[1]).toEqual({ Item: `<b>eggs</b> from ${LINK}`, Amount: '4', Double: '' })
  })

  test('new rows carry every column, and cell text becomes the HTML the app writes', () => {
    const doc = table()
    const summary = editRows(doc, { add: [{ Item: '**rice** & [[Recipes|42]]', Amount: 1.5 }, { Item: '<script>x</script>' }] })
    expect(summary).toEqual({ updated: 0, removed: 0, added: 2, firstAdded: 4 })
    expect(doc.items.slice(4)).toEqual([
      { Item: `<b>rice</b> &amp; ${LINK}`, Amount: '1.5', Double: '' },
      { Item: '&lt;script&gt;x&lt;/script&gt;', Amount: '', Double: '' },
    ])
  })

  test('row numbers mean the table as it was read, whatever else the batch does', () => {
    const doc = table()
    const summary = editRows(doc, {
      update: [{ row: 3, values: { Amount: '6' } }],
      remove: [0, 2],
      add: [{ Item: 'new' }],
      addBefore: 3,
    })
    expect(doc.items.map((r) => [r.Item, r.Amount])).toEqual([[`<b>eggs</b> from ${LINK}`, '<b>3</b>'], ['new', ''], ['oat milk', '6']])
    expect(summary.firstAdded).toBe(1)
  })

  test('a bad batch changes nothing', () => {
    const doc = table()
    const before = JSON.stringify(doc)
    expect(() => editRows(doc, { update: [{ row: 0, values: { Amount: '9' } }, { row: 4, values: { Amount: '9' } }] })).toThrow(/Row 4 does not exist. Rows are numbered 0 to 3/)
    expect(() => editRows(doc, { add: [{ Item: 'ok' }, { Price: '1' }] })).toThrow(/No column named Price/)
    expect(() => editRows(doc, { update: [{ row: 0, values: { Double: '1' } }] })).toThrow(/computed column/)
    expect(() => editRows(doc, { add: [{ Item: 'two\nlines' }] })).toThrow(/one line/)
    expect(() => editRows(doc, { add: [{ Item: '[x](javascript:alert(1))' }] })).toThrow(/http/)
    expect(() => editRows(doc, {})).toThrow(/Nothing to change/)
    expect(() => editRows(doc, { remove: [0], addBefore: 1 })).toThrow(/addBefore/)
    expect(JSON.stringify(doc)).toBe(before)
  })

  test("adding to a new table replaces the app's blank placeholder row", () => {
    const doc: TableDocument = { columns: [{ name: 'A' }, { name: 'B' }], items: [{ A: '', B: '<br>' }] }
    expect(editRows(doc, { add: [{ A: '1' }, { A: '2' }] }).firstAdded).toBe(0)
    expect(doc.items).toEqual([{ A: '1', B: '' }, { A: '2', B: '' }])
    // A single row with something in it is data, and stays.
    const real: TableDocument = { columns: [{ name: 'A' }], items: [{ A: 'x' }] }
    editRows(real, { add: [{ A: 'y' }] })
    expect(real.items).toEqual([{ A: 'x' }, { A: 'y' }])
  })

  test('removing every row leaves one blank row, as the app does', () => {
    const doc = table()
    editRows(doc, { remove: [0, 1, 2, 3, 3] })
    expect(doc.items).toEqual([{ Item: '', Amount: '', Double: '' }])
  })

  test('the rest of the document is untouched', () => {
    const doc = table()
    editRows(doc, { add: [{ Item: 'x' }] })
    const fresh = table()
    expect({ ...doc, items: [] }).toEqual({ ...fresh, items: [] })
  })
})
