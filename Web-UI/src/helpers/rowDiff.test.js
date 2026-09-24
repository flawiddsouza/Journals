import { describe, expect, it } from 'vitest'
import { applyRowDiff, diffRows } from './rowDiff.js'

const row = (id, extra = {}) => ({ Id: String(id), Note: '', ...extra })
const kinds = (changes) => changes.map((change) => change.type)

describe('diffRows', () => {
    it('shows appended rows as additions after the last row', () => {
        const before = [row(1), row(2)]
        const after = [...structuredClone(before), row(3), row(4)]
        const changes = diffRows(before, after)
        expect(kinds(changes)).toEqual(['same', 'same', 'add', 'add'])
        expect(changes[2]).toMatchObject({ after: row(3), index: 2 })
    })

    it('reads an edited cell as a change, not a removal and an addition', () => {
        const before = [row(1), row(2), row(3)]
        const after = structuredClone(before)
        after[1].Note = 'edited'
        const changes = diffRows(before, after)
        expect(kinds(changes)).toEqual(['same', 'change', 'same'])
        expect(changes[1]).toMatchObject({ before: before[1], after: after[1], index: 1 })
    })

    it('treats an empty cell and a missing one as the same, whatever the key order', () => {
        const before = [{ Id: '1', Note: '' }]
        const after = [{ Id: '1' }]
        expect(kinds(diffRows(before, after))).toEqual(['same'])
        expect(kinds(diffRows([{ A: '1', B: '2' }], [{ B: '2', A: '1' }]))).toEqual(['same'])
    })

    it('shows removed rows with where they are now', () => {
        const before = [row(1), row(2), row(3)]
        const changes = diffRows(before, [row(1), row(3)])
        expect(kinds(changes)).toEqual(['same', 'remove', 'same'])
        expect(changes[1]).toMatchObject({ before: before[1], index: 1 })
    })
})

describe('applyRowDiff', () => {
    it('keeps only the changes taken and leaves the others as they were', () => {
        const before = [row(1), row(2), row(3)]
        const after = [row(1), row(2, { Note: 'edited' }), row(3), row(4), row(5)]
        const changes = diffRows(before, after)
        const added = changes.filter((change) => change.type === 'add')
        const taken = new Set([added[0]])
        const result = applyRowDiff(changes, taken)
        // The unchanged row is the same object, so undo and editors keep it.
        expect(result[0]).toBe(before[0])
        expect(result).toEqual([row(1), row(2), row(3), row(4)])
    })

    it('applies every change when all are taken', () => {
        const before = [row(1), row(2), row(3)]
        const after = [row(2, { Note: 'x' }), row(3), row(9)]
        const changes = diffRows(before, after)
        const result = applyRowDiff(changes, new Set(changes.filter((change) => change.type !== 'same')))
        expect(result).toEqual(after)
    })
})
