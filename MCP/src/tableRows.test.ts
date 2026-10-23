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
  test.each([undefined, '', 'Input (Plain Text)'] as const)('a stored column with type %s stays readable, searchable and editable with an old formula', (type) => {
    const expression = 'throw new Error("inactive formula ran")'
    const doc: TableDocument = { columns: [{ name: 'Value', type, expression }], items: [{ Value: 'before' }] }
    const before = JSON.stringify(doc)
    const result = readRows(doc, {})
    expect(result.columns).toEqual([{ name: 'Value' }])
    expect(result.rows).toEqual([{ row: 1, values: { Value: 'before' } }])
    expect(readRows(doc, { search: 'BEFORE' }).matched).toBe(1)
    expect(JSON.stringify(doc)).toBe(before)

    editRows(doc, { update: [{ row: 1, values: { Value: 'after' } }], add: [{ Value: 'new' }] })
    expect(doc.items).toEqual([{ Value: 'after' }, { Value: 'new' }])
    expect(readRows(doc, {}).rows.map((row) => row.values.Value)).toEqual(['after', 'new'])
    expect(doc.columns[0]!.expression).toBe(expression)
  })

  test('cells as text, computed columns as what they show', () => {
    const result = readRows(table(), {})
    expect(result.rowCount).toBe(4)
    expect(result.columns).toEqual([{ name: 'Item' }, { name: 'Amount' }, { name: 'Double', computed: true }])
    expect(result.rows).toEqual([
      { row: 1, values: { Item: 'milk', Amount: '2', Double: '4' } },
      { row: 2, values: { Item: '**eggs** from [[Recipes|42]]', Amount: '**3**', Double: '6' } },
      // Styling the cell form cannot express reads as its text.
      { row: 3, values: { Item: 'bread', Amount: 'n/a', Double: 'NaN' } },
      { row: 4, values: { Item: 'oat milk', Amount: '5', Double: '10' } },
    ])
  })

  test('windows, from either end', () => {
    expect(readRows(table(), { start: 2, limit: 2 }).rows.map((r) => r.row)).toEqual([2, 3])
    expect(readRows(table(), { start: 2, limit: 2 }).start).toBe(2)
    expect(readRows(table(), { start: -1 }).rows.map((r) => r.row)).toEqual([4])
    expect(readRows(table(), { start: 99 }).rows).toEqual([])
  })

  test('search keeps real row numbers and says how many matched', () => {
    const result = readRows(table(), { search: 'MILK' })
    expect(result.matched).toBe(2)
    expect(result.rows.map((r) => r.row)).toEqual([1, 4])
    // Computed values are still right for a row that is not first in the window.
    expect(result.rows[1]!.values.Double).toBe('10')
  })

  test('choosing columns, and a computed column left out is not run', () => {
    const doc = table()
    doc.columns[2]!.expression = 'while(true){}'
    expect(readRows(doc, { columns: ['Item'], limit: 1 }).rows).toEqual([{ row: 1, values: { Item: 'milk' } }])
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
    editRows(doc, { update: [{ row: 2, values: { Amount: 4 } }] })
    expect(doc.items[1]).toEqual({ Item: `<b>eggs</b> from ${LINK}`, Amount: '4', Double: '' })
  })

  test('new rows carry every stored column, and cell text becomes the HTML the app writes', () => {
    const doc = table()
    const summary = editRows(doc, { add: [{ Item: '**rice** & [[Recipes|42]]', Amount: 1.5 }, { Item: '<script>x</script>' }] })
    expect(summary).toEqual({ updated: 0, removed: 0, added: 2, firstAdded: 5 })
    expect(doc.items.slice(4)).toEqual([
      { Item: `<b>rice</b> &amp; ${LINK}`, Amount: '1.5' },
      { Item: '&lt;script&gt;x&lt;/script&gt;', Amount: '' },
    ])
  })

  test('row numbers mean the table as it was read, whatever else the batch does', () => {
    const doc = table()
    const summary = editRows(doc, {
      update: [{ row: 4, values: { Amount: '6' } }],
      remove: [1, 3],
      add: [{ Item: 'new' }],
      addBefore: 4,
    })
    expect(doc.items.map((r) => [r.Item, r.Amount])).toEqual([[`<b>eggs</b> from ${LINK}`, '<b>3</b>'], ['new', ''], ['oat milk', '6']])
    expect(summary.firstAdded).toBe(2)
    // One past the last row is the bottom.
    const bottom = table()
    expect(editRows(bottom, { add: [{ Item: 'last' }], addBefore: 5 }).firstAdded).toBe(5)
    expect(bottom.items[4]!.Item).toBe('last')
  })

  test('a bad batch changes nothing', () => {
    const doc = table()
    const before = JSON.stringify(doc)
    expect(() => editRows(doc, { update: [{ row: 1, values: { Amount: '9' } }, { row: 5, values: { Amount: '9' } }] })).toThrow(/Row 5 does not exist. Rows are numbered 1 to 4/)
    expect(() => editRows(doc, { remove: [0] })).toThrow(/Row 0 does not exist/)
    expect(() => editRows(doc, { add: [{ Item: 'x' }], addBefore: 6 })).toThrow(/addBefore row 6/)
    expect(() => editRows(doc, { add: [{ Item: 'ok' }, { Price: '1' }] })).toThrow(/No column named Price/)
    expect(() => editRows(doc, { update: [{ row: 1, values: { Double: '1' } }] })).toThrow(/computed column/)
    expect(() => editRows(doc, { add: [{ Item: 'two\nlines' }] })).toThrow(/one line/)
    expect(() => editRows(doc, { add: [{ Item: '[x](javascript:alert(1))' }] })).toThrow(/http/)
    expect(() => editRows(doc, {})).toThrow(/Nothing to change/)
    expect(() => editRows(doc, { remove: [1], addBefore: 1 })).toThrow(/addBefore/)
    expect(JSON.stringify(doc)).toBe(before)
  })

  test("adding to a new table replaces the app's blank placeholder row", () => {
    const doc: TableDocument = { columns: [{ name: 'A' }, { name: 'B' }], items: [{ A: '', B: '<br>' }] }
    expect(editRows(doc, { add: [{ A: '1' }, { A: '2' }] }).firstAdded).toBe(1)
    expect(doc.items).toEqual([{ A: '1', B: '' }, { A: '2', B: '' }])
    // A single row with something in it is data, and stays.
    const real: TableDocument = { columns: [{ name: 'A' }], items: [{ A: 'x' }] }
    editRows(real, { add: [{ A: 'y' }] })
    expect(real.items).toEqual([{ A: 'x' }, { A: 'y' }])
  })

  test('removing every row leaves one blank row, as the app does', () => {
    const doc = table()
    editRows(doc, { remove: [1, 2, 3, 4, 4] })
    expect(doc.items).toEqual([{ Item: '', Amount: '' }])
  })

  test('the rest of the document is untouched', () => {
    const doc = table()
    editRows(doc, { add: [{ Item: 'x' }] })
    const fresh = table()
    expect({ ...doc, items: [] }).toEqual({ ...fresh, items: [] })
  })
})

describe('plain-text columns', () => {
  // As the app's plaintext-only editor saves them: escaped text, real line breaks.
  const daily = (): TableDocument => ({
    columns: [
      { name: 'Note', type: 'Input (Plain Text)' },
      { name: 'Count', type: 'Computed', expression: "return item['Note'].split('\\n').filter((l) => l.trim()).length" },
    ],
    items: [{ Note: '✅WW3: [BE] Planning &amp; Review (4h)\nInterview (1h)' }],
  })

  test('read as the text, with real line breaks and nothing escaped', () => {
    expect(readRows(daily(), {}).rows).toEqual([{ row: 1, values: { Note: '✅WW3: [BE] Planning & Review (4h)\nInterview (1h)', Count: '2' } }])
  })

  test('written as the app writes them, so scripts that split on line breaks see every line', () => {
    const doc = daily()
    editRows(doc, { update: [{ row: 1, values: { Note: 'JHub: **review** <b> & more (2h)\n✅WW3: [BE] Planning & Review (4h)' } }] })
    expect(doc.items[0]!.Note).toBe('JHub: **review** &lt;b&gt; &amp; more (2h)\n✅WW3: [BE] Planning &amp; Review (4h)')
    expect(readRows(doc, {}).rows[0]!.values.Count).toBe('2')
    // A <br> in the line form's way is a line break too.
    editRows(doc, { update: [{ row: 1, values: { Note: 'one<br>two<br/>three' } }] })
    expect(doc.items[0]!.Note).toBe('one\ntwo\nthree')
    expect(readRows(doc, {}).rows[0]!.values.Count).toBe('3')
  })

  test('a read written back leaves the cell as it was', () => {
    const doc = daily()
    const before = doc.items[0]!.Note
    const text = readRows(doc, {}).rows[0]!.values.Note!
    editRows(doc, { update: [{ row: 1, values: { Note: text } }] })
    expect(doc.items[0]!.Note).toBe(before)
  })
})
