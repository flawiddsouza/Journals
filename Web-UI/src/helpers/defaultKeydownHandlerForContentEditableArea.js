import { format } from 'date-fns'

function surroundSelection(element) {
    let sel = window.getSelection()
    if(sel.toString() && sel.rangeCount) {
        var range = sel.getRangeAt(0).cloneRange()
        range.surroundContents(element)
        sel.removeAllRanges()
        sel.addRange(range)
    }
}

export default function(e) {
    // insert date into the current cell
    if(e.altKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        document.execCommand('insertHTML', false, format(new Date(), 'DD-MMM-YY'))
    }

    // insert time into the current cell
    if(e.key === 'F11') {
        e.preventDefault()
        document.execCommand('insertHTML', false, format(new Date(), '(HH:MM A) '))
    }

    // insert date time into the current cell
    if(e.key === 'F12') {
        e.preventDefault()
        document.execCommand('insertHTML', false, format(new Date(), 'DD-MMM-YY HH:MM A: '))
    }

    // create hyperlink from selection
    if(e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        let link = prompt('Enter link')
        if(link) {
            let anchorTag = document.createElement('a')
            anchorTag.href = link
            anchorTag.target = '_blank'
            anchorTag.contentEditable = false
            surroundSelection(anchorTag)
            e.target.dispatchEvent(new Event('input')) // trigger input event, so that the change is persisted to the array
        }
    }
}
