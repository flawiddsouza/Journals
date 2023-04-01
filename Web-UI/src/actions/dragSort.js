export function dragSort(node, { item, onSort }) {
    function handleDragStart(e) {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', JSON.stringify(item))
    }

    function handleDragOver(e) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }

    function handleDrop(e) {
        e.preventDefault()
        const draggedItem = JSON.parse(e.dataTransfer.getData('text/plain'))
        if (draggedItem && draggedItem.id !== item.id) {
            onSort(draggedItem, item)
        }
    }

    node.addEventListener('dragstart', handleDragStart)
    node.addEventListener('dragover', handleDragOver)
    node.addEventListener('drop', handleDrop)

    node.draggable = true

    return {
        update(newOptions) {
            if (newOptions.onSort) {
                onSort = newOptions.onSort
            }

            if (newOptions.item) {
                item = newOptions.item
            }
        },
        destroy() {
            node.removeEventListener('dragstart', handleDragStart)
            node.removeEventListener('dragover', handleDragOver)
            node.removeEventListener('drop', handleDrop)
        },
    }
}
