import { describe, expect, it } from 'vitest'
import { createTableHistory } from './tableHistory.js'

const focus = (row, offset) => ({
    row,
    columnName: 'value',
    selection: {
        anchor: { path: [0], offset },
        focus: { path: [0], offset },
        collapsed: true,
    },
})
function edit(history, row, after, inputType = 'insertText') {
    const before = row.value
    history.recordCell({
        row,
        columnName: 'value',
        before,
        after,
        inputType,
        data: inputType === 'insertText' && after.startsWith(before)
            ? after.slice(before.length) : null,
        beforeFocus: focus(row, before.length),
        afterFocus: focus(row, after.length),
    })
    row.value = after
}

describe('table history', () => {
    it('groups adjacent typing, then undoes and redoes the whole burst', () => {
        const history = createTableHistory()
        const row = { value: '' }
        edit(history, row, 'a')
        edit(history, row, 'ab')
        expect(history.undo([row]).focus).toEqual(focus(row, 0))
        expect(row.value).toBe('')
        expect(history.undo([row]).status).toBe('empty')
        expect(history.redo([row]).focus).toEqual(focus(row, 2))
        expect(row.value).toBe('ab')
    })

    it.each(['caret', 'paste', 'deletion', 'blur'])(
        'ends a typing group on %s',
        (boundary) => {
            const history = createTableHistory()
            const row = { value: '' }
            edit(history, row, 'a')
            if (boundary === 'caret' || boundary === 'blur')
                history.breakGroup()
            edit(
                history,
                row,
                boundary === 'deletion' ? '' : 'ab',
                boundary === 'paste'
                    ? 'insertFromPaste'
                    : boundary === 'deletion'
                      ? 'deleteContentBackward'
                      : 'insertText',
            )
            history.undo([row])
            expect(row.value).toBe('a')
        },
    )

    it('separates typing after backspace from the deletion operation', () => {
        const history = createTableHistory()
        const row = { value: 'abc' }
        edit(history, row, 'ab', 'deleteContentBackward')
        edit(history, row, 'abx')
        history.undo([row])
        expect(row.value).toBe('ab')
        history.undo([row])
        expect(row.value).toBe('abc')
        history.redo([row])
        history.redo([row])
        expect(row.value).toBe('abx')
    })

    it.each([
        ['cat bat', ['cat', '']],
        ['ab  cd', ['ab  ', 'ab', '']],
        ['first and interesting', ['first and', 'first', '']],
        ['cat,bat!', ['']],
    ])('uses VS Code typing boundaries for %s', (text, expected) => {
        const history = createTableHistory()
        const row = { value: '' }
        for (const character of text) edit(history, row, row.value + character)
        for (const value of expected) {
            history.undo([row])
            expect(row.value).toBe(value)
        }
        for (let index = 0; index < expected.length; index++) history.redo([row])
        expect(row.value).toBe(text)
    })

    it('keeps replacement typing together while preserving the initial selection', () => {
        const history = createTableHistory()
        const row = { value: 'old' }
        const beforeFocus = focus(row, 0)
        beforeFocus.selection.focus.offset = 3
        beforeFocus.selection.collapsed = false
        history.recordCell({
            row, columnName: 'value', before: 'old', after: 'n',
            inputType: 'insertText', beforeFocus, afterFocus: focus(row, 1),
        })
        row.value = 'n'
        edit(history, row, 'new')
        expect(history.undo([row]).focus).toEqual(beforeFocus)
        expect(row.value).toBe('old')
        history.redo([row])
        expect(row.value).toBe('new')
    })

    it('discards redo after a new edit, but not after a no-op input', () => {
        const history = createTableHistory()
        const row = { value: 'a' }
        edit(history, row, 'ab')
        history.undo([row])
        edit(history, row, 'a')
        expect(history.redo([row]).status).toBe('applied')
        history.undo([row])
        edit(history, row, 'ac')
        expect(history.redo([row]).status).toBe('empty')
        expect(row.value).toBe('ac')
    })

    it('reverses mixed cell edits and row insertions in order without changing other rows', () => {
        const history = createTableHistory()
        const a = { value: 'A' },
            b = { value: 'B' },
            inserted = { value: '' }
        const items = [a, b]
        edit(history, b, 'B2')
        history.recordRows({
            index: 0,
            before: [],
            after: [inserted],
            nextRow: a,
        })
        items.splice(0, 0, inserted)
        edit(history, inserted, 'new')
        history.undo(items)
        expect(items.map((row) => row.value)).toEqual(['', 'A', 'B2'])
        history.undo(items)
        expect(items).toEqual([a, b])
        history.undo(items)
        expect(b.value).toBe('B')
        history.redo(items)
        history.redo(items)
        history.redo(items)
        expect(items.map((row) => row.value)).toEqual(['new', 'A', 'B2'])
    })

    it('restores the final row as one operation without discarding an empty row', () => {
        const history = createTableHistory()
        const row = { value: 'A' },
            empty = { value: '' }
        const items = [empty]
        history.recordRows({ index: 0, before: [row], after: [empty] })
        history.undo(items)
        expect(items).toEqual([row])
        history.redo(items)
        expect(items).toEqual([empty])
        expect(history.redo(items).status).toBe('empty')
    })

    it('refuses to overwrite a cell changed outside history', () => {
        const history = createTableHistory()
        const row = { value: 'A' }
        edit(history, row, 'B')
        row.value = 'external'
        expect(history.undo([row]).status).toBe('conflict')
        expect(row.value).toBe('external')
        expect(history.undo([row]).status).toBe('empty')
    })

    it('refuses to restore rows into a stale position', () => {
        const history = createTableHistory()
        const a = { value: 'A' },
            b = { value: 'B' },
            c = { value: 'C' }
        history.recordRows({
            index: 1,
            before: [b],
            after: [],
            previousRow: a,
            nextRow: c,
        })
        const items = [c, a]
        expect(history.undo(items).status).toBe('conflict')
        expect(items).toEqual([c, a])
    })
})
