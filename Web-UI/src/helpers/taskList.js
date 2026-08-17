export function createEmptyTaskListDocument() {
    return {
        type: 'doc',
        content: [
            {
                type: 'taskList',
                content: [createTaskItem('', false)],
            },
        ],
    }
}

export function createTaskItem(text = '', checked = false) {
    const paragraph = { type: 'paragraph' }

    if (text) {
        paragraph.content = [{ type: 'text', text }]
    }

    return {
        type: 'taskItem',
        attrs: { checked },
        content: [paragraph],
    }
}

function parseTaskLine(line) {
    const whitespace = line.match(/^\s*/)?.[0] || ''
    const indent = [...whitespace].reduce(
        (total, character) => total + (character === '\t' ? 4 : 1),
        0,
    )
    let text = line.slice(whitespace.length)
    let checked = false

    const checkbox = text.match(/^(?:[-*+]\s+)?\[([ xX])\]\s*/)
    if (checkbox) {
        checked = checkbox[1].toLowerCase() === 'x'
        text = text.slice(checkbox[0].length)
    } else {
        text = text.replace(/^(?:[-*+\u2022]|\d+[.)])\s+/, '')
    }

    return { indent, text, checked }
}

export function taskTextToItems(text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n')

    while (lines.length > 1 && lines[lines.length - 1] === '') {
        lines.pop()
    }

    const items = []
    const levels = [{ indent: 0, items }]

    for (const line of lines) {
        const task = parseTaskLine(line)

        while (
            levels.length > 1 &&
            task.indent < levels[levels.length - 1].indent
        ) {
            levels.pop()
        }

        const level = levels[levels.length - 1]
        const item_previous = level.items[level.items.length - 1]

        if (task.indent > level.indent && item_previous) {
            const items_nested = []
            item_previous.content.push({
                type: 'taskList',
                content: items_nested,
            })
            levels.push({ indent: task.indent, items: items_nested })
        }

        levels[levels.length - 1].items.push(
            createTaskItem(task.text, task.checked),
        )
    }

    return items.length > 0 ? items : [createTaskItem()]
}

export function countTaskItems(document) {
    let total = 0
    let completed = 0

    function visit(node) {
        if (node?.type === 'taskItem') {
            total += 1
            if (node.attrs?.checked) completed += 1
        }

        node?.content?.forEach(visit)
    }

    visit(document)
    return { total, completed }
}
