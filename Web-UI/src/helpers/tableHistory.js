// History belongs to one loaded table. Row objects are session identities, so
// inserting/filtering rows never changes which data a cell edit refers to.
export function createTableHistory() {
    const undoStack = []
    const redoStack = []
    let group = null

    function clear() {
        undoStack.length = 0
        redoStack.length = 0
        group = null
    }

    function recordCell(change) {
        if (change.before === change.after) return
        const selection = change.beforeFocus?.selection
        const continuesAtCaret = selection?.collapsed && group &&
            group.row === change.row && group.columnName === change.columnName &&
            group.after === change.before &&
            JSON.stringify(group.afterFocus?.selection) === JSON.stringify(selection)
        // Match VS Code's typing stops: the first space starts the next word's
        // operation; multiple spaces form their own operation. Paste and IME
        // arrive as separate input types and are never split into words.
        let inputTypeGroup = change.inputType
        if (change.inputType === 'insertText') {
            inputTypeGroup = 'text'
            if (change.data === ' ') {
                inputTypeGroup = continuesAtCaret &&
                    ['firstSpace', 'spaces'].includes(group.inputTypeGroup)
                    ? 'spaces' : 'firstSpace'
            }
        }
        const normalizeGroup = (type) => type === 'firstSpace' ? 'spaces' : type
        const canGroup =
            [
                'insertText',
                'deleteContentBackward',
                'deleteContentForward',
            ].includes(change.inputType) &&
            change.afterFocus?.selection?.collapsed
        // Pauses do not split a word. Moving the caret, changing cells, or
        // switching between typing and deletion closes the current operation.
        if (
            canGroup &&
            continuesAtCaret &&
            (normalizeGroup(group.inputTypeGroup) === normalizeGroup(inputTypeGroup) ||
                (group.inputTypeGroup === 'firstSpace' && change.inputType === 'insertText'))
        ) {
            group.after = change.after
            group.afterFocus = change.afterFocus
            group.inputTypeGroup = inputTypeGroup
        } else {
            const entry = { ...change, type: 'cell', inputTypeGroup }
            undoStack.push(entry)
            group = canGroup ? entry : null
        }
        redoStack.length = 0
    }

    function recordRows(change) {
        undoStack.push({ ...change, type: 'rows' })
        redoStack.length = 0
        group = null
    }

    function apply(items, redo) {
        group = null
        const source = redo ? redoStack : undoStack
        const destination = redo ? undoStack : redoStack
        const change = source.at(-1)
        if (!change) return { status: 'empty' }
        const expected = redo ? change.before : change.after
        const replacement = redo ? change.after : change.before
        let valid
        if (change.type === 'cell') {
            valid =
                items.includes(change.row) &&
                change.row[change.columnName] === expected
            if (valid) change.row[change.columnName] = replacement
        } else {
            const { index, previousRow, nextRow } = change
            valid =
                index <= items.length &&
                items[index - 1] === previousRow &&
                items[index + expected.length] === nextRow &&
                expected.every((row, offset) => items[index + offset] === row)
            if (valid) items.splice(index, expected.length, ...replacement)
        }
        if (!valid) {
            // A script or external replacement bypassed history. Never apply an
            // inverse to data that no longer matches the recorded operation.
            clear()
            return { status: 'conflict' }
        }
        source.pop()
        destination.push(change)
        return {
            status: 'applied',
            change,
            focus: redo ? change.afterFocus : change.beforeFocus,
        }
    }

    return {
        recordCell,
        recordRows,
        undo: (items) => apply(items, false),
        redo: (items) => apply(items, true),
        breakGroup() {
            group = null
        },
        clear,
    }
}

export function captureCellSelection(cell) {
    const selection = cell.ownerDocument.getSelection()
    if (
        !selection?.anchorNode ||
        !cell.contains(selection.anchorNode) ||
        !cell.contains(selection.focusNode)
    )
        return null
    function point(node, offset) {
        const path = []
        while (node !== cell) {
            path.unshift(
                Array.prototype.indexOf.call(node.parentNode.childNodes, node),
            )
            node = node.parentNode
        }
        return { path, offset }
    }
    return {
        anchor: point(selection.anchorNode, selection.anchorOffset),
        focus: point(selection.focusNode, selection.focusOffset),
        collapsed: selection.isCollapsed,
    }
}

export function restoreCellSelection(cell, bookmark) {
    const selection = cell.ownerDocument.getSelection()
    function point(saved) {
        let node = cell
        for (const index of saved.path) {
            node = node.childNodes[index]
            if (!node) return null
        }
        const length =
            node.nodeType === 3 ? node.length : node.childNodes.length
        return { node, offset: Math.min(saved.offset, length) }
    }
    const anchor = bookmark && point(bookmark.anchor)
    const focus = bookmark && point(bookmark.focus)
    if (anchor && focus) {
        selection.setBaseAndExtent(
            anchor.node,
            anchor.offset,
            focus.node,
            focus.offset,
        )
    } else {
        const range = cell.ownerDocument.createRange()
        range.selectNodeContents(cell)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
    }
}
