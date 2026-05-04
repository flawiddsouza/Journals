// Svelte action: invoke `callback` when the user clicks outside `node` or
// presses Escape. Listener attachment is deferred one tick so a click that
// triggers the node to mount does not immediately fire the callback.

export function clickOutside(node, callback) {
    function handleClick(e) {
        if (!node.contains(e.target)) callback()
    }
    function handleKey(e) {
        if (e.key === 'Escape') callback()
    }
    setTimeout(() => {
        document.addEventListener('click', handleClick)
        document.addEventListener('keyup', handleKey)
    })
    return {
        update(newCallback) {
            callback = newCallback
        },
        destroy() {
            document.removeEventListener('click', handleClick)
            document.removeEventListener('keyup', handleKey)
        },
    }
}
