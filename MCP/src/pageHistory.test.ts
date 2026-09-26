import { describe, expect, test } from 'bun:test'
import { diffPageLines, diffTableDocuments, textDiff } from './pageHistory'

describe('diffPageLines', () => {
  const lines = (count: number) => Array.from({ length: count }, (_, i) => `line ${i + 1}`)

  test('one hunk per change with two lines of context, and old numbers on removed lines', () => {
    const older = lines(12)
    const newer = [...older]
    newer.splice(1, 1, 'changed 2')
    newer.splice(10, 1)
    expect(diffPageLines(older, newer).map((h) => h.text)).toEqual([
      ['  1\tline 1', '- 2\tline 2', '+ 2\tchanged 2', '  3\tline 3', '  4\tline 4'].join('\n'),
      ['  9\tline 9', '  10\tline 10', '- 11\tline 11', '  11\tline 12'].join('\n'),
    ])
  })

  test('changes whose contexts touch share a hunk', () => {
    const older = lines(8)
    const newer = older.map((line, i) => (i === 1 || i === 6 ? line + '!' : line))
    expect(diffPageLines(older, newer)).toHaveLength(1)
  })

  test('no hunks when nothing changed', () => {
    expect(diffPageLines(lines(3), lines(3))).toEqual([])
  })
})

describe('textDiff', () => {
  test('an edited last line shows as a removed and an added line', () => {
    expect(textDiff('a\nb', 'a\nc')).toBe('  a\n- b\n+ c')
  })
})

describe('diffTableDocuments', () => {
  test('rows are numbered in the version they are in', () => {
    const columns = [{ name: 'Item' }]
    const diff = diffTableDocuments(
      { columns, items: [{ Item: 'a' }, { Item: 'b' }, { Item: 'c' }] },
      { columns, items: [{ Item: 'b' }, { Item: 'c!' }, { Item: 'd' }] },
    )
    expect(diff.rows.map((r) => [r.type, r.rowNumber])).toEqual([
      ['remove', 1],
      ['change', 2],
      ['add', 3],
    ])
  })
})
