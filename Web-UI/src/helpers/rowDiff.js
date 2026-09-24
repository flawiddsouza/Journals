// What a pull script would change in a Table, as rows added, changed and
// removed, and the rows that result from keeping only some of those changes.

import { diffArrays } from 'diff'

// An empty cell and a missing one read the same, and key order means nothing.
function rowKey(row) {
    return JSON.stringify(
        Object.keys(row)
            .filter((key) => row[key] !== '' && row[key] !== null && row[key] !== undefined)
            .sort()
            .map((key) => [key, row[key]]),
    )
}

export const sameRow = (left, right) => rowKey(left) === rowKey(right)

/**
 * Every row of before and after in order, as
 *   { type: 'same', before }
 *   { type: 'add', after, index }        index: the row it would become
 *   { type: 'remove', before, index }    index: the row it is now
 *   { type: 'change', before, after, index }
 * A run of removed rows followed by added ones is read as rows changed in
 * place, pairing them in order, so an edited cell shows as a change.
 */
export function diffRows(before, after) {
    const parts = diffArrays(before, after, { comparator: sameRow })
    const changes = []
    // Rows are taken from before and after by position: diffArrays gives back
    // after's copy of an unchanged row, and the table has to keep its own.
    let beforeIndex = 0
    let afterIndex = 0
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        if (!part.added && !part.removed) {
            for (let k = 0; k < part.value.length; k++) {
                changes.push({ type: 'same', before: before[beforeIndex] })
                beforeIndex++
                afterIndex++
            }
            continue
        }
        const next = parts[i + 1]
        let removedCount = part.removed ? part.value.length : 0
        let addedCount = part.added ? part.value.length : 0
        if (next && (next.added || next.removed) && next.added !== part.added) {
            if (next.removed) removedCount = next.value.length
            else addedCount = next.value.length
            i++
        }
        const removed = before.slice(beforeIndex, beforeIndex + removedCount)
        const added = after.slice(afterIndex, afterIndex + addedCount)
        afterIndex += addedCount
        const paired = Math.min(removed.length, added.length)
        for (let k = 0; k < paired; k++) {
            changes.push({ type: 'change', before: removed[k], after: added[k], index: beforeIndex })
            beforeIndex++
        }
        for (const row of removed.slice(paired)) {
            changes.push({ type: 'remove', before: row, index: beforeIndex })
            beforeIndex++
        }
        for (const row of added.slice(paired)) {
            changes.push({ type: 'add', after: row, index: beforeIndex })
        }
    }
    return changes
}

/** The rows that result from taking the changes in `taken` (a Set of changes
 *  from diffRows) and leaving the rest as they are. */
export function applyRowDiff(changes, taken) {
    const rows = []
    for (const change of changes) {
        if (change.type === 'same') rows.push(change.before)
        else if (change.type === 'add') {
            if (taken.has(change)) rows.push(change.after)
        } else if (change.type === 'remove') {
            if (!taken.has(change)) rows.push(change.before)
        } else {
            rows.push(taken.has(change) ? change.after : change.before)
        }
    }
    return rows
}
