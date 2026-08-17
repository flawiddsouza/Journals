<script>
import { Editor, Node as TiptapNode } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Fragment, Node, Slice } from '@tiptap/pm/model'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import fetchPlus from '../../helpers/fetchPlus.js'
import debounce from '../../helpers/debounce.js'
import {
    countTaskItems,
    createEmptyTaskListDocument,
    createTaskItem,
    taskTextToItems,
} from '../../helpers/taskList.js'

export let pageId = null
export let viewOnly = false
export let pageContentOverride = undefined
export let style = ''

const TaskDocument = TiptapNode.create({
    name: 'doc',
    topNode: true,
    content: 'taskList',
})

const extensions = [
    TaskDocument,
    StarterKit.configure({
        document: false,
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        orderedList: false,
    }),
    TaskList.configure({ HTMLAttributes: { class: 'task-list-items' } }),
    TaskItem.configure({
        nested: true,
        HTMLAttributes: { class: 'task-list-item' },
    }),
]

let editor
let loaded = false
let loadError = false
let pageContent = createEmptyTaskListDocument()
let taskCount = countTaskItems(pageContent)

function parsePageContent(content) {
    if (!content) return createEmptyTaskListDocument()

    const content_resolved =
        typeof content === 'string' ? JSON.parse(content) : content

    if (content_resolved?.type !== 'doc') {
        throw new Error('Invalid task list content')
    }

    return content_resolved
}

function applyPageContentOverride(content) {
    try {
        pageContent = parsePageContent(content)
        taskCount = countTaskItems(pageContent)
        loadError = false
        editor?.commands.setContent(pageContent, false)
    } catch (error) {
        console.error('Error parsing task list content', error)
        loadError = true
    }

    loaded = true
}

$: if (pageContentOverride !== undefined) {
    applyPageContentOverride(pageContentOverride)
}

$: if (pageContentOverride === undefined) {
    fetchPage(pageId)
}

$: if (editor) {
    editor.setEditable(!viewOnly && pageContentOverride === undefined)
}

function fetchPage(pageId) {
    if (!pageId) return

    loaded = false
    loadError = false
    fetchPlus
        .get(`/pages/content/${pageId}`)
        .then((response) => {
            pageContent = parsePageContent(response.content)
            taskCount = countTaskItems(pageContent)
            loadError = false
            loaded = true
        })
        .catch((error) => {
            console.error('Error loading task list content', error)
            loadError = true
            loaded = true
        })
}

const savePageContent = debounce(function () {
    if (!pageId || viewOnly || pageContentOverride !== undefined) return

    fetchPlus
        .put(`/pages/${pageId}`, {
            pageContent: JSON.stringify(pageContent),
        })
        .catch(() => {
            alert('Page Save Failed')
        })
}, 500)

function getTaskItemContext($position = editor.state.selection.$from) {
    let taskItemDepth = null

    for (let depth = $position.depth; depth > 0; depth -= 1) {
        if ($position.node(depth).type.name === 'taskItem') {
            taskItemDepth = depth
            break
        }
    }

    if (taskItemDepth === null) return null

    return {
        taskItem: $position.node(taskItemDepth),
        taskItemDepth,
        taskItemStart: $position.before(taskItemDepth),
        taskItemEnd: $position.after(taskItemDepth),
        taskList: $position.node(taskItemDepth - 1),
        taskListStart: $position.before(taskItemDepth - 1),
    }
}

function getSelectedTaskItemContext() {
    return getTaskItemContext()
}

function isTaskItemTextEmpty(taskItem) {
    return taskItem?.firstChild?.content.size === 0
}

function isCaretAtTaskTextStart() {
    const selection = window.getSelection()
    if (!selection?.isCollapsed || !selection.anchorNode) return false

    const anchorElement =
        selection.anchorNode.nodeType === 1
            ? selection.anchorNode
            : selection.anchorNode.parentElement
    const paragraph = anchorElement?.closest('.task-list-item > div > p')
    if (!paragraph) return false
    if (paragraph.parentElement?.firstElementChild !== paragraph) return false

    const contentBeforeCaret = document.createRange()
    contentBeforeCaret.selectNodeContents(paragraph)
    contentBeforeCaret.setEnd(selection.anchorNode, selection.anchorOffset)
    return (
        contentBeforeCaret.toString().length === 0 &&
        !contentBeforeCaret.cloneContents().querySelector('br')
    )
}

function removeLeadingEmptyParagraphFromSelectedTask() {
    const taskItemContext = getSelectedTaskItemContext()
    const firstParagraph = taskItemContext?.taskItem.firstChild
    const secondBlock =
        taskItemContext?.taskItem.childCount > 1
            ? taskItemContext.taskItem.child(1)
            : null

    if (
        firstParagraph?.type.name !== 'paragraph' ||
        firstParagraph.content.size !== 0 ||
        secondBlock?.type.name !== 'paragraph'
    ) {
        return
    }

    const firstParagraphStart = taskItemContext.taskItemStart + 1
    const transaction = editor.state.tr.delete(
        firstParagraphStart,
        firstParagraphStart + firstParagraph.nodeSize,
    )
    transaction.setSelection(
        TextSelection.near(
            transaction.doc.resolve(firstParagraphStart),
            1,
        ),
    )
    editor.view.dispatch(transaction.scrollIntoView())
}

function getSelectedSiblingTaskItems() {
    const { doc, selection } = editor.state

    if (
        selection instanceof NodeSelection &&
        selection.node.type.name === 'taskItem'
    ) {
        return [
            {
                taskItem: selection.node,
                taskItemStart: selection.from,
                taskItemEnd: selection.to,
            },
        ]
    }

    if (selection.empty) {
        const taskItemContext = getSelectedTaskItemContext()
        return taskItemContext ? [taskItemContext] : []
    }

    if (selection.from === 0 && selection.to === doc.content.size) {
        const taskItems = []
        let taskItemStart = 1

        doc.firstChild.forEach((taskItem) => {
            taskItems.push({
                taskItem,
                taskItemStart,
                taskItemEnd: taskItemStart + taskItem.nodeSize,
            })
            taskItemStart += taskItem.nodeSize
        })
        return taskItems
    }

    const taskItemContextFrom = getTaskItemContext(selection.$from)
    const selectionTo = Math.max(selection.from, selection.to - 1)
    const taskItemContextTo = getTaskItemContext(doc.resolve(selectionTo))

    if (!taskItemContextFrom || !taskItemContextTo) return []

    if (
        selectionTo < taskItemContextFrom.taskItemEnd &&
        taskItemContextTo.taskItemDepth > taskItemContextFrom.taskItemDepth
    ) {
        return [taskItemContextFrom]
    }

    if (
        taskItemContextFrom.taskItemDepth !== taskItemContextTo.taskItemDepth ||
        taskItemContextFrom.taskList !== taskItemContextTo.taskList
    ) {
        return []
    }

    const taskItems = []
    let taskItemStart = taskItemContextFrom.taskListStart + 1

    taskItemContextFrom.taskList.forEach((taskItem) => {
        const taskItemEnd = taskItemStart + taskItem.nodeSize

        if (
            taskItemStart >= taskItemContextFrom.taskItemStart &&
            taskItemStart <= taskItemContextTo.taskItemStart
        ) {
            taskItems.push({ taskItem, taskItemStart, taskItemEnd })
        }
        taskItemStart = taskItemEnd
    })

    return taskItems
}

function duplicateSelectedTasks() {
    if (!editor) return false

    const taskItems = getSelectedSiblingTaskItems()
    if (taskItems.length === 0) return false

    const taskItemsDuplicated = Fragment.fromArray(
        taskItems.map(({ taskItem }) => taskItem.copy(taskItem.content)),
    )
    const insertPosition = taskItems[taskItems.length - 1].taskItemEnd
    const transaction = editor.state.tr.insert(
        insertPosition,
        taskItemsDuplicated,
    )
    transaction.setSelection(
        TextSelection.near(transaction.doc.resolve(insertPosition + 2), 1),
    )
    editor.view.dispatch(transaction.scrollIntoView())
    editor.view.focus()
    return true
}

function toggleOutlineSelection() {
    const { selection } = editor.state

    if (
        selection instanceof NodeSelection &&
        selection.node.type.name === 'taskItem'
    ) {
        const transaction = editor.state.tr.setSelection(
            TextSelection.near(editor.state.doc.resolve(selection.from + 1), 1),
        )
        editor.view.dispatch(transaction)
        editor.view.focus()
        return true
    }

    const taskItemContext = getSelectedTaskItemContext()
    if (!taskItemContext) return false

    const transaction = editor.state.tr.setSelection(
        NodeSelection.create(editor.state.doc, taskItemContext.taskItemStart),
    )
    editor.view.dispatch(transaction.scrollIntoView())
    editor.view.focus()
    return true
}

function handleTaskListKeydown(event) {
    if (!editor || event.isComposing) return

    if (
        event.key.toLowerCase() === 'd' &&
        event.shiftKey &&
        (event.ctrlKey || event.metaKey)
    ) {
        event.preventDefault()
        event.stopPropagation()
        duplicateSelectedTasks()
        return
    }

    if (
        event.key === 'Escape' &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
    ) {
        if (toggleOutlineSelection()) {
            event.preventDefault()
            event.stopPropagation()
        }
        return
    }

    if (
        event.key === ' ' &&
        editor.state.selection instanceof NodeSelection &&
        editor.state.selection.node.type.name === 'taskItem'
    ) {
        event.preventDefault()
        event.stopPropagation()

        const { selection } = editor.state
        const transaction = editor.state.tr.setNodeMarkup(
            selection.from,
            undefined,
            {
                ...selection.node.attrs,
                checked: !selection.node.attrs.checked,
            },
        )
        editor.view.dispatch(transaction)
        return
    }

    if (
        (event.key === 'Backspace' || event.key === 'Delete') &&
        editor.state.selection instanceof NodeSelection &&
        editor.state.selection.node.type.name === 'taskItem'
    ) {
        event.preventDefault()
        event.stopPropagation()
        editor.commands.deleteSelection()
        editor.view.focus()
        return
    }

    if (
        event.key === 'Backspace' &&
        editor.state.selection.empty &&
        isTaskItemTextEmpty(getSelectedTaskItemContext()?.taskItem)
    ) {
        event.preventDefault()
        event.stopPropagation()

        const taskItemContext = getSelectedTaskItemContext()
        let taskItemsNested = Fragment.empty
        taskItemContext.taskItem.forEach((child) => {
            if (child.type.name === 'taskList') {
                taskItemsNested = child.content
            }
        })

        let selectionPosition = taskItemContext.taskItemStart
        let transaction

        if (taskItemsNested.size) {
            transaction = editor.state.tr.replaceWith(
                taskItemContext.taskItemStart,
                taskItemContext.taskItemEnd,
                taskItemsNested,
            )
        } else if (taskItemContext.taskList.childCount > 1) {
            transaction = editor.state.tr.delete(
                taskItemContext.taskItemStart,
                taskItemContext.taskItemEnd,
            )
        } else if (taskItemContext.taskItemDepth > 2) {
            selectionPosition = taskItemContext.taskListStart
            transaction = editor.state.tr.delete(
                taskItemContext.taskListStart,
                taskItemContext.taskListStart +
                    taskItemContext.taskList.nodeSize,
            )
        } else {
            return
        }

        transaction.setSelection(
            TextSelection.near(transaction.doc.resolve(selectionPosition), -1),
        )
        editor.view.dispatch(transaction.scrollIntoView())
        editor.view.focus()
        return
    }

    if (event.key === 'Backspace' && isCaretAtTaskTextStart()) {
        event.preventDefault()
        event.stopPropagation()
        return
    }

    if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
    ) {
        event.preventDefault()
        event.stopPropagation()

        if (
            editor.state.selection instanceof NodeSelection &&
            editor.state.selection.node.type.name === 'taskItem'
        ) {
            const insertPosition = editor.state.selection.to
            editor
                .chain()
                .insertContentAt(insertPosition, createTaskItem())
                .focus(insertPosition + 2)
                .scrollIntoView()
                .run()
            return
        }

        const taskItemContext = getSelectedTaskItemContext()
        const taskText = taskItemContext?.taskItem.firstChild?.textContent || ''

        if (taskItemContext && taskText.length === 0) {
            editor
                .chain()
                .insertContentAt(taskItemContext.taskItemEnd, createTaskItem())
                .focus(taskItemContext.taskItemEnd + 2)
                .scrollIntoView()
                .run()
        } else {
            editor.commands.splitListItem('taskItem')
            removeLeadingEmptyParagraphFromSelectedTask()
        }
        return
    }

    if (event.key !== 'Tab') return

    event.preventDefault()
    event.stopPropagation()

    if (event.shiftKey) {
        editor.commands.liftListItem('taskItem')
    } else {
        editor.commands.sinkListItem('taskItem')
    }
}

function mountEditor(element) {
    element.addEventListener('keydown', handleTaskListKeydown, true)
    editor = new Editor({
        element,
        extensions,
        content: pageContent,
        editable: !viewOnly && pageContentOverride === undefined,
        autofocus: !viewOnly ? 'end' : false,
        onUpdate({ editor: editor_updated }) {
            pageContent = editor_updated.getJSON()
            taskCount = countTaskItems(pageContent)
            savePageContent()
        },
        editorProps: {
            handlePaste(view, event) {
                const text = event.clipboardData?.getData('text/plain') || ''
                const html = event.clipboardData?.getData('text/html') || ''
                const hasMultipleLines = /\r|\n/.test(text)
                const containsTaskItems = html.includes('data-type="taskItem"')

                if (!hasMultipleLines || containsTaskItems) return false

                event.preventDefault()
                const items = taskTextToItems(text).map((item) =>
                    Node.fromJSON(view.state.schema, item),
                )
                const fragment = Fragment.fromArray(items)
                const slice = Slice.maxOpen(fragment)
                const { selection } = view.state
                let transaction = view.state.tr

                if (!selection.empty) {
                    transaction = transaction.replaceSelection(slice)
                } else {
                    let taskItemDepth = null

                    for (
                        let depth = selection.$from.depth;
                        depth > 0;
                        depth -= 1
                    ) {
                        if (
                            selection.$from.node(depth).type.name === 'taskItem'
                        ) {
                            taskItemDepth = depth
                            break
                        }
                    }

                    if (taskItemDepth === null) return false

                    const taskItem = selection.$from.node(taskItemDepth)
                    const taskItemStart = selection.$from.before(taskItemDepth)
                    const taskItemEnd = selection.$from.after(taskItemDepth)

                    transaction = taskItem.textContent
                        ? transaction.insert(taskItemEnd, fragment)
                        : transaction.replaceWith(
                              taskItemStart,
                              taskItemEnd,
                              fragment,
                          )
                }

                view.dispatch(transaction.scrollIntoView())
                return true
            },
        },
    })

    return {
        destroy() {
            element.removeEventListener('keydown', handleTaskListKeydown, true)
            editor?.destroy()
            editor = undefined
        },
    }
}

function addTask() {
    if (!editor) return

    const position = editor.state.doc.content.size - 1
    editor
        .chain()
        .focus()
        .insertContentAt(position, createTaskItem())
        .focus('end')
        .scrollIntoView()
        .run()
}
</script>

{#if !loaded}
    <div class="task-list loading" {style}>Loading...</div>
{:else if loadError}
    <div class="task-list load-error" role="alert" {style}>
        Task list failed to load. Refresh the page to try again.
    </div>
{:else}
    <section
        class="task-list"
        class:view-only={viewOnly || pageContentOverride !== undefined}
        {style}
    >
        <div class="task-list-toolbar">
            <span class="task-list-count">
                {taskCount.completed} of {taskCount.total} complete
            </span>
            {#if !viewOnly && pageContentOverride === undefined}
                <span class="task-list-tip">
                    Esc selects a branch · Space completes · Ctrl/Cmd+Shift+D
                    duplicates · Paste lines
                </span>
                <div class="task-list-actions">
                    <button
                        type="button"
                        class="task-action"
                        title="Duplicate selected tasks (Ctrl/Cmd+Shift+D)"
                        on:click={duplicateSelectedTasks}>Duplicate</button
                    >
                    <button
                        type="button"
                        class="task-action"
                        on:click={addTask}
                    >
                        <span aria-hidden="true">+</span> Add task
                    </button>
                </div>
            {/if}
        </div>
        <div class="task-list-editor" use:mountEditor spellcheck="false"></div>
    </section>
{/if}

<style>
.task-list {
    --task-accent: var(--color-pa-btn);
    --task-control-column: 1.65em;
    --task-control-center: 0.65em;
    --task-control-width: 1.3em;
    --task-guide-offset: calc(
        var(--task-control-center) - var(--task-control-column)
    );
    --task-nesting-indent: 0.6em;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
    min-height: 12rem;
    color: var(--color-section);
}

.task-list.loading {
    color: var(--color-utility);
}

.task-list.load-error {
    color: var(--color-utility);
}

.task-list-toolbar {
    display: flex;
    align-items: center;
    gap: 0.75em;
    min-height: 2.25em;
    padding: 0 0.15em 0.55em;
    border-bottom: 1px solid var(--border-topbar);
    color: var(--color-utility);
    font-size: 0.78em;
}

.task-list-count {
    color: var(--color-section);
    font-weight: 600;
    white-space: nowrap;
}

.task-list-tip {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.task-list-actions {
    display: flex;
    gap: 0.35em;
    margin-left: auto;
}

.task-action {
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    padding: 0.3em 0.55em;
    border: 1px solid var(--border-select);
    border-radius: 4px;
    background: var(--bg-select);
    color: var(--color-tb-link);
    font: inherit;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
}

.task-action:hover,
.task-action:focus-visible {
    border-color: var(--task-accent);
    color: var(--task-accent);
    outline: none;
}

.task-list-editor {
    min-height: 0;
    overflow: auto;
}

.task-list-editor :global(.ProseMirror) {
    min-height: 100%;
    padding: 0.8em 0.25em 5.4em;
    outline: none;
}

.task-list-editor :global(.task-list-items) {
    margin: 0;
    padding: 0;
    list-style: none;
}

.task-list-editor :global(.task-list-items .task-list-items) {
    position: relative;
    margin-left: 0;
    padding-left: var(--task-nesting-indent);
}

.task-list-editor :global(.task-list-items .task-list-items::before) {
    position: absolute;
    top: 0.15em;
    bottom: 0.2em;
    left: var(--task-guide-offset);
    width: 1px;
    background: var(--border-topbar);
    content: '';
}

.task-list-editor :global(.task-list-item) {
    display: grid;
    grid-template-columns: var(--task-control-column) minmax(0, 1fr);
    align-items: start;
    margin: 0.06em 0;
    padding: 0.2em 0.28em;
    border-radius: 4px;
}

.task-list-editor :global(.task-list-item:focus-within) {
    background: var(--bg-pa-hover);
}

.task-list-editor :global(.task-list-item > label) {
    display: grid;
    width: var(--task-control-width);
    height: 1.55em;
    place-items: center;
}

.task-list-editor :global(.task-list-item > label input) {
    width: 0.95em;
    height: 0.95em;
    margin: 0;
    transform: translateY(0.0625em);
    accent-color: var(--task-accent);
    font: inherit;
    cursor: pointer;
}

.task-list-editor :global(.task-list-item > div) {
    min-width: 0;
}

.task-list-editor :global(.task-list-item p) {
    min-height: 1.55em;
    margin: 0;
    line-height: 1.55;
}

.task-list-editor :global(.task-list-item[data-checked='true'] > div > p) {
    color: var(--color-utility);
    text-decoration: line-through;
    text-decoration-thickness: 1px;
}

.task-list-editor :global(.task-list-item.ProseMirror-selectednode) {
    background: var(--bg-pa-hover);
    box-shadow: inset 2px 0 var(--task-accent);
    outline: none;
}

.view-only .task-list-editor :global(.task-list-item > label input) {
    cursor: default;
}

@media (max-width: 700px) {
    .task-list-tip {
        display: none;
    }
}
</style>
