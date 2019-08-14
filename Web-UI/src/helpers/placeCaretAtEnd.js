export default function placeCaretAtEnd(element) {
    element.focus()
    if(typeof window.getSelection != "undefined" && typeof document.createRange != "undefined") {
        var range = document.createRange()
        range.selectNodeContents(element)
        range.collapse(false)
        var sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
    } else if(typeof document.body.createTextRange != "undefined") {
        var textRange = document.body.createTextRange()
        textRange.moveToElementText(element)
        textRange.collapse(false)
        textRange.select()
    }
}
