import { describe, expect, test } from 'bun:test'
import { editColumns } from './tableColumns'
import { type TableDocument, parseTableDocument } from './tableDoc'
import { editRows, readRows } from './tableRows'

const table = (): TableDocument => ({
  columns: [
    { name: 'Item', label: 'Item', wrap: '', align: '', type: '', autocomplete: '', filterable: '' },
    { name: 'Amount', label: 'Amount', wrap: '', align: 'Right', type: '', autocomplete: '', filterable: '' },
    { name: 'Double', label: 'Double', wrap: '', align: '', type: 'Computed', autocomplete: '', filterable: '', expression: "return Number(item['Amount']) * 2" },
  ],
  items: [
    { Item: 'milk', Amount: '2', Double: '' },
    { Item: 'eggs', Amount: '3', Double: '' },
  ],
  totals: { Amount: "return items.reduce((a, r) => a + Number(r['Amount']), 0)" },
  widths: { Amount: '80px' },
  rowStyle: "return item['Item'] === 'milk' ? 'color: red' : ''",
  startupScript: '',
  customFunctions: '',
  note: 'a note',
})

describe('a never-saved table', () => {
  test('starts as the document the app starts from, totals included', () => {
    // The app reads totals with no fallback, so a saved document without the
    // key does not load.
    expect(parseTableDocument(null)).toEqual({ columns: [], items: [], totals: {}, widths: {}, rowStyle: '', startupScript: '', customFunctions: '', note: '' })
    expect(parseTableDocument('{"columns":[],"items":[]}').totals).toEqual({})
  })

  test('gets its first columns, a row to type in, and then data', () => {
    const doc = parseTableDocument(null)
    const result = editColumns(doc, { add: [{ name: 'Date' }, { name: ' Amount ', align: 'Right', width: '90px' }] })
    expect(result.columns).toEqual(['Date', 'Amount'])
    expect(doc.columns[1]).toEqual({ name: 'Amount', label: 'Amount', wrap: '', align: 'Right', type: '', autocomplete: '', filterable: '' })
    expect(doc.items).toEqual([{ Date: '', Amount: '' }])
    expect(doc.widths).toEqual({ Amount: '90px' })
    editRows(doc, { add: [{ Date: '01-May-26', Amount: 5 }] })
    expect(readRows(doc, {}).rows).toEqual([{ row: 0, values: { Date: '01-May-26', Amount: '5' } }])
  })
})

describe('editColumns', () => {
  test('a rename carries the cells, the total and the width, and says which scripts still use the old name', () => {
    const doc = table()
    const result = editColumns(doc, { update: [{ column: 'Amount', name: 'Qty' }] })
    expect(doc.items).toEqual([{ Item: 'milk', Double: '', Qty: '2' }, { Item: 'eggs', Double: '', Qty: '3' }])
    expect(Object.keys(doc.totals!)).toEqual(['Qty'])
    expect(doc.widths).toEqual({ Qty: '80px' })
    expect(doc.columns[1]).toMatchObject({ name: 'Qty', label: 'Qty', align: 'Right' })
    expect(result.scriptsToCheck).toEqual([{ column: 'Amount', change: 'renamed to Qty', mentionedIn: ['computed Double', 'total Amount'] }])
  })

  test('a label that was set on purpose survives a rename', () => {
    const doc = table()
    doc.columns[1]!.label = 'How many'
    editColumns(doc, { update: [{ column: 'Amount', name: 'Qty' }] })
    expect(doc.columns[1]!.label).toBe('How many')
  })

  test('a removal takes the cells, the total and the width with it', () => {
    const doc = table()
    const result = editColumns(doc, { remove: ['Amount'] })
    expect(doc.columns.map((c) => c.name)).toEqual(['Item', 'Double'])
    expect(doc.items).toEqual([{ Item: 'milk', Double: '' }, { Item: 'eggs', Double: '' }])
    expect(doc.totals).toEqual({})
    expect(doc.widths).toEqual({})
    expect(result.scriptsToCheck[0]).toMatchObject({ column: 'Amount', change: 'removed' })
  })

  test('options, widths and placing a new column', () => {
    const doc = table()
    editColumns(doc, {
      update: [{ column: 'Item', wrap: 'No', filterable: 'Yes', autocomplete: 'Yes', width: '12em' }, { column: 'Amount', width: '' }],
      add: [{ name: 'Note', before: 'Amount', type: 'Input (Plain Text)' }],
    })
    expect(doc.columns.map((c) => c.name)).toEqual(['Item', 'Note', 'Amount', 'Double'])
    expect(doc.columns[0]).toMatchObject({ wrap: 'No', filterable: 'Yes', autocomplete: 'Yes' })
    expect(doc.columns[1]!.type).toBe('Input (Plain Text)')
    expect(doc.widths).toEqual({ Item: '12em' })
    expect(doc.items[0]).toEqual({ Item: 'milk', Amount: '2', Double: '', Note: '' })
  })

  test('order names columns as the batch leaves them', () => {
    const doc = table()
    editColumns(doc, { update: [{ column: 'Amount', name: 'Qty' }], order: ['Qty', 'Double', 'Item'] })
    expect(doc.columns.map((c) => c.name)).toEqual(['Qty', 'Double', 'Item'])
    expect(() => editColumns(doc, { order: ['Qty', 'Item'] })).toThrow(/every column exactly once.*Qty, Double, Item/)
  })

  test('setting a type on a computed column turns it back into a stored one', () => {
    const doc = table()
    editColumns(doc, { update: [{ column: 'Double', type: '' }] })
    expect(doc.columns[2]).toMatchObject({ name: 'Double', type: '' })
    expect(doc.columns[2]).not.toHaveProperty('expression')
    editRows(doc, { update: [{ row: 0, values: { Double: '9' } }] })
    expect(doc.items[0]!.Double).toBe('9')
  })

  test('a bad batch changes nothing', () => {
    const doc = table()
    const before = JSON.stringify(doc)
    expect(() => editColumns(doc, { update: [{ column: 'Item', align: 'Center' }, { column: 'Nope', align: 'Center' }] })).toThrow(/No column named Nope. This table has: Item, Amount, Double/)
    expect(() => editColumns(doc, { add: [{ name: 'Fine' }, { name: 'Item' }] })).toThrow(/already a column named Item/)
    expect(() => editColumns(doc, { update: [{ column: 'Item', name: 'Amount' }] })).toThrow(/already a column named Amount/)
    expect(() => editColumns(doc, { add: [{ name: '  ' }] })).toThrow(/can't be empty/)
    expect(() => editColumns(doc, { add: [{ name: '__proto__' }] })).toThrow(/__proto__/)
    expect(() => editColumns(doc, { remove: ['Item'], add: [{ name: 'X', before: 'Nope' }] })).toThrow(/No column named Nope/)
    // update and remove name columns as they were read, not as the batch renames them
    expect(() => editColumns(doc, { update: [{ column: 'Item', name: 'Thing' }, { column: 'Thing', align: 'Center' }] })).toThrow(/No column named Thing/)
    expect(() => editColumns(doc, { update: [{ column: 'Item', name: 'Thing' }], remove: ['Thing'] })).toThrow(/No column named Thing/)
    expect(() => editColumns(doc, {})).toThrow(/Nothing to change/)
    expect(JSON.stringify(doc)).toBe(before)
  })

  test('a width is a length and nothing else, because the app puts it in a style attribute', () => {
    const doc = table()
    for (const width of ['120', 'wide', '10px; background: url(https://x.example)', 'calc(100% - 1px)']) {
      expect(() => editColumns(doc, { update: [{ column: 'Item', width }] })).toThrow(/A width is a number and a unit/)
    }
    for (const width of ['120px', '12.5em', '30%', '20ch']) editColumns(doc, { update: [{ column: 'Item', width }] })
    expect(doc.widths!.Item).toBe('20ch')
  })

  test('the rest of the document is untouched', () => {
    const doc = table()
    editColumns(doc, { add: [{ name: 'Note' }] })
    expect(doc).toMatchObject({ rowStyle: table().rowStyle!, note: 'a note', totals: table().totals!, widths: table().widths! })
  })
})
