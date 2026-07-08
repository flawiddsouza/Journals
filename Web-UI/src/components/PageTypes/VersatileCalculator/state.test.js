import { describe, it, expect } from 'vitest'
import { SEED, normalizeSections } from './state.js'

describe('normalizeSections', () => {
  it('falls back to one empty section for null / empty / non-array', () => {
    expect(normalizeSections(null)).toEqual([{ lines: [''] }])
    expect(normalizeSections([])).toEqual([{ lines: [''] }])
    expect(normalizeSections('nope')).toEqual([{ lines: [''] }])
  })

  it('keeps valid sections and stringifies their lines', () => {
    expect(normalizeSections([{ lines: ['a', 'b'] }])).toEqual([{ lines: ['a', 'b'] }])
    expect(normalizeSections([{ lines: [1, 2] }])).toEqual([{ lines: ['1', '2'] }])
  })

  it('replaces a section with no usable lines with a single empty line', () => {
    expect(normalizeSections([{ lines: [] }])).toEqual([{ lines: [''] }])
    expect(normalizeSections([{}])).toEqual([{ lines: [''] }])
  })

  it('SEED is the canonical four lines', () => {
    expect(SEED).toEqual([
      'Dev sprint 2h',
      'Team standup 1h 30m',
      'Code cleanup 30m',
      'Team review 1h',
    ])
  })
})
