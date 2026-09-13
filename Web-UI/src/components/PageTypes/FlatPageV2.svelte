<script>
export let pageId = null
export let viewOnly = false
export let pageContentOverride = undefined
export let style = ''

let pageContent = ''

$: if (pageContentOverride !== undefined) {
    pageContent = pageContentOverride
}

$: fetchPage(pageId)

import fetchPlus from '../../helpers/fetchPlus.js'
export let pageContainer = null

let loaded = false

function fetchPage(pageId) {
    if (pageId) {
        fetchPlus.get(`/pages/content/${pageId}`).then((response) => {
            pageContent = JSON.parse(response.content)
            loaded = true
        })
    }
}

import debounce from '../../helpers/debounce.js'

const savePageContent = debounce(function () {
    fetchPlus
        .put(`/pages/${pageId}`, {
            pageContent: JSON.stringify(pageContent),
        })
        .catch(() => {
            alert('Page Save Failed')
        })
}, 500)

let showInsertFileModal = false
let insertFileModalLinkLabel = ''
let savedCursorPosition = null

import { baseURL } from '../../../config.js'

function saveCursorPosition() {
    savedCursorPosition = window.getSelection().getRangeAt(0)
}

import { format } from 'date-fns'
import { onDestroy } from 'svelte'
import { Editor, Node as TiptapNode, getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Paragraph from '@tiptap/extension-paragraph'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table, { TableView } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import BubbleMenu from '@tiptap/extension-bubble-menu'
import 'tippy.js/dist/tippy.css'
import { mergeAttributes } from '@tiptap/core'
import PageLinkDropdown from '../PageLinkDropdown.svelte'

const PageLink = TiptapNode.create({
    name: 'pageLink',
    inline: true,
    group: 'inline',
    atom: true,
    addAttributes() {
        return {
            pageId: { default: null },
            pageName: { default: '' },
        }
    },
    renderHTML({ node }) {
        return ['a', {
            'data-page-id': node.attrs.pageId,
            'class': 'page-link',
            'href': `/page/${node.attrs.pageId}`,
            'target': '_blank',
        }, node.attrs.pageName]
    },
    parseHTML() {
        return [{ tag: 'a[data-page-id]', getAttrs: (dom) => ({
            pageId: dom.getAttribute('data-page-id'),
            pageName: dom.textContent,
        }) }]
    },
})

const ExternalLink = TiptapNode.create({
    name: 'externalLink',
    inline: true,
    group: 'inline',
    atom: true,
    selectable: false,
    addAttributes() {
        return {
            href: { default: null },
            label: { default: '' },
        }
    },
    renderHTML({ node }) {
        return ['a', {
            href: node.attrs.href,
            target: '_blank',
            contenteditable: 'false',
        }, node.attrs.label || node.attrs.href]
    },
    parseHTML() {
        return [{ tag: 'a[href]:not([data-page-id])', getAttrs: (dom) => ({
            href: dom.getAttribute('href'),
            label: dom.textContent,
        }) }]
    },
})

const tableCellMinWidth = 70

// tiptap's resizable table view drops HTMLAttributes, so re-add the class
// that the table styles and view-only rendering rely on.
class FlatPageTableView extends TableView {
    constructor(node, cellMinWidth, view) {
        super(node, cellMinWidth, view)
        this.table.classList.add('flat-page-table')
    }

    update(node) {
        // tiptap only ever sets a column's width and never removes it, so a
        // column reset to auto would keep its old width. Clear the widths
        // first and let tiptap re-apply the ones the node still has.
        for (const column of this.colgroup.children) {
            column.style.width = ''
        }

        return super.update(node)
    }
}

// Alignment and wrapping are set per column, stored on every cell of
// the column the way tiptap stores colwidth.
const columnCellAttributes = {
    align: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-align'),
        renderHTML: (attributes) =>
            attributes.align ? { 'data-align': attributes.align } : {},
    },
    nowrap: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-nowrap') === 'true',
        renderHTML: (attributes) =>
            attributes.nowrap ? { 'data-nowrap': 'true' } : {},
    },
}

const FlatPageTableHeader = TableHeader.extend({
    addAttributes() {
        return { ...this.parent?.(), ...columnCellAttributes }
    },
})

const FlatPageTableCell = TableCell.extend({
    addAttributes() {
        return { ...this.parent?.(), ...columnCellAttributes }
    },
})

const extensions = [
    StarterKit.configure({
        paragraph: false,
        horizontalRule: false,
        blockquote: false,
    }),
    // From: https://github.com/ueberdosis/tiptap/issues/291#issuecomment-867346201
    Paragraph.extend({
        parseHTML() {
            return [{ tag: 'div' }]
        },
        renderHTML({ HTMLAttributes }) {
            return [
                'div',
                mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
                0,
            ]
        },
    }),
    PageLink,
    ExternalLink,
    Image.configure({ inline: true, HTMLAttributes: { style: 'max-width: 100%' } }).extend({ atom: true, selectable: false }),
    TaskList.configure({ HTMLAttributes: { class: 'task-list-items' } }),
    TaskItem.configure({
        nested: true,
        HTMLAttributes: { class: 'task-list-item' },
    }),
    Table.configure({
        HTMLAttributes: { class: 'flat-page-table' },
        resizable: true,
        renderWrapper: true,
        cellMinWidth: tableCellMinWidth,
        View: FlatPageTableView,
    }),
    TableRow,
    FlatPageTableHeader,
    FlatPageTableCell,
]

const tiptapSchema = getSchema(extensions)

// [[ page link state
let pageLinkQuery = ''
let pageLinkAnchorRect = null
let pageLinkStartPos = null
let pageLinkDropdown
let lastBracketKeyPos = null

function getCaretRect() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    return sel.getRangeAt(0).getBoundingClientRect()
}

function closePageLinkDropdown() {
    pageLinkQuery = ''
    pageLinkAnchorRect = null
    pageLinkStartPos = null
}

function insertPageLink(page) {
    if (!editor) return
    const currentPos = editor.state.selection.$from.pos
    editor.chain()
        .deleteRange({ from: pageLinkStartPos, to: currentPos })
        .insertContent({
            type: 'pageLink',
            attrs: { pageId: page.id, pageName: page.name }
        })
        .run()
    closePageLinkDropdown()
}

let editor
let tableMenu
let tableControlsExpanded = false
$: editorDom = editor?.view.dom

function tableMenuMounted(element) {
    tableMenu = element
}

function getActiveTableRect() {
    const domNode = editor.view.domAtPos(editor.state.selection.from).node
    const domElement =
        domNode.nodeType === 1 ? domNode : domNode.parentElement

    return (
        domElement.closest('table')?.getBoundingClientRect() ??
        editor.view.dom.getBoundingClientRect()
    )
}

function insertTableFromSlashCommand() {
    const { $from } = editor.state.selection

    if (
        !editor.state.selection.empty ||
        $from.parent.type.name !== 'paragraph' ||
        $from.parent.textContent !== '/table'
    ) {
        return false
    }

    return editor
        .chain()
        .deleteRange({ from: $from.start(), to: $from.end() })
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run()
}

function addTableRowAndFocus(insertBefore) {
    const { $from } = editor.state.selection
    let tableDepth = null

    for (let depth = $from.depth; depth > 0; depth -= 1) {
        if ($from.node(depth).type.name === 'table') {
            tableDepth = depth
            break
        }
    }

    if (tableDepth === null) return false

    const tablePosition = $from.before(tableDepth)
    const rowIndex = $from.index(tableDepth)
    const rowIndexAdded = insertBefore ? rowIndex : rowIndex + 1
    const rowAdded = insertBefore
        ? editor.commands.addRowBefore()
        : editor.commands.addRowAfter()

    if (!rowAdded) return false

    const tableNode = editor.state.doc.nodeAt(tablePosition)
    let rowPosition = tablePosition + 1

    for (let index = 0; index < rowIndexAdded; index += 1) {
        rowPosition += tableNode.child(index).nodeSize
    }

    editor
        .chain()
        .setTextSelection(rowPosition + 3)
        .focus()
        .run()

    return true
}

function findTableCellDepth($pos) {
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
        const tableRole = $pos.node(depth).type.spec.tableRole

        if (tableRole === 'cell' || tableRole === 'header_cell') {
            return depth
        }
    }

    return null
}

function copyTableCellFromAbove() {
    const { state } = editor
    const { $from } = state.selection
    const cellDepth = findTableCellDepth($from)

    if (cellDepth === null) return false

    const tableStart = $from.start(cellDepth - 2)
    const tableMap = TableMap.get($from.node(cellDepth - 2))
    const cellPosition = $from.before(cellDepth)
    const cellRect = tableMap.findCell(cellPosition - tableStart)

    if (cellRect.top === 0) return false

    const cellAbovePosition =
        tableStart +
        tableMap.map[(cellRect.top - 1) * tableMap.width + cellRect.left]
    const cellAboveContent = state.doc.nodeAt(cellAbovePosition).content
    const cell = $from.node(cellDepth)
    const transaction = state.tr.replaceWith(
        cellPosition + 1,
        cellPosition + cell.nodeSize - 1,
        cellAboveContent,
    )

    transaction.setSelection(
        TextSelection.near(
            transaction.doc.resolve(cellPosition + 1 + cellAboveContent.size),
            -1,
        ),
    )
    editor.view.dispatch(transaction.scrollIntoView())

    return true
}

// Applies updateAttributes to every cell of one column. It receives the
// cell's attributes and the column's offset inside a spanning cell, and
// returns the new attributes or null to leave the cell alone. Defaults to
// the caret's column; pass the position before a cell to use its column.
function updateTableColumn(updateAttributes, cellPosition = null) {
    const { state } = editor
    const $cell =
        cellPosition === null
            ? state.selection.$from
            : state.doc.resolve(cellPosition + 1)
    const cellDepth = findTableCellDepth($cell)

    if (cellDepth === null) return false

    const table = $cell.node(cellDepth - 2)
    const tableStart = $cell.start(cellDepth - 2)
    const tableMap = TableMap.get(table)
    const columnToUpdate =
        tableMap.colCount($cell.before(cellDepth) - tableStart) +
        $cell.node(cellDepth).attrs.colspan -
        1
    const transaction = state.tr
    const cellsSeen = new Set()

    tableMap.map.forEach((position, index) => {
        if (cellsSeen.has(position)) return
        cellsSeen.add(position)

        const cell = table.nodeAt(position)
        const offset = columnToUpdate - (index % tableMap.width)
        if (offset < 0 || offset >= cell.attrs.colspan) return

        const attributes = updateAttributes(cell.attrs, offset)
        if (!attributes) return

        transaction.setNodeMarkup(tableStart + position, null, attributes)
    })

    if (!transaction.docChanged) return false

    editor.view.dispatch(transaction)

    return true
}

function resetTableColumnWidth(cellPosition = null) {
    return updateTableColumn((attributes, offset) => {
        if (!attributes.colwidth) return null

        let colwidth = attributes.colwidth.slice()
        colwidth[offset] = 0
        if (colwidth.every((width) => !width)) colwidth = null

        return { ...attributes, colwidth }
    }, cellPosition)
}

function setTableColumnAlign(align) {
    return updateTableColumn((attributes) =>
        attributes.align === align ? null : { ...attributes, align },
    )
}

function toggleTableColumnWrap() {
    const nowrap = !currentTableCellAttributes.nowrap

    return updateTableColumn((attributes) =>
        attributes.nowrap === nowrap ? null : { ...attributes, nowrap },
    )
}

// Only one of the two cell types is active at the caret, so merging both
// gives the current cell's attributes.
$: currentTableCellAttributes = editor
    ? {
          ...editor.getAttributes('tableHeader'),
          ...editor.getAttributes('tableCell'),
      }
    : {}

// A text selection over the whole content of the table cell around $pos,
// or null outside a table.
function getTableCellTextSelection($pos) {
    const cellDepth = findTableCellDepth($pos)

    if (cellDepth === null) return null

    return TextSelection.between(
        $pos.doc.resolve($pos.start(cellDepth)),
        $pos.doc.resolve($pos.end(cellDepth)),
    )
}

// Ctrl+A inside a table selects the current cell's text first. A second
// press falls through to tiptap's select all.
// Ctrl+A steps outward: the cell's text, then every cell of the table,
// then the whole page. Returns false once the page is next, so tiptap's
// select all takes over.
function selectTableCellContent() {
    const { state } = editor
    const { selection } = state
    const inCellSelection = selection instanceof CellSelection
    const $pos = inCellSelection
        ? state.doc.resolve(selection.$anchorCell.pos + 1)
        : selection.$from
    const cellDepth = findTableCellDepth($pos)

    if (cellDepth === null) return false

    const tableStart = $pos.start(cellDepth - 2)
    const tableMap = TableMap.get($pos.node(cellDepth - 2))
    const firstCell = tableStart + tableMap.map[0]
    const lastCell = tableStart + tableMap.map[tableMap.map.length - 1]

    if (inCellSelection) {
        const cells = [selection.$anchorCell.pos, selection.$headCell.pos]

        if (cells.includes(firstCell) && cells.includes(lastCell)) {
            return false
        }
    } else {
        const cellText = getTableCellTextSelection($pos)
        const cellTextSelected =
            selection.from === cellText.from && selection.to === cellText.to

        if (!cellText.empty && !cellTextSelected) {
            editor.view.dispatch(state.tr.setSelection(cellText))
            return true
        }
    }

    editor.view.dispatch(
        state.tr.setSelection(CellSelection.create(state.doc, firstCell, lastCell)),
    )

    return true
}

function joinPreviousAdjacentTaskList() {
    const { state, view } = editor
    const { $from } = state.selection

    for (let depth = $from.depth; depth > 0; depth -= 1) {
        if ($from.node(depth).type.name !== 'taskList') continue
        if ($from.index(depth) !== 0) return false

        const joinPosition = $from.before(depth)
        if (!canJoin(state.doc, joinPosition)) return false

        view.dispatch(state.tr.join(joinPosition))
        return true
    }

    return false
}

function pageContainerMounted(element) {
    pageContainer = element

    editor = new Editor({
        element: element,
        extensions: [
            ...extensions,
            BubbleMenu.configure({
                element: tableMenu,
                shouldShow: ({ editor }) => editor.isActive('table'),
                tippyOptions: {
                    placement: 'bottom-end',
                    arrow: false,
                    theme: 'flat-page-table',
                    maxWidth: 'none',
                    getReferenceClientRect: getActiveTableRect,
                },
            }),
        ],
        content: pageContent,
        onTransaction() {
            // force re-render so `editor.isActive` works as expected
            editor = editor
        },
        onUpdate() {
            pageContent = editor.getJSON()
            savePageContent()
        },
        editorProps: {
            handleKeyDown(view, event) {
                if (pageLinkAnchorRect) {
                    if (pageLinkDropdown) {
                        const handled = pageLinkDropdown.handleKeydown(event)
                        if (handled) return true
                    }
                    if (event.key === 'Escape') {
                        closePageLinkDropdown()
                        return true
                    }
                    if (event.key === 'Backspace') {
                        if (pageLinkQuery.length > 0) {
                            pageLinkQuery = pageLinkQuery.slice(0, -1)
                        } else {
                            closePageLinkDropdown()
                        }
                        return false
                    }
                    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
                        pageLinkQuery += event.key
                    }
                    return false
                }

                if (event.ctrlKey && event.key.toLowerCase() === 'i') {
                    event.preventDefault()
                    insertFileModalLinkLabel = editor.state.doc.textBetween(
                        editor.state.selection.from,
                        editor.state.selection.to,
                        ''
                    )
                    saveCursorPosition()
                    showInsertFileModal = true
                    return true
                }

                if (event.ctrlKey && event.key.toLowerCase() === 'k') {
                    event.preventDefault()
                    const url = prompt('Enter link')
                    if (url) {
                        const label = editor.state.doc.textBetween(
                            editor.state.selection.from,
                            editor.state.selection.to,
                            ''
                        ) || url
                        if (!editor.state.selection.empty) {
                            editor.chain().deleteSelection().insertContent({
                                type: 'externalLink',
                                attrs: { href: url, label },
                            }).run()
                        } else {
                            editor.commands.insertContent({
                                type: 'externalLink',
                                attrs: { href: url, label },
                            })
                        }
                    }
                    return true
                }

                if (
                    event.key === 'Enter' &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.shiftKey &&
                    !event.altKey &&
                    insertTableFromSlashCommand()
                ) {
                    event.preventDefault()
                    return true
                }

                if (
                    (event.ctrlKey || event.metaKey) &&
                    !event.altKey &&
                    event.key === 'Enter' &&
                    (editor.isActive('table') || !event.shiftKey)
                ) {
                    event.preventDefault()

                    if (editor.isActive('table')) {
                        addTableRowAndFocus(event.shiftKey)
                    } else if (editor.isActive('taskItem')) {
                        const checked = editor.getAttributes('taskItem').checked
                        editor.commands.updateAttributes('taskItem', {
                            checked: !checked,
                        })
                    } else {
                        editor.commands.toggleTaskList()
                    }

                    return true
                }

                if (
                    (event.ctrlKey || event.metaKey) &&
                    event.key === 'Delete' &&
                    editor.isActive('table')
                ) {
                    event.preventDefault()
                    editor.commands.deleteRow()
                    return true
                }

                if (
                    (event.ctrlKey || event.metaKey) &&
                    event.key === ';' &&
                    editor.isActive('table')
                ) {
                    event.preventDefault()
                    copyTableCellFromAbove()
                    return true
                }

                if (
                    (event.ctrlKey || event.metaKey) &&
                    !event.shiftKey &&
                    !event.altKey &&
                    event.key.toLowerCase() === 'a' &&
                    editor.isActive('table') &&
                    selectTableCellContent()
                ) {
                    event.preventDefault()
                    return true
                }

                if (event.key === 'Tab') {
                    if (editor.isActive('table')) return false

                    event.preventDefault()

                    const listItemTypeActive = editor.isActive('taskItem')
                        ? 'taskItem'
                        : editor.isActive('listItem')
                          ? 'listItem'
                          : null

                    if (listItemTypeActive) {
                        if (event.shiftKey) {
                            editor.commands.liftListItem(listItemTypeActive)
                        } else {
                            const itemNested = editor.commands.sinkListItem(
                                listItemTypeActive,
                            )

                            if (
                                !itemNested &&
                                listItemTypeActive === 'taskItem' &&
                                joinPreviousAdjacentTaskList()
                            ) {
                                editor.commands.sinkListItem(listItemTypeActive)
                            }
                        }
                    } else {
                        editor.commands.insertContent('    ')
                    }

                    return true
                }

                if ((event.altKey && event.shiftKey || event.metaKey && event.shiftKey) && event.key.toLowerCase() === 'd') {
                    editor.commands.insertContent(format(new Date(), 'DD-MMM-YY'))
                    return true
                }

                if (event.key === 'F11') {
                    event.preventDefault()
                    editor.commands.insertContent(format(new Date(), '(hh:mm A) '))
                    return true
                }

                if (event.key === 'F12') {
                    event.preventDefault()
                    editor.commands.insertContent(format(new Date(), 'DD-MMM-YY hh:mm A: '))
                    return true
                }

                if (event.key === '[' && !event.ctrlKey && !event.metaKey) {
                    if (lastBracketKeyPos !== null) {
                        const startPos = lastBracketKeyPos
                        lastBracketKeyPos = null
                        setTimeout(() => {
                            pageLinkStartPos = startPos
                            pageLinkAnchorRect = getCaretRect()
                            pageLinkQuery = ''
                        }, 0)
                    } else {
                        lastBracketKeyPos = view.state.selection.$from.pos
                    }
                } else {
                    lastBracketKeyPos = null
                }
                return false
            },
            handlePaste(view, event) {
                const items = Array.from(event.clipboardData?.items || [])
                const imageItem = items.find(i => i.type.startsWith('image/'))

                if (imageItem) {
                    event.preventDefault()
                    const blob = imageItem.getAsFile()
                    const data = new FormData()
                    data.append('image', blob)
                    fetchPlus.post(`/upload-image/${pageId}`, data)
                        .then((r) => {
                            editor.commands.insertContent({
                                type: 'image',
                                attrs: { src: `${baseURL}/${r.imageUrl}` },
                            })
                        })
                    return true
                }

                if (event.clipboardData?.types.includes('text/plain')) {
                    const text = event.clipboardData.getData('text/plain')
                    const links = text.match(/(https?:\/\/[^\s]+)/g)
                    if (links?.length > 0) {
                        if (confirm(`Do you want to convert ${links.length} links to clickable links?`)) {
                            event.preventDefault()
                            const paragraphs = text.split('\n').map((line) => {
                                const parts = line.split(/(https?:\/\/[^\s]+)/)
                                const content = parts
                                    .filter((p) => p.length > 0)
                                    .map((part) =>
                                        /^https?:\/\//.test(part)
                                            ? { type: 'externalLink', attrs: { href: part, label: part } }
                                            : { type: 'text', text: part }
                                    )
                                return { type: 'paragraph', content: content.length ? content : [] }
                            })
                            editor.commands.insertContent(paragraphs)
                            return true
                        }
                    }
                }

                return false
            },
            // The table plugin turns a triple-click into a block selection of
            // the cell. Select the cell's text instead, like Ctrl+A does.
            handleTripleClick(view, position) {
                const cellSelection = getTableCellTextSelection(
                    view.state.doc.resolve(position),
                )

                if (!cellSelection) return false

                view.dispatch(view.state.tr.setSelection(cellSelection))
                return true
            },
            handleDOMEvents: {
                // Double-clicking a column border resets that column to auto.
                // The resize plugin draws a handle inside the hovered column's
                // cells, which is the only place its hover state is exposed.
                dblclick(view) {
                    const cellDom = view.dom
                        .querySelector('.column-resize-handle')
                        ?.closest('td, th')

                    if (!cellDom) return false

                    resetTableColumnWidth(view.posAtDOM(cellDom, 0) - 1)
                    return true
                },
            },
            // From: https://github.com/bluesky-social/social-app/pull/6658/files
            clipboardTextParser(text, context) {
                const blocks = text.split(/(?:\r\n?|\n)/)
                const nodes = blocks.map((line) => {
                    return Node.fromJSON(
                        context.doc.type.schema,
                        line.length > 0
                            ? {
                                  type: 'paragraph',
                                  content: [{ type: 'text', text: line }],
                              }
                            : { type: 'paragraph', content: [] },
                    )
                })

                const fragment = Fragment.fromArray(nodes)
                return Slice.maxOpen(fragment)
            },
        },
    })

    editor.commands.focus('end')

    const scrollContainerParent = document.querySelector(
        'main.journal-page > .journal-page-entries .ProseMirror',
    )

    let scrollContainer = scrollContainerParent?.querySelector(
        'div > main.journal-page > .journal-page-entries .ProseMirror',
    )

    if (!scrollContainer) {
        scrollContainer = scrollContainerParent
    }

    if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
    }
}

/*
    getPageContentHTML makes generateHTML output the same html structure as prosemirror

    Example:

    input json:
    [
        {"type":"paragraph","content":[{"type":"text","text":"cat"}]},
        {"type":"paragraph"},
        {"type":"paragraph"},
        {"type":"paragraph","content":[{"type":"hardBreak"},{"type":"hardBreak"},{"type":"hardBreak"},{"type":"hardBreak"},{"type":"hardBreak"},{"type":"hardBreak"},{"type":"hardBreak"}]},
        {"type":"paragraph"},
        {"type":"paragraph","content":[{"type":"text","text":"cat"}]}
    ]

    promemirror outputs:
    <div>cat</div>
    <div><br class="ProseMirror-trailingBreak"></div>
    <div><br class="ProseMirror-trailingBreak"></div>
    <div><br><br><br><br><br><br><br><br class="ProseMirror-trailingBreak"></div>
    <div><br class="ProseMirror-trailingBreak"></div>
    <div>cat</div>

    generateHTML outputs:
    <div>cat</div>
    <div></div>
    <div></div>
    <div><br><br><br><br><br><br><br></div>
    <div></div>
    <div>cat</div>

    our below modification outputs the same dom structure as prosemirror sans the "ProseMirror-trailingBreak" class:
    <div>cat</div>
    <div><br></div>
    <div><br></div>
    <div><br><br><br><br><br><br><br><br></div>
    <div><br></div>
    <div>cat</div>
*/
function getPageContentHTML() {
    const pageContentCopy = JSON.parse(JSON.stringify(pageContent))

    pageContentCopy.content.forEach((block) => {
        if ('content' in block) {
            const hardBreakIndexes = []

            block.content?.forEach((content, index) => {
                if (content.type === 'hardBreak') {
                    hardBreakIndexes.push(index)
                }
            })

            if (hardBreakIndexes.length > 0) {
                block.content.splice(
                    hardBreakIndexes[hardBreakIndexes.length - 1],
                    0,
                    { type: 'hardBreak' },
                )
            }
        } else {
            if (block.type === 'paragraph') {
                block.content = [{ type: 'hardBreak' }]
            }
        }
    })

    const doc = Node.fromJSON(tiptapSchema, pageContentCopy)
    const container = document.createElement('div')
    DOMSerializer.fromSchema(tiptapSchema).serializeFragment(doc.content, { document }, container)
    const generatedHTML = container.innerHTML

    globalThis.generatedHTML = generatedHTML

    container
        .querySelectorAll('ul[data-type="taskList"] input[type="checkbox"]')
        .forEach((checkbox) => checkbox.setAttribute('disabled', ''))

    return container.innerHTML
}

$: pageContentParsed = pageContent ? getPageContentHTML() : ''

onDestroy(() => {
    if (editor) {
        editor.destroy()
    }
})

import InsertFileModal from '../Modals/InsertFileModal.svelte'
import { DOMSerializer, Fragment, Node, Slice } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { canJoin } from '@tiptap/pm/transform'
</script>

{#if pageContentOverride === undefined && viewOnly === false}
    {#if loaded === false}
        <div class="page-container" {style}>Loading...</div>
    {:else}
        <div
            class="flat-table-menu"
            class:expanded={tableControlsExpanded}
            use:tableMenuMounted
            style="visibility: hidden"
        >
            {#if tableControlsExpanded}
                <button
                    class="row-before"
                    type="button"
                    aria-label="Add row before"
                    title="Add row above"
                    on:mousedown|preventDefault
                    on:click={() => addTableRowAndFocus(true)}
                    >Row ↑</button
                >
                <button
                    class="row-after"
                    type="button"
                    aria-label="Add row after"
                    title="Add row below"
                    on:mousedown|preventDefault
                    on:click={() => addTableRowAndFocus(false)}
                    >Row ↓</button
                >
                <button
                    class="delete-row"
                    type="button"
                    aria-label="Delete row"
                    title="Delete row"
                    on:mousedown|preventDefault
                    on:click={() => editor.chain().focus().deleteRow().run()}
                    >- Row</button
                >
                <button
                    class="column-before"
                    type="button"
                    aria-label="Add column before"
                    title="Add column to the left"
                    on:mousedown|preventDefault
                    on:click={() =>
                        editor.chain().focus().addColumnBefore().run()}
                    >Col ←</button
                >
                <button
                    class="column-after"
                    type="button"
                    aria-label="Add column after"
                    title="Add column to the right"
                    on:mousedown|preventDefault
                    on:click={() =>
                        editor.chain().focus().addColumnAfter().run()}
                    >Col →</button
                >
                <button
                    class="delete-column"
                    type="button"
                    aria-label="Delete column"
                    title="Delete column"
                    on:mousedown|preventDefault
                    on:click={() =>
                        editor.chain().focus().deleteColumn().run()}
                    >- Col</button
                >
                <button
                    class="delete-table"
                    type="button"
                    aria-label="Delete table"
                    title="Delete table"
                    on:mousedown|preventDefault
                    on:click={() => editor.chain().focus().deleteTable().run()}
                    >Delete</button
                >
                <button
                    class="auto-widths"
                    type="button"
                    aria-label="Auto column width"
                    title="Reset this column to automatic width"
                    on:mousedown|preventDefault
                    on:click={() => resetTableColumnWidth()}
                    >Auto width</button
                >
                <button
                    class="align-left"
                    type="button"
                    aria-label="Align column left"
                    aria-pressed={!currentTableCellAttributes.align ||
                        currentTableCellAttributes.align === 'left'}
                    title="Align this column left"
                    on:mousedown|preventDefault
                    on:click={() => setTableColumnAlign(null)}
                    >Left</button
                >
                <button
                    class="align-center"
                    type="button"
                    aria-label="Align column center"
                    aria-pressed={currentTableCellAttributes.align === 'center'}
                    title="Center this column"
                    on:mousedown|preventDefault
                    on:click={() => setTableColumnAlign('center')}
                    >Center</button
                >
                <button
                    class="align-right"
                    type="button"
                    aria-label="Align column right"
                    aria-pressed={currentTableCellAttributes.align === 'right'}
                    title="Align this column right"
                    on:mousedown|preventDefault
                    on:click={() => setTableColumnAlign('right')}
                    >Right</button
                >
                <button
                    class="no-wrap"
                    type="button"
                    aria-label="Column no wrap"
                    aria-pressed={currentTableCellAttributes.nowrap === true}
                    title="Keep this column on one line"
                    on:mousedown|preventDefault
                    on:click={toggleTableColumnWrap}
                    >No wrap</button
                >
                <button
                    class="table-controls-done"
                    type="button"
                    aria-label="Hide table controls"
                    title="Hide table controls"
                    on:mousedown|preventDefault
                    on:click={() => (tableControlsExpanded = false)}
                    >Done</button
                >
            {:else}
                <button
                    class="table-menu-toggle"
                    type="button"
                    aria-label="Table options"
                    title="Table options"
                    on:mousedown|preventDefault
                    on:click={() => (tableControlsExpanded = true)}
                    >⋯</button
                >
            {/if}
        </div>
        <div
            class="page-container"
            spellcheck="false"
            {style}
            use:pageContainerMounted
        ></div>
    {/if}
{:else}
    <div class="page-container view-only" bind:this={pageContainer} {style}>
        {@html pageContentParsed}
    </div>
{/if}

{#if showInsertFileModal}
    <InsertFileModal
        bind:pageId
        bind:savedCursorPosition
        bind:contentEditableDivToFocus={editorDom}
        bind:insertFileModalLinkLabel
        bind:showInsertFileModal
        onInsertImage={(src) => editor.commands.insertContent({ type: 'image', attrs: { src, style: 'max-width: 100%' } })}
        onInsertLink={(href, label) => editor.commands.insertContent({ type: 'externalLink', attrs: { href, label } })}
    ></InsertFileModal>
{/if}

<PageLinkDropdown
    bind:this={pageLinkDropdown}
    query={pageLinkQuery}
    anchorRect={pageLinkAnchorRect}
    on:select={(e) => insertPageLink(e.detail)}
    on:close={closePageLinkDropdown}
/>

<style>
.page-container {
    --task-accent: var(--color-pa-btn);
    --task-control-column: 1.65em;
    --task-control-center: 0.65em;
    --task-control-width: 1.3em;
    --task-guide-offset: calc(
        var(--task-control-center) - var(--task-control-column)
    );
    --task-nesting-indent: 0.6em;
    height: 100%;
}

.page-container.view-only {
    padding-bottom: 5.4em;
}

.page-container > :global(.ProseMirror) {
    height: 100%;
    padding-bottom: 5.4em;
    outline: none;
    overflow: auto;
}

.page-container :global(:where(ul, ol)) {
    padding-left: 1rem;
    margin: 0;
}

.page-container :global(.task-list-items) {
    margin: 0;
    padding: 0;
    list-style: none;
}

.page-container :global(.task-list-items .task-list-items) {
    position: relative;
    margin-left: 0;
    padding-left: var(--task-nesting-indent);
}

.page-container :global(.task-list-items .task-list-items::before) {
    position: absolute;
    top: 0.15em;
    bottom: 0.2em;
    left: var(--task-guide-offset);
    width: 1px;
    background: var(--border-topbar);
    content: '';
}

.page-container :global(.task-list-item) {
    display: grid;
    grid-template-columns: var(--task-control-column) minmax(0, 1fr);
    align-items: start;
    margin: 0.06em 0;
    padding: 0.2em 0.28em;
    border-radius: 4px;
}

.page-container :global(.task-list-item:focus-within) {
    background: var(--bg-pa-hover);
}

.page-container :global(.task-list-item > label) {
    display: grid;
    width: var(--task-control-width);
    height: 1.55em;
    place-items: center;
}

.page-container :global(.task-list-item > label input) {
    width: 0.95em;
    height: 0.95em;
    margin: 0;
    transform: translateY(0.0625em);
    accent-color: var(--task-accent);
    font: inherit;
    cursor: pointer;
}

.page-container :global(.task-list-item > div) {
    min-width: 0;
}

.page-container :global(.task-list-item > div > div:first-child) {
    min-height: 1.55em;
    line-height: 1.55;
}

.page-container
    :global(.task-list-item[data-checked='true'] > div > div:first-child) {
    color: var(--color-utility);
    text-decoration: line-through;
    text-decoration-thickness: 1px;
}

.page-container.view-only :global(.task-list-item > label input) {
    cursor: default;
}

.page-container :global(.tableWrapper) {
    margin: 0.55em 0;
    overflow-x: auto;
}

/* Columns share the page width until a border is dragged. Dragged widths
   are saved as colwidth and rendered through the colgroup. The layout
   stays automatic so a no-wrap column can grow to fit its text, in which
   case the table scrolls inside its wrapper instead of clipping. */
.page-container :global(.flat-page-table) {
    width: 100%;
    margin: 0;
    border-collapse: collapse;
    table-layout: auto;
}

.page-container :global(.flat-page-table th),
.page-container :global(.flat-page-table td) {
    position: relative;
    min-width: 5em;
    box-sizing: border-box;
    padding: 0.3em 0.45em;
    border: 1px solid var(--border-table);
    vertical-align: top;
    overflow-wrap: anywhere;
}

.page-container :global(.flat-page-table th) {
    background: var(--bg-pa-hover);
    font-weight: bold;
    text-align: left;
}

.page-container :global(.flat-page-table [data-align='center']) {
    text-align: center;
}

.page-container :global(.flat-page-table [data-align='right']) {
    text-align: right;
}

.page-container :global(.flat-page-table [data-nowrap='true']) {
    white-space: nowrap;
    overflow-wrap: normal;
}

/* A light tint only. An outline per cell turns a selected block into a
   heavy grid. */
/* Selected cells wear the same colour as selected text, as a translucent
   layer over their own background. */
.page-container :global(.flat-page-table .selectedCell::after) {
    position: absolute;
    inset: 0;
    z-index: 2;
    content: '';
    background: color-mix(in srgb, Highlight 18%, transparent);
    pointer-events: none;
}

/* Kept inside the cell: a handle that straddles the border pokes past
   the last column and makes the scrolling wrapper show a scrollbar. */
.page-container :global(.column-resize-handle) {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    width: 4px;
    background: var(--color-pa-btn);
    pointer-events: none;
}

.page-container > :global(.ProseMirror.resize-cursor) {
    cursor: col-resize;
}

.page-container :global(.flat-page-table :where(div, p)) {
    min-height: 1.45em;
    margin: 0;
    outline: none;
}

.flat-table-menu {
    display: flex;
    overflow: hidden;
    border: 1px solid var(--border-table);
    border-radius: 4px;
    background: var(--bg-center);
    box-shadow: 0 2px 8px rgb(0 0 0 / 14%);
}

.flat-table-menu:not(.expanded) {
    opacity: 0.48;
}

.flat-table-menu:not(.expanded):hover,
.flat-table-menu:not(.expanded):focus-within {
    opacity: 1;
}

.flat-table-menu.expanded {
    display: grid;
    grid-template-areas:
        'row-before row-after delete-row delete-table done'
        'column-before column-after delete-column auto-widths done'
        'align-left align-center align-right no-wrap done';
}

.flat-table-menu.expanded .row-before {
    grid-area: row-before;
}

.flat-table-menu.expanded .row-after {
    grid-area: row-after;
}

.flat-table-menu.expanded .delete-row {
    grid-area: delete-row;
}

.flat-table-menu.expanded .column-before {
    grid-area: column-before;
}

.flat-table-menu.expanded .column-after {
    grid-area: column-after;
}

.flat-table-menu.expanded .delete-column {
    grid-area: delete-column;
}

.flat-table-menu.expanded .delete-table {
    grid-area: delete-table;
}

.flat-table-menu.expanded .auto-widths {
    grid-area: auto-widths;
}

.flat-table-menu.expanded .align-left {
    grid-area: align-left;
}

.flat-table-menu.expanded .align-center {
    grid-area: align-center;
}

.flat-table-menu.expanded .align-right {
    grid-area: align-right;
}

.flat-table-menu.expanded .no-wrap {
    grid-area: no-wrap;
}

.flat-table-menu.expanded .table-controls-done {
    grid-area: done;
}

.flat-table-menu button {
    padding: 0.28em 0.45em;
    border: 0;
    border-right: 1px solid var(--border-table);
    background: transparent;
    color: var(--color-pa-btn);
    font: inherit;
    cursor: pointer;
}

.flat-table-menu button:last-child {
    border-right: 0;
}

.flat-table-menu.expanded
    :where(
        .row-before,
        .row-after,
        .delete-row,
        .delete-table,
        .column-before,
        .column-after,
        .delete-column,
        .auto-widths
    ) {
    border-bottom: 1px solid var(--border-table);
}

.flat-table-menu button[aria-pressed='true'] {
    background: var(--bg-pa-hover);
    font-weight: bold;
}

.flat-table-menu button:hover {
    background: var(--bg-pa-hover);
}

.flat-table-menu .table-menu-toggle {
    min-width: 2em;
    padding-inline: 0.4em;
    border-right: 0;
    font-weight: bold;
}

.flat-table-menu .delete-table {
    color: var(--color-delete, #b42318);
}

:global(.tippy-box[data-theme~='flat-page-table']) {
    border: 0;
    background: transparent;
    color: inherit;
}

:global(.tippy-box[data-theme~='flat-page-table'] .tippy-content) {
    padding: 0;
}

:global(.page-link) {
    color: #4a6cf7;
    background: rgba(74, 108, 247, 0.08);
    border-radius: 3px;
    padding: 0 2px;
    text-decoration: none;
    cursor: pointer;
}

:global(.page-link:hover) {
    background: rgba(74, 108, 247, 0.16);
}
</style>
