function getScrollParent(node) {
    if(node === null) {
        return null
    }
    if(node.scrollHeight > node.clientHeight) {
        return node
    } else {
        return getScrollParent(node.parentNode)
    }
}

function resizeTextarea(event) {
    const scrollParent = getScrollParent(event.target.parentNode)
    const scrollTop = scrollParent ? scrollParent.scrollTop : null
    const scrollLeft = scrollParent ? scrollParent.scrollLeft : null

    event.target.style.height = 'auto'
    event.target.style.height = (event.target.scrollHeight) + 'px'

    if(scrollParent) {
        scrollParent.scrollTo(scrollLeft, scrollTop)
    }
}

export default function autoResizeTextarea(element) {
    element.setAttribute('style', 'height:' + (element.scrollHeight) + 'px;overflow-y:hidden;')
    element.addEventListener('input', resizeTextarea)

    return {
        destroy() {
            element.removeEventListener('input', resizeTextarea)
        }
    }
}
