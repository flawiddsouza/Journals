import { describe, expect, test } from 'bun:test'
import { chooseSample, parseTableDocument, profileColumn, stripHtml } from './tableDoc'

describe('parseTableDocument', () => {
  test('an empty page is an empty table', () => {
    // The full starting shape is checked in tableColumns.test.ts.
    expect(parseTableDocument(null)).toMatchObject({ columns: [], items: [] })
  })

  test('keys it does not know about survive, so a save loses nothing', () => {
    const parsed = parseTableDocument('{"columns":[],"items":[],"widths":{"A":"9px"},"future":1}')
    expect(JSON.parse(JSON.stringify(parsed))).toMatchObject({ widths: { A: '9px' }, future: 1 })
  })
})

test('stripHtml drops tags and decodes the entities cells contain', () => {
  expect(stripHtml('<b>1 &amp; 2</b>&nbsp;')).toBe('1 & 2')
  expect(stripHtml(undefined)).toBe('')
})

describe('profileColumn', () => {
  const items = [{ A: '<b>10</b>' }, { A: '5' }, { A: 'n/a' }, { A: '7' }, { A: '3' }, { A: '' }]

  test('numbers inside HTML count as numbers, and the odd one out is reported', () => {
    const profile = profileColumn({ name: 'A' }, items)
    expect(profile).toMatchObject({
      kind: 'numeric',
      nonEmpty: 5,
      parseFailures: 1,
      min: 3,
      max: 10,
      htmlTags: ['b'],
    })
  })

  test('dates in the format real pages use', () => {
    const dates = [{ D: '25-Apr-23' }, { D: '2026-01-02' }, { D: '1/2/26' }]
    expect(profileColumn({ name: 'D' }, dates).kind).toBe('date')
  })

  test('a computed column has no stored values to measure', () => {
    const profile = profileColumn({ name: 'A', type: 'Computed', expression: 'return 1' }, items)
    expect(profile).toMatchObject({ kind: 'computed', computed: true })
    expect(profile.topValues).toBeUndefined()
  })

  test('distinct counting is bounded', () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ A: `v${i}` }))
    expect(profileColumn({ name: 'A' }, many).distinct).toBe('500+')
  })
})

test('chooseSample picks the rows that break expressions, not just the first ones', () => {
  const columns = [{ name: 'A' }]
  const items = Array.from({ length: 50 }, (_, i) => ({ A: String(i) }))
  items[20] = { A: '' }
  items[30] = { A: 'not a number' }
  const profiles = columns.map((c) => profileColumn(c, items))
  const reasons = new Map(chooseSample(columns, items, profiles).map((s) => [s.rowIndex, s.reason]))
  // Row 20 is the empty cell, row 30 the longest value and the one that does
  // not parse. Some rows are picked at random first and keep that reason, so
  // only their presence is certain.
  expect(reasons.has(20)).toBe(true)
  expect(reasons.has(30)).toBe(true)
  expect(reasons.get(0)).toBe('head')
  expect(reasons.get(49)).toBe('tail')
})
