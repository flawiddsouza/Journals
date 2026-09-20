import { describe, expect, test } from 'bun:test'
import { editWidgets } from './tableStats'
import type { TableDocument } from './tableDoc'

const ids = () => {
  let n = 0
  return () => `id-${++n}`
}

const doc = (): TableDocument => ({
  columns: [{ name: 'Amount' }],
  items: [{ Amount: '1' }],
  stats: {
    widgets: [
      { id: 'a', title: 'Rows', type: 'stat', colSpan: 2, align: 'center', expression: 'return items.length' },
      { id: 'b', title: 'By category', type: 'bar', colSpan: 4, expression: 'return { labels: [], values: [] }' },
    ],
  },
})

describe('adding', () => {
  test('a widget lands at the end with the defaults the app uses', () => {
    const page = doc()
    const result = editWidgets(page, { add: [{ title: 'Total', type: 'stat', expression: 'return 1' }] }, ids())
    expect(result.added).toEqual(['id-1'])
    expect(page.stats!.widgets!.map((w) => w.id)).toEqual(['a', 'b', 'id-1'])
    expect(page.stats!.widgets![2]).toEqual({ id: 'id-1', title: 'Total', type: 'stat', colSpan: 2, align: 'left', expression: 'return 1' })
  })

  test('a chart carries no align', () => {
    const page = doc()
    editWidgets(page, { add: [{ title: 'Pie', type: 'pie', colSpan: 6, align: 'center', expression: '' }] }, ids())
    expect(page.stats!.widgets![2]).toEqual({ id: 'id-1', title: 'Pie', type: 'pie', colSpan: 6, expression: '' })
  })

  test('before puts it above another widget', () => {
    const page = doc()
    editWidgets(page, { add: [{ title: 'First', type: 'stat', expression: '', before: 'a' }] }, ids())
    expect(page.stats!.widgets!.map((w) => w.title)).toEqual(['First', 'Rows', 'By category'])
  })

  test('a table with no widgets yet gets the key', () => {
    const page: TableDocument = { columns: [], items: [] }
    editWidgets(page, { add: [{ title: 'One', type: 'stat', expression: '' }] }, ids())
    expect(page.stats).toEqual({ widgets: [{ id: 'id-1', title: 'One', type: 'stat', colSpan: 2, align: 'left', expression: '' }] })
  })

  test('an empty title is refused', () => {
    expect(() => editWidgets(doc(), { add: [{ title: '  ', type: 'stat', expression: '' }] }, ids())).toThrow(/title/)
  })
})

describe('updating', () => {
  test('one field at a time, leaving the rest alone', () => {
    const page = doc()
    editWidgets(page, { update: [{ widget: 'a', title: 'Row count' }] }, ids())
    expect(page.stats!.widgets![0]).toEqual({ id: 'a', title: 'Row count', type: 'stat', colSpan: 2, align: 'center', expression: 'return items.length' })
  })

  test('turning a stat into a chart drops its align', () => {
    const page = doc()
    editWidgets(page, { update: [{ widget: 'a', type: 'line' }] }, ids())
    expect(page.stats!.widgets![0]!.align).toBeUndefined()
  })

  test('turning a chart into a stat gives it one', () => {
    const page = doc()
    editWidgets(page, { update: [{ widget: 'b', type: 'stat' }] }, ids())
    expect(page.stats!.widgets![1]!.align).toBe('left')
  })

  // A stat widget saved before align existed. The app writes align on every
  // stat it saves, so this is what an older page looks like.
  const noAlign = (): TableDocument => ({
    columns: [],
    items: [],
    stats: { widgets: [{ id: 'a', title: 'Rows', type: 'stat', colSpan: 2, expression: 'return items.length' }] },
  })

  test('a widget that never had an align is not given one by an unrelated change', () => {
    const page = noAlign()
    editWidgets(page, { update: [{ widget: 'a', title: 'Row count' }] }, ids())
    expect(page.stats!.widgets![0]).toEqual({ id: 'a', title: 'Row count', type: 'stat', colSpan: 2, expression: 'return items.length' })
  })

  test('asking for an align gives one, on a stat widget that lacks it', () => {
    const page = noAlign()
    editWidgets(page, { update: [{ widget: 'a', align: 'right' }] }, ids())
    expect(page.stats!.widgets![0]!.align).toBe('right')
  })

  test('an unknown id names the ones that exist', () => {
    expect(() => editWidgets(doc(), { update: [{ widget: 'nope', title: 'x' }] }, ids())).toThrow(/a \(Rows\), b \(By category\)/)
  })
})

describe('removing and ordering', () => {
  test('a removal takes the widget and its expression', () => {
    const page = doc()
    const result = editWidgets(page, { remove: ['a'] }, ids())
    expect(result.removed).toEqual(['a'])
    expect(page.stats!.widgets!.map((w) => w.id)).toEqual(['b'])
  })

  test('removing the last one leaves an empty list, not a missing key', () => {
    const page = doc()
    editWidgets(page, { remove: ['a', 'b'] }, ids())
    expect(page.stats).toEqual({ widgets: [] })
  })

  test('anything else stats carries is left alone, as the app leaves it', () => {
    const page = doc()
    ;(page.stats as Record<string, unknown>).layout = 'wide'
    editWidgets(page, { remove: ['a'] }, ids())
    expect((page.stats as Record<string, unknown>).layout).toBe('wide')
  })

  test('order names them as the batch leaves them', () => {
    const page = doc()
    editWidgets(page, { remove: ['a'], order: ['b'] }, ids())
    expect(page.stats!.widgets!.map((w) => w.id)).toEqual(['b'])
  })

  test('ordering a widget added in the same batch is refused, since its id is minted here', () => {
    const page = doc()
    let message = ''
    try {
      editWidgets(page, { add: [{ title: 'New', type: 'stat', expression: '' }], order: ['id-1', 'b', 'a'] }, ids())
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toMatch(/cannot name a widget added in the same batch.*before/s)
    // Refused whole: the widget is not added either, so the id minted while
    // working it out is never saved and must not be handed back as if it were.
    expect(page.stats!.widgets!.map((w) => w.id)).toEqual(['a', 'b'])
    expect(message).not.toContain('id-1')
  })

  test('a partial order is refused', () => {
    expect(() => editWidgets(doc(), { order: ['a'] }, ids())).toThrow(/every widget exactly once/)
  })

  test('a bad id anywhere in the batch changes nothing', () => {
    const page = doc()
    expect(() => editWidgets(page, { update: [{ widget: 'a', title: 'Renamed' }], remove: ['nope'] }, ids())).toThrow()
    expect(page.stats!.widgets![0]!.title).toBe('Rows')
  })

  test('an empty batch is refused', () => {
    expect(() => editWidgets(doc(), {}, ids())).toThrow(/Nothing to change/)
  })
})
