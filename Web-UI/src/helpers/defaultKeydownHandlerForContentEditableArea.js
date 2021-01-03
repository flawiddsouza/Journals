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

function nextNode(node) {
    if(node.hasChildNodes()) {
        return node.firstChild
    } else {
        while (node && !node.nextSibling) {
            node = node.parentNode
        }
        if(!node) {
            return null
        }
        return node.nextSibling
    }
}

function getRangeSelectedNodes(range) {
    var node = range.startContainer
    var endNode = range.endContainer

    // Special case for a range that is contained within a single node
    if(node == endNode) {
        return [node];
    }

    // Iterate nodes until we hit the end container
    var rangeNodes = [];
    while (node && node != endNode) {
        rangeNodes.push(node = nextNode(node))
    }

    // Add partially selected nodes at the start of the range
    node = range.startContainer
    while(node && node != range.commonAncestorContainer) {
        rangeNodes.unshift(node)
        node = node.parentNode
    }

    return rangeNodes
}

// From: https://stackoverflow.com/a/7784176/4932305
function getSelectedNodes() {
    if (window.getSelection) {
        var sel = window.getSelection()
        if (!sel.isCollapsed) {
            return getRangeSelectedNodes(sel.getRangeAt(0))
        }
    }
    return []
}

export default function(e) {
    // insert date into the current cell
    if(e.altKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        document.execCommand('insertHTML', false, format(new Date(), 'DD-MMM-YY'))
    }

    // insert time into the current cell
    if(e.key === 'F11') {
        e.preventDefault()
        document.execCommand('insertHTML', false, format(new Date(), '(hh:mm A) '))
    }

    // insert date time into the current cell
    if(e.key === 'F12') {
        e.preventDefault()
        document.execCommand('insertHTML', false, format(new Date(), 'DD-MMM-YY hh:mm A: '))
    }

    // create hyperlink from selection
    if(e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()

        // make selected anchor links contenteditable false (copy pasted links
        // are not contenteditable false by default, hence this conversion is useful to make them clickable)
        let selectedAnchorLinks = getSelectedNodes().filter(element => element.tagName === 'A')
        if(selectedAnchorLinks.length > 0) {
            if(confirm('Make selected links clickable?')) {
                selectedAnchorLinks.forEach(a => {
                    a.contentEditable = false
                    a.target = '_blank' // also make it open in a new tab, if it already isn't doing that
                })
                e.target.dispatchEvent(new Event('input')) // trigger input event, so that the change is persisted to the array
            }
            return // function exits here and create link is not triggered
        }

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
