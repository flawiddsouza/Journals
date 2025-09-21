export function placeCaretAtEnd(element) {
    element.focus()
    if (
        typeof window.getSelection != 'undefined' &&
        typeof document.createRange != 'undefined'
    ) {
        var range = document.createRange()
        range.selectNodeContents(element)
        range.collapse(false)
        var sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
    } else if (typeof document.body.createTextRange != 'undefined') {
        var textRange = document.body.createTextRange()
        textRange.moveToElementText(element)
        textRange.collapse(false)
        textRange.select()
    }
}

export function restoreCursorPosition(savedCursorPosition) {
    if (window.getSelection) {
        var s = window.getSelection()
        if (s.rangeCount > 0) {
            s.removeAllRanges()
        }
        s.addRange(savedCursorPosition)
    } else if (document.createRange) {
        window.getSelection().addRange(savedCursorPosition)
    }
}

export function insertElementAtCursor(element) {
    let selection = window.getSelection()
    let range = selection.getRangeAt(0)
    range.deleteContents()
    range.insertNode(element)
    range.collapse(false)
}
