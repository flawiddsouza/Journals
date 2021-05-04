function resizeTextarea(event) {
    event.target.style.height = 'auto'
    event.target.style.height = (event.target.scrollHeight) + 'px'
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
