<script>
import { showAlert, showConfirm } from '../../helpers/dialogs.js'
export let pageId = null
export let viewOnly = false
export let pageContentOverride = undefined
export let style = ''

let loaded = false

let columns = []
let items = []
let totals = {}
let widths = {}
let rowStyle = ''
let startupScript = ''
let customFunctions = ''
let note = ''
let stats = { widgets: [] }
let statsView = false
let statsEditMode = false
let showInsertFileModal = false
let insertFileModalLinkLabel = ''
let currentTd = null
let noteContainer = null
let savedCursorPosition = null
// Styles and computed columns are calculated on the fly per visible cell to reduce state bookkeeping

// Minimal pagination (show last 250 rows by default when large)
const PAGE_SIZE = 250
let currentPage = 1
let totalPages = 1
let showPagination = false
let visibleStartIndex = 0
let visibleItems = []
// Rows absorbed onto the current page beyond PAGE_SIZE so inserts don't
// jump the UI to the next page. Resets on page navigation / reload.
let overflowCount = 0
// Per-page scroll memory so navigating back to a page restores where the
// user was. Cleared when content changes (fetch/paste/filter).
let pageScrollPositions = new Map()
let gotoPageInput = ''
let savedPage = 1
let savedScrollTop = 0

// ── Column filter state ──────────────────────────────────────────────────
let activeFilters = {}  // { [columnName]: Set<string> }
let filterDropdown = { show: false, columnName: null, position: { top: 0, left: 0 } }
// hasActiveFilters is derived after filteredItems (below) to reflect actual row hiding

let autocompleteData = {
    show: false,
    suggestions: [],
    position: { top: 0, left: 0 },
    item: null,
    columnName: null,
}

const rowStyleCache = new Map()
const colStyleCache = new Map() // Map<rowIndex, Map<colName, string>>

function computeRowStyle(rowIndex) {
    if (!rowStyle) return ''
    if (rowStyleCache.has(rowIndex)) return rowStyleCache.get(rowIndex)
    const result = evalulateJS('Row Style', rowStyle, rowIndex, null, engine.getEnrichedItem(rowIndex))
    rowStyleCache.set(rowIndex, result)
    return result
}

function computeColumnStyle(rowIndex, columnIndex, columnName) {
    if (!columns[columnIndex].style) return ''
    const rowCache = colStyleCache.get(rowIndex)
    if (rowCache?.has(columnName)) return rowCache.get(columnName)
    const result = evalulateJS('Column Style', columns[columnIndex].style, rowIndex, columnName, engine.getEnrichedItem(rowIndex))
    if (!colStyleCache.has(rowIndex)) colStyleCache.set(rowIndex, new Map())
    colStyleCache.get(rowIndex).set(columnName, result)
    return result
}


$: { engine.setColumns(columns); rowStyleCache.clear(); colStyleCache.clear() }
$: engine.setItems(items)
$: { engine.setCustomFunctions(customFunctions); evalFnCache.clear(); rowStyleCache.clear(); colStyleCache.clear() }
$: { rowStyle; rowStyleCache.clear() }
$: if (pageContentOverride) {
    let parsedPage = JSON.parse(pageContentOverride)
    resetTableHistory()
    dontTriggerSave = true
    loaded = false
    activeFilters = {}
    filterDropdown = { show: false, columnName: null, position: { top: 0, left: 0 } }
    overflowCount = 0
    pageScrollPositions.clear()
    columns = parsedPage.columns
    items = parsedPage.items
    totals = parsedPage.totals
    widths = parsedPage.widths
    rowStyle = parsedPage.rowStyle
    startupScript = parsedPage.startupScript
    customFunctions = parsedPage.customFunctions
    note = parsedPage.note || ''

    // styles and computed columns are now computed on the fly

    // initialize pagination for pageContentOverride: go to last page immediately
    currentPage = Math.max(1, Math.ceil((items?.length || 0) / PAGE_SIZE))

    // Focus last cell and scroll to it on initial load (both paginated and non-paginated)
    setTimeout(() => {
        focusLastEditableCell()
    }, 0)

    loaded = true

    // External content change -> refresh editors
    editorKey++
}

$: fetchPage(pageId)

import fetchPlus from '../../helpers/fetchPlus.js'
import { fetchTablePageContent, saveTablePageContent } from '../../helpers/tablePagePersistence.js'

let editableTable = null

let fetchRequestId = 0

function fetchPage(pageIdRequested) {
    const requestId = ++fetchRequestId
    flushPageContent()
    resetTableHistory()
    if (pageIdRequested === null || pageContentOverride !== undefined) {
        return
    }
    loaded = false
    // reset variables on page change
    configuration = false
    statsView = false
    statsEditMode = false
    showAddColumn = false
    cancelEditColumn()
    activeFilters = {}
    filterDropdown = { show: false, columnName: null, position: { top: 0, left: 0 } }
    overflowCount = 0
    pageScrollPositions.clear()
    // end of reset variables on page change
    fetchTablePageContent(pageIdRequested).then((response) => {
        if (requestId !== fetchRequestId || pageIdRequested !== pageId || pageContentOverride !== undefined) return
        let parsedResponse = response.content
            ? JSON.parse(response.content)
            : {
                  columns: [],
                  items: [],
                  totals: {},
                  widths: {},
                  rowStyle: '',
                  startupScript: '',
                  customFunctions: '',
                  note: '',
              }
        columns = parsedResponse.columns
        dontTriggerSave = true
        totals = parsedResponse.totals
        widths = parsedResponse.widths ? parsedResponse.widths : {}
        rowStyle = parsedResponse.rowStyle ? parsedResponse.rowStyle : ''
        startupScript = parsedResponse.startupScript
            ? parsedResponse.startupScript
            : ''
        customFunctions = parsedResponse.customFunctions
            ? parsedResponse.customFunctions
            : ''
        note = parsedResponse.note ? parsedResponse.note : ''
        stats = parsedResponse.stats ?? { widgets: [] }

        if (
            !viewOnly &&
            columns.length > 0 &&
            startupScript &&
            startupScript.trim()
        ) {
            const copyOfItems = JSON.stringify(parsedResponse.items)
            evalulateStartupScript(startupScript, {
                rows: parsedResponse.items,
            })
            if (copyOfItems !== JSON.stringify(parsedResponse.items)) {
                dontTriggerSave = false
            }
        }

        items = parsedResponse.items

        // styles and computed columns are now computed on the fly

        // initialize pagination for fetched data: go to last page immediately
        currentPage = Math.max(1, Math.ceil((items?.length || 0) / PAGE_SIZE))

        if (columns.length === 0) {
            configuration = true
            showAddColumn = true
        }

        // set focus to the last cell in the table (both paginated and non-paginated)
        setTimeout(() => {
            if (requestId !== fetchRequestId) return
            loaded = true
            tick().then(() => {
                if (requestId === fetchRequestId) focusLastEditableCell()
            })
        }, 0)

        // External content change -> refresh editors
        editorKey++
    })
}

let pageSavePending = null
let pageSaveTimer = null

function flushPageContent() {
    clearTimeout(pageSaveTimer)
    if (!pageSavePending) return
    const { pageId: pageIdSaved, content } = pageSavePending
    pageSavePending = null
    saveTablePageContent(pageIdSaved, JSON.stringify(content)).catch((error) => {
        console.error('Table save failed', error)
    })
}
onDestroy(() => {
    loaded = false
    fetchRequestId++
    historyFocusRequest++
    flushPageContent()
})

function queueSavePageContent() {
    if (pageId === null || viewOnly || pageContentOverride !== undefined) return
    if (pageSavePending && pageSavePending.pageId !== pageId) flushPageContent()
    // Keep the owner and its data together, and serialize after the debounce
    // so a large table is not copied on every keystroke.
    pageSavePending = {
        pageId,
        content: {
            columns,
            items,
            totals,
            widths,
            rowStyle,
            startupScript,
            customFunctions,
            note,
            stats,
        },
    }
    clearTimeout(pageSaveTimer)
    pageSaveTimer = setTimeout(flushPageContent, 500)
}

let dontTriggerSave = true

function save() {
    items = items // save
}

$: if (items) {
    totals = totals
    Object.keys(totals).forEach((columnName) => {
        if (totals[columnName] === '') {
            delete totals[columnName]
        }

        // remove totals for columns that are not present in the table
        if (!columns.some((column) => column.name === columnName)) {
            delete totals[columnName]
        }
    })

    widths = widths
    Object.keys(widths).forEach((columnName) => {
        if (widths[columnName] === '') {
            delete widths[columnName]
        }
    })

    rowStyle = rowStyle

    startupScript = startupScript

    customFunctions = customFunctions

    note = note

    if (!dontTriggerSave) {
        queueSavePageContent()
    }

    dontTriggerSave = false
}

// Apply active filters to produce filteredItems
// empty Set = all unchecked = no filter for that column (same as all checked)
$: itemIndexes = new Map((items || []).map((item, index) => [item, index]))
$: filteredItems = (items || []).filter((item) =>
    Object.entries(activeFilters).every(([colName, allowedSet]) => {
        if (allowedSet.size === 0) return true
        const text = stripHtml(String(item[colName] ?? '')).trim()
        return allowedSet.has(text)
    })
)
// Only treat filter as active when rows are actually being hidden (full Set = show all = not active)
$: hasActiveFilters = filteredItems.length < (items || []).length

// Overflow rows are excluded from totalPages so the current page absorbs
// them without spawning a near-empty next page.
$: totalPages = Math.max(1, Math.ceil(((filteredItems?.length || 0) - overflowCount) / PAGE_SIZE))
$: showPagination = totalPages > 1

// Initialize to last page once per page load (no jumps on subsequent edits)
// handled explicitly after data loads (fetchPage and pageContentOverride)

// Keep current page within bounds if items shrink/expand
$: if (currentPage > totalPages) {
    currentPage = totalPages
}
$: if (currentPage < 1) {
    currentPage = 1
}

// Compute visible slice
$: visibleStartIndex = showPagination ? (currentPage - 1) * PAGE_SIZE : 0
$: visibleItems = showPagination
    ? (filteredItems || []).slice(visibleStartIndex, visibleStartIndex + PAGE_SIZE + overflowCount)
    : filteredItems || []

function evalulateStartupScript(jsString, dynamicVariables) {
    try {
        const functionParameters = Object.keys(dynamicVariables).join(',')
        const functionArguments = Object.values(dynamicVariables)
        return new Function(functionParameters, jsString).apply(
            this,
            functionArguments,
        )
    } catch (e) {
        showAlert('error evaluating startup script')
        console.log('startup script error', e)
    }
}

function gotoPage(pageStr) {
    const n = parseInt(String(pageStr ?? '').trim(), 10)
    if (Number.isNaN(n)) {
        gotoPageInput = ''
        return
    }
    const clamped = Math.min(totalPages, Math.max(1, n))
    goToPage(clamped)
    gotoPageInput = ''
}

function scrollTableTop() {
    editableTable?.scrollIntoView({
        behavior: 'auto',
        block: 'start',
        inline: 'nearest',
    })
}

function getScrollContainer(el) {
    let node = el?.parentElement
    while (node) {
        const style = window.getComputedStyle(node)
        if (style.overflow === 'auto' || style.overflow === 'scroll' ||
            style.overflowY === 'auto' || style.overflowY === 'scroll') {
            return node
        }
        node = node.parentElement
    }
    return null
}

function saveScrollState() {
    savedPage = currentPage
    savedScrollTop = getScrollContainer(editableTable)?.scrollTop ?? 0
}

function restoreScrollState() {
    currentPage = savedPage
    const sc = getScrollContainer(editableTable)
    if (sc) sc.scrollTop = savedScrollTop
}

function goToPage(n) {
    const clamped = Math.min(totalPages, Math.max(1, n))
    if (clamped !== currentPage) {
        const sc = getScrollContainer(editableTable)
        if (sc) pageScrollPositions.set(currentPage, sc.scrollTop)

        overflowCount = 0
        currentPage = clamped

        tick().then(() => {
            const saved = pageScrollPositions.get(clamped)
            if (saved !== undefined) {
                const container = getScrollContainer(editableTable)
                if (container) container.scrollTop = saved
            } else {
                scrollTableTop()
            }
        })
    }
}

function focusLastEditableCell() {
    if (!editableTable) return
    // Touch users should arrive at the latest rows without opening the keyboard
    // or jumping sideways to the last editable column.
    if (window.matchMedia('(pointer: coarse)').matches) {
        if (viewOnly || pageContentOverride !== undefined) return
        const row = editableTable.querySelector('tbody > tr:last-child')
        const container = getScrollContainer(editableTable)
        if (row && container) {
            const rowBounds = row.getBoundingClientRect()
            const containerBounds = container.getBoundingClientRect()
            const headerHeight = editableTable.tHead?.getBoundingClientRect().height ?? 0
            // Show the beginning of a row that is taller than the viewport.
            container.scrollTop += Math.max(0, Math.min(
                rowBounds.top - containerBounds.top - headerHeight,
                rowBounds.bottom - containerBounds.top - container.clientHeight,
            ))
        }
        return
    }
    let lastEditableTD = editableTable.querySelectorAll(
        'tbody > tr:last-child > td > div[contenteditable]:empty',
    )
    if (lastEditableTD.length === 0) {
        lastEditableTD = editableTable.querySelectorAll(
            'tbody > tr:last-child > td > div[contenteditable]',
        )
        lastEditableTD = lastEditableTD[lastEditableTD.length - 1]
    } else {
        lastEditableTD = lastEditableTD[0]
    }
    if (lastEditableTD) {
        lastEditableTD.focus()
        lastEditableTD.scrollIntoView()
    }
    // move cursor to the end of editable area
    document.execCommand('selectAll', false, null)
    document.getSelection().collapseToEnd()
}

function evalulateJS(source, jsString, rowIndex = null, columnName = null, enrichedItem = undefined, enrichedItemsOverride = undefined) {
    if (source.includes('Row Style')) {
        evalStats.rowStyle++
    } else if (source.includes('Column Style')) {
        evalStats.columnStyle++
    } else if (source.includes('Computed Column')) {
        evalStats.computedColumn++
    }
    evalStats.total++

    clearTimeout(evalStatsTimer)
    evalStatsTimer = setTimeout(() => {
        if (evalStats.total > 0) {
            console.log('Evaluated expressions:', {
                'Row Styles': evalStats.rowStyle,
                'Column Styles': evalStats.columnStyle,
                'Computed Columns': evalStats.computedColumn,
                Total: evalStats.total,
            })
            evalStats = {
                rowStyle: 0,
                columnStyle: 0,
                computedColumn: 0,
                total: 0,
            }
        }
    }, 100)

    const code = (customFunctions ? customFunctions + '\n' : '') + jsString
    if (!evalFnCache.has(code)) {
        evalFnCache.set(code, new Function('items', 'rowIndex', 'item', 'columnName', code))
    }
    const fn = evalFnCache.get(code)
    const itemsArg = enrichedItemsOverride ?? items
    const itemArg = enrichedItem ?? (rowIndex !== null ? itemsArg[rowIndex] : null)

    try {
        return fn.call(this, itemsArg, rowIndex, itemArg, columnName)
    } catch (e) {
        console.error(`${source}:`, e)
        return 'error evaluating given expression'
    }
}

import { createTableHistory, captureCellSelection, restoreCellSelection } from '../../helpers/tableHistory.js'
import { createTableCellEditor } from '../../helpers/tableCellEditor.js'

const tableHistory = createTableHistory()
const cellEditors = new Map()
let historyFocusRequest = 0

function canEditTable(row) {
    return loaded && !viewOnly && pageContentOverride === undefined
        && (!row || items.includes(row))
}

const tableCellEditor = createTableCellEditor({
    history: tableHistory,
    editors: cellEditors,
    editable: canEditTable,
    onChange: (event, row, columnName) => handleInputInTD(event, items.indexOf(row), columnName),
    onHistory: applyTableHistory,
})

function resetTableHistory() {
    tableHistory.clear()
    historyFocusRequest++
}

function captureTableFocus(fallbackRow) {
    for (const [row, editors] of cellEditors) {
        for (const [columnName, { node }] of editors) {
            const selection = captureCellSelection(node)
            if (node === document.activeElement || selection) {
                return { row, columnName, selection }
            }
        }
    }
    return { row: fallbackRow, columnName: columns.find((column) => column.type !== 'Computed')?.name }
}

async function restoreTableFocus(focus) {
    const request = ++historyFocusRequest
    await tick()
    if (request !== historyFocusRequest || !canEditTable()) return
    const index = filteredItems.indexOf(focus?.row)
    if (index >= 0 && !visibleItems.includes(focus.row)) {
        goToPage(Math.floor(index / PAGE_SIZE) + 1)
        await tick()
    }
    if (request !== historyFocusRequest) return
    const node = cellEditors.get(focus?.row)?.get(focus?.columnName)?.node
    if (node) {
        node.focus({ preventScroll: true })
        restoreCellSelection(node, focus.selection)
        node.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    } else {
        // Keep shortcuts in the table when a filter hides the changed row.
        editableTable?.focus({ preventScroll: true })
    }
}

function refreshTableStructure() {
    engine.onStructuralChange()
    rowStyleCache.clear()
    colStyleCache.clear()
    items = items
}

function applyTableHistory(redo = false) {
    if (!canEditTable()) return
    for (const editors of cellEditors.values()) {
        if ([...editors.values()].some((editor) => editor.composing)) return
    }
    const result = redo ? tableHistory.redo(items) : tableHistory.undo(items)
    if (result.status === 'conflict') {
        showAlert('Undo is no longer available because the table changed outside its edit history.')
        return
    }
    if (result.status !== 'applied') return
    autocompleteData.show = false
    closeTablePageLinkDropdown()
    if (result.change.type === 'rows') {
        const view = redo ? result.change.afterView : result.change.beforeView
        currentPage = view.currentPage
        overflowCount = view.overflowCount
    }
    refreshTableStructure()
    restoreTableFocus(result.focus)
}

// Consolidated logging for evalulateJS calls
let evalStats = { rowStyle: 0, columnStyle: 0, computedColumn: 0, total: 0 }
let evalStatsTimer = null
const evalFnCache = new Map()

import defaultKeydownHandlerForContentEditableArea from '../../helpers/defaultKeydownHandlerForContentEditableArea.js'
import { createTableComputeEngine } from '../../helpers/tableComputeEngine.js'
const engine = createTableComputeEngine()

// From: https://stackoverflow.com/a/7478420/4932305
function getSelectionTextInfo(el) {
    var atStart = false,
        atEnd = false
    var selRange, testRange
    if (window.getSelection) {
        var sel = window.getSelection()
        if (sel.rangeCount) {
            selRange = sel.getRangeAt(0)
            testRange = selRange.cloneRange()

            testRange.selectNodeContents(el)
            testRange.setEnd(selRange.startContainer, selRange.startOffset)
            atStart = testRange.toString() == ''

            testRange.selectNodeContents(el)
            testRange.setStart(selRange.endContainer, selRange.endOffset)
            atEnd = testRange.toString() == ''
        }
    } else if (document.selection && document.selection.type != 'Control') {
        selRange = document.selection.createRange()
        testRange = selRange.duplicate()

        testRange.moveToElementText(el)
        testRange.setEndPoint('EndToStart', selRange)
        atStart = testRange.text == ''

        testRange.moveToElementText(el)
        testRange.setEndPoint('StartToEnd', selRange)
        atEnd = testRange.text == ''
    }

    return { atStart: atStart, atEnd: atEnd }
}

function emptyRow() {
    return Object.fromEntries(columns.map((column) => [column.name, '']))
}

function insertRow(rowIndex, insertAbove) {
    if (!canEditTable(items[rowIndex]) || !items[rowIndex] || hasActiveFilters) return
    const row = emptyRow()
    const index = rowIndex + (insertAbove ? 0 : 1)
    const beforeFocus = captureTableFocus(items[rowIndex])
    const afterFocus = insertAbove ? beforeFocus : {
        row, columnName: columns.find((column) => column.type !== 'Computed')?.name,
    }
    tableHistory.recordRows({
        index, before: [], after: [row],
        previousRow: items[index - 1], nextRow: items[index],
        beforeFocus, afterFocus,
        beforeView: { currentPage, overflowCount },
        afterView: { currentPage, overflowCount: overflowCount + 1 },
    })
    items.splice(index, 0, row)
    overflowCount++
    refreshTableStructure()
    restoreTableFocus(afterFocus)
}

function deleteRow(rowIndex) {
    const row = items[rowIndex]
    if (!row || !canEditTable(row) || hasActiveFilters) return
    const beforeFocus = captureTableFocus(row)
    // Keep one editable row, and record its replacement as exactly one action.
    const after = items.length === 1 ? [emptyRow()] : []
    const afterFocus = {
        row: after[0] ?? items[rowIndex - 1] ?? items[rowIndex + 1],
        columnName: beforeFocus.columnName,
    }
    const overflowCountAfter = Math.max(0, overflowCount + after.length - 1)
    const totalPagesAfter = Math.max(1, Math.ceil(
        (items.length - 1 + after.length - overflowCountAfter) / PAGE_SIZE,
    ))
    tableHistory.recordRows({
        index: rowIndex, before: [row], after,
        previousRow: items[rowIndex - 1], nextRow: items[rowIndex + 1],
        beforeFocus, afterFocus,
        beforeView: { currentPage, overflowCount },
        afterView: {
            currentPage: Math.min(currentPage, totalPagesAfter),
            overflowCount: overflowCountAfter,
        },
    })
    items.splice(rowIndex, 1, ...after)
    overflowCount = overflowCountAfter
    refreshTableStructure()
    restoreTableFocus(afterFocus)
}

function handleKeysInTD(e, itemIndex, itemColumn) {
    if (e.isComposing) return
    // [[ page link dropdown: must run first to prevent cell-navigation keys from firing
    if (pageLinkAnchorRect) {
        if (pageLinkDropdown) {
            const handled = pageLinkDropdown.handleKeydown(e)
            if (handled) return
        }
        if (e.key === 'Backspace') {
            if (pageLinkQuery.length > 0) {
                pageLinkQuery = pageLinkQuery.slice(0, -1)
            } else {
                closeTablePageLinkDropdown()
            }
            return
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            pageLinkQuery += e.key
        }
        return
    }

    defaultKeydownHandlerForContentEditableArea(e)
    saveCursorPosition()

    // insert row (disabled while filters active — row index would be wrong)
    if (e.ctrlKey && e.key === 'Enter' && !hasActiveFilters) {
        e.preventDefault()
        if (e.shiftKey) {
            insertRow(itemIndex, true)
        } else {
            insertRow(itemIndex, false)
        }
    }

    // remove current row (disabled while filters active — row index would be wrong)
    if (e.ctrlKey && e.key.toLowerCase() === 'delete' && !hasActiveFilters) {
        e.preventDefault()
        deleteRow(itemIndex)
    }

    // handle autocomplete navigation
    if (autocompleteData.show) {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            const suggestions = document.querySelectorAll('.suggestions li')
            if (suggestions.length > 0) {
                globalThis.cellFocus = document.activeElement
                suggestions[0].focus()
            }
            return
        }
    }

    // move to upper cell
    if (e.key === 'ArrowUp') {
        if (
            getSelectionTextInfo(e.target.closest('td')).atStart === false &&
            e.ctrlKey === false
        ) {
            return
        }
        e.preventDefault()
        let rows = e.target.closest('tbody').querySelectorAll('tr')
        let currentColumn = e.target.parentElement.cellIndex
        let upperRow = rows[e.target.parentElement.parentElement.rowIndex - 2]
        if (typeof upperRow !== 'undefined') {
            let upperCell = upperRow.querySelector(
                'td:nth-of-type(' + (currentColumn + 1) + ') > div',
            )
            upperCell.focus()
        }
    }

    // move to bottom cell
    if (e.key === 'ArrowDown') {
        if (
            getSelectionTextInfo(e.target.closest('td')).atEnd === false &&
            e.ctrlKey === false
        ) {
            return
        }
        e.preventDefault()
        let rows = e.target.closest('tbody').querySelectorAll('tr')
        let currentColumn = e.target.parentElement.cellIndex
        let bottomRow = rows[e.target.parentElement.parentElement.rowIndex]
        if (typeof bottomRow !== 'undefined') {
            let bottomCell = bottomRow.querySelector(
                'td:nth-of-type(' + (currentColumn + 1) + ') > div',
            )
            bottomCell.focus()
        }
    }

    // copy all content from the above cell to the current cell
    if (e.ctrlKey && e.key === ';') {
        e.preventDefault()
        const rows = e.target.closest('tbody').querySelectorAll('tr')
        const currentColumn = e.target.parentElement.cellIndex
        const upperRow = rows[e.target.parentElement.parentElement.rowIndex - 2]
        if (typeof upperRow !== 'undefined') {
            const upperCell = upperRow.querySelector(
                'td:nth-of-type(' + (currentColumn + 1) + ') > div',
            )
            document.execCommand('insertHTML', false, upperCell.innerHTML)
        }
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        currentTd = e.target
        insertFileModalLinkLabel = window.getSelection().toString() // prefill selected text, so that you can convert selected text to a link to an upload file
        showInsertFileModal = true
    }

    if (e.key === 'Escape') {
        e.preventDefault()
        autocompleteData.show = false
    }

    if (e.key === '[' && !e.ctrlKey && !e.metaKey) {
        if (tableLinkLastKeyWasBracket) {
            tableLinkLastKeyWasBracket = false
            setTimeout(() => openTablePageLinkDropdown(), 0)
        } else {
            tableLinkLastKeyWasBracket = true
        }
    } else {
        tableLinkLastKeyWasBracket = false
    }
}

function handleBlur() {
    // Check if the new focus is within the suggestions list
    setTimeout(() => {
        const activeElement = document.activeElement
        if (activeElement && activeElement.closest('.suggestions')) {
            return
        }
        autocompleteData.show = false
    }, 0)
}

function handleTableHistoryKeydown(event) {
    if (event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    if (key !== 'z' && !(key === 'y' && !event.shiftKey)) return
    // Never fall through to the browser's stale DOM history, even when our
    // stack is empty. Other editors, including the note, own their shortcuts.
    event.preventDefault()
    event.stopPropagation()
    applyTableHistory(key === 'y' || event.shiftKey)
}

let configuration = false
let showAddColumn = false
let column = {
    name: '',
    label: '',
    wrap: '',
    align: '',
    type: '',
    autocomplete: '',
    filterable: '',
}

$: if (showAddColumn) {
    column = {
        name: '',
        label: '',
        wrap: '',
        align: '',
        type: '',
        autocomplete: '',
        filterable: '',
    }
    cancelEditColumn()
}

function addColumn() {
    let existingColumnNames = columns.map((column) => column.name)
    if (existingColumnNames.includes(column.name)) {
        showAlert("You can't use an existing column name")
        return
    }

    if (column.label === '') {
        column.label = column.name
    }

    resetTableHistory()
    columns.push(column)
    columns = columns
    if (items.length === 0) {
        items.push({
            [column.name]: '',
        })
    } else {
        items.forEach((item) => {
            item[column.name] = ''
        })
    }
    items = items // save
    column = {
        name: '',
        label: '',
        wrap: '',
        align: '',
        type: '',
        autocomplete: '',
        filterable: '',
    }
    showAddColumn = false
}

function swapElement(array, fromIndex, toIndex) {
    var tmp = array[fromIndex]
    array[fromIndex] = array[toIndex]
    array[toIndex] = tmp
}

function moveUp(index) {
    if (index > 0) {
        swapElement(columns, index, index - 1)
        columns = columns
        items = items // save
    }
}

function moveDown(index) {
    if (index < columns.length - 1) {
        swapElement(columns, index, index + 1)
        columns = columns
        items = items // save
    }
}

let columnToEditCopy = null
let columnToEditReference = null

function startEditColumn(column) {
    showAddColumn = false // disable add
    columnToEditCopy = JSON.parse(JSON.stringify(column))
    columnToEditReference = column
}

function cancelEditColumn() {
    columnToEditCopy = null
    columnToEditReference = null
}

function updateColumn() {
    if (columnToEditCopy.name === '') {
        showAlert("Column name can't be be empty")
        return
    }
    let existingColumnNames = columns
        .map((column) => column.name)
        .filter((columnName) => columnName != columnToEditReference.name)
    if (existingColumnNames.includes(columnToEditCopy.name)) {
        showAlert("You can't use an existing column name")
        return
    }
    if (columnToEditReference.name !== columnToEditCopy.name
        || columnToEditReference.type !== columnToEditCopy.type) {
        resetTableHistory()
    }
    if (columnToEditReference.name !== columnToEditCopy.name) {
        // column name changed, rename column name in items
        items.forEach((item) => {
            item[columnToEditCopy.name] = item[columnToEditReference.name]
            delete item[columnToEditReference.name]
        })
        // migrate active filter to new column name
        if (activeFilters[columnToEditReference.name]) {
            const { [columnToEditReference.name]: filterSet, ...rest } = activeFilters
            activeFilters = { ...rest, [columnToEditCopy.name]: filterSet }
        }
    }
    columnToEditReference.name = columnToEditCopy.name
    columnToEditReference.label = columnToEditCopy.label
    columnToEditReference.wrap = columnToEditCopy.wrap
    columnToEditReference.align = columnToEditCopy.align
    columnToEditReference.type = columnToEditCopy.type
    columnToEditReference.autocomplete = columnToEditCopy.autocomplete
    columnToEditReference.filterable = columnToEditCopy.filterable
    items = items // save
    columnToEditCopy = null
    columnToEditReference = null
}

async function deleteColumn(columnName) {
    if (
        await showConfirm(
            'Deleting a column, will also delete all the items under it. Are you sure you want to delete this column?',
            { confirmLabel: 'Delete', danger: true },
        )
    ) {
        resetTableHistory()
        columns = columns.filter((column) => column.name !== columnName)
        items.forEach((item) => {
            Object.keys(item).forEach((itemColumName) => {
                if (
                    !columns
                        .map((column) => column.name)
                        .includes(itemColumName)
                ) {
                    delete item[itemColumName]
                }
            })
        })
        if (activeFilters[columnName]) {
            const { [columnName]: _, ...rest } = activeFilters
            activeFilters = rest
        }
        items = items // save
    }
}

function focus(element) {
    element.focus()
}

// strip formatting on paste and make it plain text
function handlePaste(e) {
    // e.preventDefault()
    // var text = (e.originalEvent || e).clipboardData.getData('text/plain')
    // document.execCommand('insertText', false, text.trim())
}

function saveCursorPosition() {
    const selection = window.getSelection()
    savedCursorPosition = selection.rangeCount ? selection.getRangeAt(0) : null
}

function handleKeysInNote(e) {
    defaultKeydownHandlerForContentEditableArea(e)
    saveCursorPosition()

    if (e.ctrlKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        currentTd = noteContainer
        insertFileModalLinkLabel = window.getSelection().toString()
        showInsertFileModal = true
    }

    // add 4 spaces when pressing tab instead of its default behavior
    if (e.key === 'Tab') {
        e.preventDefault()
        document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;')
    }
}

function handleNotePaste(event) {
    var items = (event.clipboardData || event.originalEvent.clipboardData).items
    // find pasted image among pasted items
    var blob = null
    for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') === 0) {
            blob = items[i].getAsFile()
        }
    }
    // load image if there is a pasted image
    if (blob !== null) {
        event.preventDefault()

        document.execCommand(
            'insertHTML',
            false,
            `<img class="upload-image-loader" style="max-width: 100%" src="/images/loader-rainbow-dog.gif">`,
        )

        var data = new FormData()
        data.append('image', blob)

        fetchPlus.post(`/upload-image/${pageId}`, data)
            .then((response) => {
                document.querySelector('.upload-image-loader').remove()
                document.execCommand(
                    'insertHTML',
                    false,
                    `<img style="max-width: 100%" loading="lazy" src="${baseURL + '/' + response.imageUrl}">`,
                )
            })
    }

    // on a plain text paste, detect links, show confirmation and if yes, convert the
    // detected links to links before the pasted text is inserted into the page
    if (event.clipboardData.types.includes('text/plain')) {
        const text = event.clipboardData.getData('text/plain')
        const linksRegex = /(https?:\/\/[^\s]+)/g
        const links = text.match(linksRegex)
        if (links && links.length > 0) {
            // The answer comes later, and by then the browser's own paste can
            // no longer happen. So the paste is taken over here either way,
            // with what the clipboard held and where the caret was.
            event.preventDefault()
            const pastedHtml = event.clipboardData.getData('text/html')
            const editable = event.currentTarget
            const selection = window.getSelection()
            const at = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null
            showConfirm(`Do you want to convert ${links.length} links to clickable links?`, { confirmLabel: 'Convert', cancelLabel: 'Paste as is' }).then((convert) => {
                editable.focus()
                if (at) {
                    selection.removeAllRanges()
                    selection.addRange(at)
                }
                if (!convert) {
                    // What a plain paste would have put in.
                    const fragment = pastedHtml.match(/<!--StartFragment-->([\s\S]*)<!--EndFragment-->/)
                    if (pastedHtml) document.execCommand('insertHTML', false, fragment ? fragment[1] : pastedHtml)
                    else document.execCommand('insertText', false, text)
                    return
                }

                let html = text
                    .split('\n')
                    .map((line) => {
                        return line.replace(
                            linksRegex,
                            '<a href="$1" target="_blank" contenteditable="false">$1</a>',
                        )
                    })
                    .join('<br>')

                if (text.endsWith('\n')) {
                    html += '<br>'
                }

                document.execCommand('insertHTML', false, html)
            })
        }
    }
}

function copyConfiguration() {
    let copyText = JSON.stringify({
        columns,
        totals,
        widths,
        rowStyle,
        startupScript,
        customFunctions,
        note,
    })
    navigator.clipboard.writeText(copyText).then(() => {
        showAlert('Configuration copied to clipboard')
    })
}

async function pasteConfiguration() {
    const clipboardText = await navigator.clipboard.readText()
    if (
        !(await showConfirm(
            'Are you sure you want to paste configuration? This will overwrite the current configuration.',
            { confirmLabel: 'Paste' },
        ))
    ) {
        return
    }
    try {
        let parsedClipboardText = JSON.parse(clipboardText)
        resetTableHistory()
        columns = parsedClipboardText.columns
        activeFilters = {}
        closeFilterDropdown()
        overflowCount = 0
        pageScrollPositions.clear()
        if (items.length === 0) {
            items.push({})
        }
        totals = parsedClipboardText.totals
        widths = parsedClipboardText.widths
        rowStyle = parsedClipboardText.rowStyle
        startupScript = parsedClipboardText.startupScript
        customFunctions = parsedClipboardText.customFunctions
        note = parsedClipboardText.note || ''
        editorKey++
    } catch (e) {
        showAlert('Invalid configuration')
    }
}

function getColumnSuggestions(columnName) {
    // The cell action updates the row before this handler runs. Read that
    // current value instead of a reactive cache still holding the last input.
    return [...new Set(items
        .map((item) => item[columnName])
        .filter((value) => value)
        .map((value) => {
            const tempDiv = document.createElement('div')
            tempDiv.innerHTML = value.trim()
            return tempDiv.textContent || ''
        }))].filter((value) => value !== '')
}

// Prefer prefix matches, then word-boundary hits, finally other substrings for autocomplete.
function scoreSuggestion(query, suggestion) {
    const normalizedQuery = query.toLowerCase()
    const normalizedSuggestion = suggestion.toLowerCase()
    if (normalizedQuery === '') {
        return 0
    }
    const index = normalizedSuggestion.indexOf(normalizedQuery)

    if (index === -1) {
        return Number.POSITIVE_INFINITY
    }

    if (normalizedSuggestion.startsWith(normalizedQuery)) {
        return index // stays 0 so prefixes rank first
    }

    const wordBoundaryRegex = new RegExp(
        `\\b${normalizedQuery.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`,
    )
    if (wordBoundaryRegex.test(normalizedSuggestion)) {
        return index + 1 // word boundary hits come next
    }

    return index + 2 // fallback on substring position to keep results stable
}

function handleInputInTD(e, itemIndex, columnName) {
    // itemIndex is global index
    const column = columns.find((col) => col.name === columnName)
    if (column && column.autocomplete === 'Yes') {
        const value = e.target.textContent
        const query = value.trim()
        const lowerQuery = query.toLowerCase()
        const allSuggestions = getColumnSuggestions(columnName)
        const filteredSuggestions = allSuggestions
            .filter((suggestion) => {
                const lowerSuggestion = suggestion.toLowerCase()
                return (
                    lowerSuggestion.includes(lowerQuery) &&
                    lowerSuggestion !== lowerQuery
                )
            })
            .map((suggestion) => ({
                suggestion,
                score: scoreSuggestion(query, suggestion),
            }))
            .sort((a, b) => {
                if (a.score !== b.score) {
                    return a.score - b.score
                }
                return a.suggestion.localeCompare(b.suggestion)
            })
            .map((entry) => entry.suggestion)

        if (filteredSuggestions.length > 0) {
            autocompleteData.show = true
            autocompleteData.suggestions = filteredSuggestions
            autocompleteData.position = getSuggestionPosition(e.target)
            autocompleteData.item = items[itemIndex]
            autocompleteData.columnName = columnName
        } else {
            autocompleteData.show = false
        }
    } else {
        autocompleteData.show = false
    }

    for (const row of engine.onRawCellChanged(itemIndex, columnName)) {
        rowStyleCache.delete(row)
        colStyleCache.delete(row)
    }
    items = items // re-evaluate row/column styles for affected rows
    if (document.activeElement === e.target) {
        const request = historyFocusRequest
        tick().then(() => {
            // Editing a filter value may remove this cell from the view. Keep
            // undo reachable without clearing the user's filter or stealing
            // focus from a control they have since chosen.
            if (!e.target.isConnected && document.activeElement === document.body
                && request === historyFocusRequest && canEditTable()) {
                editableTable?.focus({ preventScroll: true })
            }
        })
    }
}

function getSuggestionPosition(element) {
    const rect = element.getBoundingClientRect()
    return {
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
    }
}

function handleSelectSuggestion(event) {
    const { item, columnName } = autocompleteData
    if (!canEditTable(item)) return
    cellEditors.get(item)?.get(columnName)?.replaceText(event.detail.suggestion)
    autocompleteData.show = false
}

function getColumnValue(type, value) {
    if (type === undefined || type === '') {
        return value
    }

    if (type === 'Input (Plain Text)') {
        return value.split('\n').join('<br>')
    }

    showAlert('Invalid column type')
}

import { onDestroy, tick } from 'svelte'
import 'code-mirror-custom-element'
import InsertFileModal from '../Modals/InsertFileModal.svelte'
import TableStats from './TableStats.svelte'
import { eventStore } from '../../stores.js'
import Autocomplete from '../Autocomplete.svelte'
import { baseURL } from '../../../config.js'
import AIChatPanel from '../../components/AIChatPanel.svelte'
import PageLinkDropdown from '../../components/PageLinkDropdown.svelte'

// [[ page link state for table cells
let pageLinkQuery = ''
let pageLinkAnchorRect = null
let pageLinkDropdown
let pageLinkStartRange = null
let tableLinkLastKeyWasBracket = false

function getCaretRect() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    return sel.getRangeAt(0).getBoundingClientRect()
}

function openTablePageLinkDropdown() {
    pageLinkAnchorRect = getCaretRect()
    pageLinkQuery = ''
    const sel = window.getSelection()
    pageLinkStartRange = sel.getRangeAt(0).cloneRange()
    try {
        pageLinkStartRange.setStart(
            pageLinkStartRange.startContainer,
            Math.max(0, pageLinkStartRange.startOffset - 2)
        )
    } catch(e) {}
}

function closeTablePageLinkDropdown() {
    pageLinkAnchorRect = null
    pageLinkQuery = ''
    pageLinkStartRange = null
    tableLinkLastKeyWasBracket = false
}

function insertTablePageLink(page) {
    const sel = window.getSelection()
    if (pageLinkStartRange && sel) {
        const endRange = sel.getRangeAt(0).cloneRange()
        const replaceRange = document.createRange()
        replaceRange.setStart(pageLinkStartRange.startContainer, pageLinkStartRange.startOffset)
        replaceRange.setEnd(endRange.startContainer, endRange.startOffset)
        sel.removeAllRanges()
        sel.addRange(replaceRange)
    }
    const insertId = `plm-${Date.now()}`
    document.execCommand('insertHTML', false,
        `<a data-page-id="${page.id}" data-insert-id="${insertId}" class="page-link" href="/page/${page.id}" target="_blank" contenteditable="false">${page.name}</a>`)
    closeTablePageLinkDropdown()
    requestAnimationFrame(() => {
        const link = document.querySelector(`[data-insert-id="${insertId}"]`)
        if (link) {
            link.removeAttribute('data-insert-id')
            const range = document.createRange()
            range.setStartAfter(link)
            range.collapse(true)
            window.getSelection().removeAllRanges()
            window.getSelection().addRange(range)
        }
    })
}

// AI panel state for configuring code editors
let aiOpen = false
let aiInitialContext = ''
let aiCodeContext = { html: '', css: '', js: '', modules: [] }
let aiTarget = null // { type: 'computed'|'total'|'colStyle'|'rowStyle'|'startup'|'customFns', columnIndex?, columnName? }
// Single key to force-refresh all code-mirror editors when external updates occur
let editorKey = 0

// Helpers to provide schema + small sample of rows to the AI
const SAMPLE_ROWS_LIMIT = 3
function stripHtml(v) {
    try {
        return String(v ?? '').replace(/<[^>]*>/g, '')
    } catch {
        return ''
    }
}
function getUniqueColumnValues(columnName) {
    const seen = new Set()
    const out = []
    for (const item of (items || [])) {
        const text = stripHtml(String(item[columnName] ?? '')).trim()
        if (!seen.has(text)) {
            seen.add(text)
            out.push(text)
        }
    }
    out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    return out
}

function openFilterDropdown(event, columnName) {
    event.stopPropagation()
    if (filterDropdown.show && filterDropdown.columnName === columnName) {
        closeFilterDropdown()
        return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    filterDropdown = {
        show: true,
        columnName,
        position: {
            top: rect.bottom + window.scrollY,
            left: rect.left + window.scrollX,
        },
    }
}

function closeFilterDropdown() {
    filterDropdown = { show: false, columnName: null, position: { top: 0, left: 0 } }
}

// Overflow is tied to the current page identity, so any jump back to page 1
// must zero it too. Keep the pair together to prevent future drift.
function resetPagination() {
    overflowCount = 0
    currentPage = 1
    pageScrollPositions.clear()
}

function toggleFilterValue(columnName, value) {
    const current = activeFilters[columnName] ?? new Set()
    const next = new Set(current)
    if (next.has(value)) {
        next.delete(value)
    } else {
        next.add(value)
    }
    activeFilters = { ...activeFilters, [columnName]: next }
    resetPagination()
}

function toggleSelectAll(columnName) {
    const uniqueVals = getUniqueColumnValues(columnName)
    const current = activeFilters[columnName] ?? new Set()
    const allChecked = uniqueVals.every((v) => current.has(v))
    if (allChecked) {
        // all checked → uncheck all (empty Set = no filter)
        activeFilters = { ...activeFilters, [columnName]: new Set() }
    } else {
        // not all checked → check all (full Set)
        activeFilters = { ...activeFilters, [columnName]: new Set(uniqueVals) }
    }
    resetPagination()
}

function clearAllFilters() {
    activeFilters = {}
    resetPagination()
}

function handleWindowClick() {
    if (filterDropdown.show) closeFilterDropdown()
}

function sampleRowsForAI() {
    if (!Array.isArray(items) || items.length === 0) return []
    const n = Math.min(SAMPLE_ROWS_LIMIT, items.length)
    const cols = columns.map((c) => c.name)
    const out = []
    for (let i = 0; i < n; i++) {
        const row = items[i]
        const obj = {}
        for (const k of cols) {
            const text = stripHtml(row?.[k])
            obj[k] = text.length > 120 ? text.slice(0, 117) + '…' : text
        }
        out.push(obj)
    }
    return out
}

function openAIFor(target) {
    aiTarget = target
    // Base guidance for all table config code blocks
    const base = `You are assisting with editing a Journals Table configuration field. Output rules:\n- Reply with a single fenced code block labeled exactly: javascript\n- Provide the FULL replacement for this field. Do not send diffs.\n- Do not include html, css, or modules blocks.\n- Use single quotes for strings.\n- Do not use semicolons.\n- Format code with readable multi-line style and 4-space indentation (no one-liners).\n- Keep any explanation to 1-2 short lines after the code.\n\nData model:\n- Each row is an object keyed by column names (e.g., item['Status'], item['Amount']).\n- Many cell values are strings that may include HTML markup. When comparing text or parsing numbers, derive text via: const text = String(value ?? '').replace(/<[^>]*>/g, '').trim(); const num = parseFloat(text) || 0.`

    let ctx = ''
    let current = ''
    const colList = columns.map((c) => c.name)
    const sample = sampleRowsForAI()
    const schema = `\nSchema:\n- Columns: ${JSON.stringify(colList)}\n- Example rows (sanitized): ${JSON.stringify(sample, null, 2)}`
    if (target.type === 'computed') {
        const col = columns[target.columnIndex]
        ctx =
            `Field: Computed Column Expression\nColumn: ${col.label || col.name} (${col.name})\nRuntime: The code runs as new Function('items','rowIndex','item','columnName', customFunctions + code) and executes per visible cell.\nVariables: items (array of rows), rowIndex (number), item (items[rowIndex]), columnName (string).\nAccessing other columns: use item['Other Column Name'] (sanitized as needed).\nAccessing computed columns: use item['ComputedColName'] — computed columns defined earlier in the column list are available.\nContract: Return the computed display value as a string/number/HTML. Expressions should be read-only. Avoid DOM access.` +
            schema
        current = col.expression || ''
    } else if (target.type === 'total') {
        const col = columns[target.columnIndex]
        ctx =
            `Field: Totals Expression\nColumn: ${col.label || col.name} (${col.name})\nRuntime: The code runs as new Function('items','rowIndex','item','columnName', customFunctions + code) with rowIndex=null and item=null.\nVariables: items (enriched array of rows — each row includes computed column values), columnName (string).\nAccessing columns: iterate items and read row['ColName'] or row['ComputedColName']. Derive text/number as needed.\nNote: item (3rd parameter) is null for totals — access row data by iterating items.\nContract: Return the footer/total content (string/number/HTML). Expressions should be read-only.` +
            schema
        current = totals[col.name] || ''
    } else if (target.type === 'colStyle') {
        const col = columns[target.columnIndex]
        ctx =
            `Field: Column Style\nColumn: ${col.label || col.name} (${col.name})\nRuntime: The code runs as new Function('items','rowIndex','item','columnName', customFunctions + code) per visible cell.\nVariables: items, rowIndex, item (enriched — includes computed column values), columnName.\nCell value is item[columnName]. Access computed columns via item['ComputedColName'].\nContract: Return an inline CSS string (e.g., "color: red; font-weight: bold"). Expressions should be read-only.\nExample: return (String(item?.[columnName] ?? '').replace(/<[^>]*>/g,'').trim().toLowerCase() === 'red') ? 'background-color: red;' : '';` +
            schema
        current = col.style || ''
    } else if (target.type === 'rowStyle') {
        ctx =
            `Field: Row Style\nRuntime: The code runs as new Function('items','rowIndex','item', customFunctions + code) per visible row.\nVariables: items, rowIndex, item (enriched — includes computed column values).\nAccessing columns: use item['Column Name'] or item['ComputedColName'] for any column; derive text/number as needed.\nContract: Return an inline CSS string (e.g., "background: #fee"). Expressions should be read-only.` +
            schema
        current = rowStyle || ''
    } else if (target.type === 'startup') {
        ctx =
            `Field: Startup Script\nRuntime: The code runs once on load as new Function('rows', code).\nVariables: rows (array of row objects) – mutate this array to add/update/remove rows.\nSchema columns available: ${JSON.stringify(colList)}. Example rows are provided below.\nContract: Perform setup logic; do not return a value; avoid external network.` +
            schema
        current = startupScript || ''
    } else if (target.type === 'customFns') {
        ctx =
            `Field: Custom Functions\nRuntime: This code is prepended to all evaluated expressions (computed/totals/styles).\nGuidance: Write small pure helpers that operate on raw values. Callers may pass HTML-containing strings; consider providing helpers like asText(v) and asNumber(v).\nContract: Define pure helper functions only (e.g., function sum(a,b){return a+b}). Do not execute side effects on load.` +
            schema
        current = customFunctions || ''
    }

    aiInitialContext = `${base}\n\n${ctx}`
    aiCodeContext = { html: '', css: '', js: current, modules: [] }
    aiOpen = true
}

function handleAIApply(event) {
    const delta = event.detail || {}
    const js = (delta.js ?? '').toString()
    if (!js.trim() || !aiTarget) return
    if (aiTarget.type === 'computed') {
        const idx = aiTarget.columnIndex
        if (idx != null && columns[idx]) {
            columns[idx].expression = js
            columns = columns // trigger reactivity
            save() // persist
            editorKey++
        }
    } else if (aiTarget.type === 'total') {
        const col = columns[aiTarget.columnIndex]
        if (col) totals[col.name] = js
        totals = totals
        editorKey++
    } else if (aiTarget.type === 'colStyle') {
        const idx = aiTarget.columnIndex
        if (idx != null && columns[idx]) {
            columns[idx].style = js
            columns = columns
            save() // persist
            editorKey++
        }
    } else if (aiTarget.type === 'rowStyle') {
        rowStyle = js
        editorKey++
    } else if (aiTarget.type === 'startup') {
        startupScript = js
        editorKey++
    } else if (aiTarget.type === 'customFns') {
        customFunctions = js
        editorKey++
    }
}

const unsubEventStore = eventStore.subscribe((event) => {
    if (event && event.event === 'configureTable') {
        const scrollContainer = getScrollContainer(editableTable)
        saveScrollState()
        configuration = true
        tick().then(() => {
            if (configuration && scrollContainer) scrollContainer.scrollTop = 0
        })
    }
    if (event && event.event === 'tableConfigureExit') {
        configuration = false
        tick().then(restoreScrollState)
    }
    if (event && event.event === 'tableStatsView') {
        if (event.data.active) {
            saveScrollState()
        }
        statsView = event.data.active
        if (statsView && !(stats.widgets?.length)) {
            statsEditMode = true
            eventStore.set({ event: 'tableStatsEditMode', data: { active: true } })
        }
        if (!event.data.active) {
            tick().then(restoreScrollState)
        }
    }
    if (event && event.event === 'tableStatsEditMode') {
        statsEditMode = event.data.active
    }
})
onDestroy(unsubEventStore)
</script>

<svelte:window on:click={handleWindowClick} />

<div class="pos-r" class:table-configuration={configuration}>
    {#if !loaded}
        <div>Loading…</div>
    {/if}
    {#if !configuration}
        {#if !statsView}
        {#if hasActiveFilters && loaded}
            <div class="filter-clear" on:click={clearAllFilters}>
                ✕ Clear Filters
            </div>
        {/if}
        <div class="table-view">
        <table
            on:paste={handlePaste}
            on:keydown={handleTableHistoryKeydown}
            tabindex="-1"
            class="editable-table {note && note.trim() ? 'has-note' : ''}"
            bind:this={editableTable}
            {style}
        >
            <thead>
                <tr>
                    {#each columns as column}
                        <th
                            style={column.wrap === 'No'
                                ? 'white-space: nowrap;'
                                : ''}
                        >
                            <span class="col-label">{column.label}<span class="v-h"
                                >{column.label === '' ? column.name : ''}</span
                            ></span>
                            {#if column.filterable === 'Yes'}
                                <button
                                    aria-label="Filter {column.label || column.name}"
                                    class="filter-btn {activeFilters[column.name]?.size > 0 ? 'filter-btn--active' : ''}"
                                    type="button"
                                    on:click={(e) => openFilterDropdown(e, column.name)}
                                >{activeFilters[column.name]?.size > 0 ? '▽' : '▼'}</button>
                            {/if}
                        </th>
                    {/each}
                </tr>
            </thead>
            <tbody>
                {#each visibleItems as item (item)}
                    {@const rowIdx = itemIndexes.get(item)}
                    {@const rowStyleStr = computeRowStyle(rowIdx)}
                    <tr>
                        {#each columns as column, columnIndex (column.name)}
                            <td
                                class:wrapped={column.wrap !== 'No'}
                                style="min-width: {widths[
                                    column.name
                                ]}; max-width: {widths[
                                    column.name
                                ]}; {column.wrap === 'No'
                                    ? 'white-space: nowrap;'
                                    : 'word-break: break-word;'} {column.align
                                    ? `text-align: ${column.align};`
                                    : 'text-align: left;'} {rowStyleStr}; {computeColumnStyle(
                                    rowIdx,
                                    columnIndex,
                                    column.name,
                                )}"
                            >
                                {#if loaded && pageContentOverride === undefined && viewOnly === false && column.type !== 'Computed'}
                                    {#if column.type === '' || column.type === undefined}
                                        <div
                                            contenteditable
                                            spellcheck="false"
                                            use:tableCellEditor={{ row: item, columnName: column.name }}
                                            on:keydown={(e) =>
                                                handleKeysInTD(
                                                    e,
                                                    rowIdx,
                                                    column.name,
                                                )}
                                            on:blur={handleBlur}
                                        ></div>
                                    {:else}
                                        <div
                                            contenteditable="plaintext-only"
                                            spellcheck="false"
                                            use:tableCellEditor={{ row: item, columnName: column.name }}
                                            on:keydown={(e) =>
                                                handleKeysInTD(
                                                    e,
                                                    rowIdx,
                                                    column.name,
                                                )}
                                            on:blur={handleBlur}
                                        ></div>
                                    {/if}
                                {:else if column.type === 'Computed'}
                                    <div>
                                        {@html engine.getComputedValue(rowIdx, column.name)}
                                    </div>
                                {:else}
                                    <div>
                                        {@html getColumnValue(
                                            column.type,
                                            item[column.name],
                                        ) ||
                                            '<span style="visibility: hidden">cat</span>'}
                                    </div>
                                {/if}
                            </td>
                        {/each}
                        {#if pageContentOverride === undefined && viewOnly === false && !hasActiveFilters}
                            <td class="table-actions">
                                <button
                                    aria-label="Insert row below"
                                    on:click={() =>
                                        insertRow(
                                            rowIdx,
                                            false,
                                        )}>↓</button
                                >
                                <button
                                    aria-label="Insert row above"
                                    on:click={() =>
                                        insertRow(
                                            rowIdx,
                                            true,
                                        )}>↑</button
                                >
                                <button
                                    aria-label="Delete row"
                                    on:click={async () => {
                                        if (
                                            !(await showConfirm(
                                                'Are you sure you want to delete this row?',
                                                { confirmLabel: 'Delete', danger: true },
                                            ))
                                        ) {
                                            return
                                        }
                                        deleteRow(
                                            rowIdx,
                                        )
                                    }}>x</button
                                >
                            </td>
                        {/if}
                    </tr>
                {/each}
            </tbody>
            {#if Object.keys(totals).length > 0}
                {@const enrichedItems = engine.getEnrichedItems()}
                <tr>
                    {#each columns as column}
                        {#if totals.hasOwnProperty(column.name)}
                            <th
                                style={column.wrap === 'No'
                                    ? 'white-space: nowrap;'
                                    : ''}
                                >{@html evalulateJS(
                                    'Totals',
                                    totals[column.name],
                                    null,
                                    column.name,
                                    null,
                                    enrichedItems,
                                )}</th
                            >
                        {:else}
                            <th></th>
                        {/if}
                    {/each}
                </tr>
            {/if}
        </table>
        {#if showPagination}
            <div class="pager">
                <button
                    on:click={() => goToPage(1)}
                    disabled={currentPage === 1}>⏮︎</button
                >
                <button
                    on:click={() => goToPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}>◀︎</button
                >
                <span>Page {currentPage} / {totalPages}</span>
                <input
                    class="pager-jump"
                    type="number"
                    min="1"
                    max={totalPages}
                    placeholder="Go to…"
                    bind:value={gotoPageInput}
                    on:keydown={(e) => {
                        if (e.key === 'Enter') {
                            gotoPage(gotoPageInput)
                        }
                    }}
                    on:blur={() => {
                        if (
                            gotoPageInput !== '' &&
                            gotoPageInput !== null &&
                            gotoPageInput !== undefined
                        )
                            gotoPage(gotoPageInput)
                    }}
                />
                <button
                    on:click={() => gotoPage(gotoPageInput)}
                    disabled={totalPages <= 1}>Go</button
                >
                <button
                    on:click={() =>
                        goToPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}>▶︎</button
                >
                <button
                    on:click={() => goToPage(totalPages)}
                    disabled={currentPage === totalPages}>⏭︎</button
                >
            </div>
        {/if}
        {#if note && note.trim()}
            <div class="table-note" style="margin-top: 1em;">
                {@html note}
            </div>
        {/if}
        </div>
        {:else}
            <TableStats
                {engine}
                widgets={stats.widgets}
                editMode={statsEditMode}
                on:update-widgets={(e) => {
                    stats = { ...stats, widgets: e.detail }
                    queueSavePageContent()
                }}
            />
        {/if}
    {:else}
        <div class="config-toolbar">
            <div class="config-heading">Columns</div>
            <div class="config-holder">
                <button type="button" on:click={copyConfiguration}>
                    Copy Configuration
                </button>
                <button type="button" on:click={pasteConfiguration}>
                    Paste Configuration
                </button>
            </div>
        </div>
        <form on:submit|preventDefault={addColumn}>
            <table class="config-table" role="table" aria-label="Column configuration">
                <thead>
                    <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Label</th>
                        <th scope="col">Wrap</th>
                        <th scope="col">Align</th>
                        <th scope="col">Type</th>
                        <th scope="col">Autocomplete</th>
                        <th scope="col">Filter</th>
                    </tr>
                </thead>
                <tbody>
                    {#each columns as column, index}
                        {#if columnToEditReference && columnToEditReference.name === column.name}
                            <tr>
                                <td data-label="Name">
                                    <input class="input" type="text" aria-label="Name" bind:value={columnToEditCopy.name} use:focus />
                                </td>
                                <td data-label="Label">
                                    <input class="input" type="text" aria-label="Label" bind:value={columnToEditCopy.label} />
                                </td>
                                <td data-label="Wrap">
                                    <select class="input" aria-label="Wrap" bind:value={columnToEditCopy.wrap}>
                                        <option value="">Yes</option>
                                        <option>No</option>
                                    </select>
                                </td>
                                <td data-label="Align">
                                    <select class="input" aria-label="Align" bind:value={columnToEditCopy.align}>
                                        <option value="">Left</option>
                                        <option>Center</option>
                                        <option>Right</option>
                                    </select>
                                </td>
                                <td data-label="Type">
                                    <select class="input" aria-label="Type" bind:value={columnToEditCopy.type}>
                                        <option value="">Input</option>
                                        <option>Input (Plain Text)</option>
                                        <option>Computed</option>
                                    </select>
                                </td>
                                <td data-label="Autocomplete">
                                    <select class="input" aria-label="Autocomplete" bind:value={columnToEditCopy.autocomplete}>
                                        <option value="">No</option>
                                        <option>Yes</option>
                                    </select>
                                </td>
                                <td data-label="Filter">
                                    <select class="input" aria-label="Filter" bind:value={columnToEditCopy.filterable}>
                                        <option value="">No</option>
                                        <option>Yes</option>
                                    </select>
                                </td>
                                <td>
                                    <button class="btn-sm" type="button" on:click={updateColumn}>Update</button>
                                </td>
                                <td>
                                    <button class="btn-sm" type="button" on:click={cancelEditColumn}>Cancel</button>
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td data-label="Name"><span>{column.name}</span></td>
                                <td data-label="Label"><span>{column.label}</span></td>
                                <td data-label="Wrap"><span>{column.wrap || 'Yes'}</span></td>
                                <td data-label="Align"><span>{column.align || 'Left'}</span></td>
                                <td data-label="Type"><span>{column.type || 'Input'}</span></td>
                                <td data-label="Autocomplete"><span>{column.autocomplete || 'No'}</span></td>
                                <td data-label="Filter"><span>{column.filterable || 'No'}</span></td>
                                <td>
                                    <button class="btn-sm" type="button" on:click={() => moveUp(index)}>Move Up</button>
                                </td>
                                <td>
                                    <button class="btn-sm" type="button" on:click={() => moveDown(index)}>Move Down</button>
                                </td>
                                <td>
                                    <button class="btn-sm" type="button" on:click={() => startEditColumn(column)}>Edit</button>
                                </td>
                                <td>
                                    <button class="btn-sm" type="button" on:click={() => deleteColumn(column.name)}>Delete</button>
                                </td>
                            </tr>
                        {/if}
                    {/each}
                    {#if showAddColumn}
                        <tr>
                            <td data-label="Name">
                                <input class="input" type="text" aria-label="Name" bind:value={column.name} required use:focus />
                            </td>
                            <td data-label="Label">
                                <input class="input" type="text" aria-label="Label" bind:value={column.label} placeholder="Keep blank to be = name" />
                            </td>
                            <td data-label="Wrap">
                                <select class="input" aria-label="Wrap" bind:value={column.wrap}>
                                    <option value="">Yes</option>
                                    <option>No</option>
                                </select>
                            </td>
                            <td data-label="Align">
                                <select class="input" aria-label="Align" bind:value={column.align}>
                                    <option value="">Left</option>
                                    <option>Center</option>
                                    <option>Right</option>
                                </select>
                            </td>
                            <td data-label="Type">
                                <select class="input" aria-label="Type" bind:value={column.type}>
                                    <option value="">Input</option>
                                    <option>Input (Plain Text)</option>
                                    <option>Computed</option>
                                </select>
                            </td>
                            <td data-label="Autocomplete">
                                <select class="input" aria-label="Autocomplete" bind:value={column.autocomplete}>
                                    <option value="">No</option>
                                    <option>Yes</option>
                                </select>
                            </td>
                            <td data-label="Filter">
                                <select class="input" aria-label="Filter" bind:value={column.filterable}>
                                    <option value="">No</option>
                                    <option>Yes</option>
                                </select>
                            </td>
                            <td>
                                <button class="btn-sm">Add</button>
                            </td>
                            <td>
                                <button class="btn-sm" type="button" on:click={() => (showAddColumn = false)}>Cancel</button>
                            </td>
                        </tr>
                    {/if}
                </tbody>
            </table>
        </form>
        {#if !showAddColumn}
            <button class="btn-sm mt-1em" on:click={() => (showAddColumn = true)}
                >Add Column</button
            >
        {/if}

        {#if columns.filter((column) => column.type === 'Computed').length > 0}
            <div class="config-heading mt-1em">Computed Columns</div>
            <div class="config-area-font-size">
                {#each columns.filter((column) => column.type === 'Computed') as column}
                    <div class="editor-row">
                        <span>{column.label ? column.label : column.name}</span
                        ><button
                            class="btn-sm"
                            type="button"
                            on:click={() =>
                                openAIFor({
                                    type: 'computed',
                                    columnIndex: columns.findIndex(
                                        (c) => c.name === column.name,
                                    ),
                                })}>Ask AI</button
                        >
                    </div>
                    <div>
                        {#key editorKey + 'computed:' + column.name}
                            <code-mirror
                                value={column.expression}
                                on:input={(e) => {
                                    column.expression = e.target.value
                                    save()
                                }}
                                style="border: 1px solid darkgray"
                            ></code-mirror>
                        {/key}
                    </div>
                {/each}
            </div>
            <div class="config-area-note">
                Available variables: <code>items</code>, <code>rowIndex</code> &
                <code>item</code>
            </div>
        {/if}

        <div class="config-heading mt-1em">Totals</div>
        <div class="config-area-font-size">
            {#each columns as column}
                <div class="editor-row">
                    <span>{column.label ? column.label : column.name}</span
                    ><button
                        class="btn-sm"
                        type="button"
                        on:click={() =>
                            openAIFor({
                                type: 'total',
                                columnIndex: columns.findIndex(
                                    (c) => c.name === column.name,
                                ),
                            })}>Ask AI</button
                    >
                </div>
                <div>
                    {#key editorKey + 'total:' + column.name}
                        <code-mirror
                            value={totals[column.name]
                                ? totals[column.name]
                                : ''}
                            on:input={(e) =>
                                (totals[column.name] = e.target.value)}
                            style="border: 1px solid darkgray"
                        >
                        </code-mirror>
                    {/key}
                </div>
            {/each}
        </div>
        <div class="config-area-note">
            Available variables: <code>items</code> & <code>columnName</code>
        </div>

        <div class="config-heading mt-1em">Column Widths</div>
        <div class="config-area-font-size">
            {#each columns as column}
                <div>{column.label ? column.label : column.name}</div>
                <div>
                    <input
                        class="input"
                        type="text"
                        value={widths[column.name] ? widths[column.name] : ''}
                        on:input={(e) => (widths[column.name] = e.target.value)}
                    />
                </div>
            {/each}
        </div>

        <div class="config-heading mt-1em">Column Styles</div>
        <div class="config-area-font-size">
            {#each columns as column}
                <div class="editor-row">
                    <span>{column.label ? column.label : column.name}</span
                    ><button
                        class="btn-sm"
                        type="button"
                        on:click={() =>
                            openAIFor({
                                type: 'colStyle',
                                columnIndex: columns.findIndex(
                                    (c) => c.name === column.name,
                                ),
                            })}>Ask AI</button
                    >
                </div>
                <div>
                    {#key editorKey + 'colStyle:' + column.name}
                        <code-mirror
                            value={column.style}
                            on:input={(e) => {
                                column.style = e.target.value
                                save()
                            }}
                            style="border: 1px solid darkgray"
                        >
                        </code-mirror>
                    {/key}
                </div>
            {/each}
        </div>
        <div class="config-area-note">
            Available variables: <code>items</code>, <code>rowIndex</code>,
            <code>item</code>
            & <code>columnName</code><br />
            You can add conditions and return a style like:<br />
            <code
                >return items[rowIndex][columnName] === 'foo' ? 'color: red' :
                ''</code
            >
        </div>

        <div class="config-heading mt-1em editor-row">
            <span>Row Style</span><button
                class="btn-sm"
                type="button"
                on:click={() => openAIFor({ type: 'rowStyle' })}>Ask AI</button
            >
        </div>
        <div class="config-area-font-size">
            <div>
                {#key editorKey + ':rowStyle'}
                    <code-mirror
                        value={rowStyle}
                        on:input={(e) => (rowStyle = e.target.value)}
                        style="border: 1px solid darkgray"
                    ></code-mirror>
                {/key}
            </div>
        </div>
        <div class="config-area-note">
            Available variables: <code>items</code>, <code>rowIndex</code> &
            <code>item</code><br />
            You can add conditions and return a style like:<br />
            <code
                >return items[rowIndex]['My Column Name'] === 'foo' ? 'color:
                red' : ''</code
            >
        </div>

        <div class="config-heading mt-1em editor-row">
            <span>Startup Script</span><button
                class="btn-sm"
                type="button"
                on:click={() => openAIFor({ type: 'startup' })}>Ask AI</button
            >
        </div>
        <div class="config-area-font-size">
            <div>
                {#key editorKey + ':startup'}
                    <code-mirror
                        value={startupScript}
                        on:input={(e) => (startupScript = e.target.value)}
                        style="border: 1px solid darkgray"
                    ></code-mirror>
                {/key}
            </div>
        </div>
        <div class="config-area-note">
            Available variables: <code>rows</code><br />
            <details>
                <summary style="cursor: pointer; user-select: none;"
                    >Click here to see example code on how to modify the rows in
                    the table on startup</summary
                >
                <code style="white-space: pre-wrap;"
                    >{@html `// Modify all rows
rows.forEach(row => {
    row['Column 1'] = row['Column 1'] + 'foo'
})

// add a new row at the end
rows.push({
    'Column 1' : 'Hi'
})

// add a new row at any index
const insertAtIndex = 1
rows.splice(insertAtIndex, 0, { 'Column 1': 'Inserted at index 1' })`}</code
                >
            </details>
        </div>

        <div class="config-heading mt-1em editor-row">
            <span>Custom Functions</span><button
                class="btn-sm"
                type="button"
                on:click={() => openAIFor({ type: 'customFns' })}>Ask AI</button
            >
        </div>
        <div class="config-area-font-size">
            <div>
                {#key editorKey + ':customFns'}
                    <code-mirror
                        value={customFunctions}
                        on:input={(e) => (customFunctions = e.target.value)}
                        style="border: 1px solid darkgray"
                    ></code-mirror>
                {/key}
            </div>
        </div>
        <div class="config-area-note">
            Define custom functions here that can be used in any evaluated JS
            code.
        </div>

        <div class="config-heading mt-1em">Note</div>
        <div class="config-area-font-size">
            <div
                contenteditable
                bind:innerHTML={note}
                bind:this={noteContainer}
                on:input={() => (note = note)}
                on:keydown={handleKeysInNote}
                on:paste={handleNotePaste}
                spellcheck="false"
                style="border: 1px solid darkgray; padding: 5px; min-height: 100px; outline: none;"
            ></div>
        </div>
        <div class="config-area-note">
            Add an HTML note that will be displayed below the table.
        </div>

        <div style="margin-bottom: 3rem"></div>
    {/if}
</div>

{#if filterDropdown.show}
    {@const colName = filterDropdown.columnName}
    {@const uniqueVals = getUniqueColumnValues(colName)}
    {@const allowed = activeFilters[colName] ?? new Set()}
    {@const allChecked = uniqueVals.every((v) => allowed.has(v))}
    <div
        class="filter-dropdown"
        style="top: {filterDropdown.position.top}px; left: {filterDropdown.position.left}px;"
        on:click|stopPropagation
    >
        <div class="filter-list">
            <label class="filter-item filter-select-all">
                <input
                    type="checkbox"
                    checked={allChecked}
                    on:change={() => toggleSelectAll(colName)}
                />
                <span>(Select All)</span>
            </label>
            {#each uniqueVals as val}
                <label class="filter-item">
                    <input
                        type="checkbox"
                        checked={allowed.has(val)}
                        on:change={() => toggleFilterValue(colName, val)}
                    />
                    <span>{val === '' ? '(Blank)' : val}</span>
                </label>
            {/each}
        </div>
    </div>
{/if}

{#if showInsertFileModal}
    <InsertFileModal
        bind:pageId
        bind:savedCursorPosition
        bind:contentEditableDivToFocus={currentTd}
        bind:insertFileModalLinkLabel
        bind:showInsertFileModal
    ></InsertFileModal>
{/if}

<Autocomplete
    bind:show={autocompleteData.show}
    suggestions={autocompleteData.suggestions}
    position={autocompleteData.position}
    on:select={handleSelectSuggestion}
/>

<AIChatPanel
    open={aiOpen}
    on:close={() => (aiOpen = false)}
    initialContext={aiInitialContext}
    codeContext={aiCodeContext}
    on:apply={handleAIApply}
    includeContext={true}
/>

<PageLinkDropdown
    bind:this={pageLinkDropdown}
    query={pageLinkQuery}
    anchorRect={pageLinkAnchorRect}
    on:select={(e) => insertTablePageLink(e.detail)}
    on:close={closeTablePageLinkDropdown}
/>

<style>
.pos-r {
    position: relative;
}

.config-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-bottom: 0.75rem;
}

.config-toolbar .config-heading {
    margin: 0;
}

.config-holder {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.config-holder > button {
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    color: var(--color-pa-btn);
    background: transparent;
    border: 1px solid var(--border-select);
    border-radius: 0.3rem;
    padding: calc(0.3em - 1px) 0.8em;
}

.config-holder > button:hover {
    background: var(--bg-pa-hover);
}

.config-heading {
    font-size: 18px;
    font-weight: bold;
    margin-bottom: 0.5em;
}

.editor-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

table.config-table > tbody td {
    padding: 2px 5px;
}

table.config-table > tbody td > input {
    font: inherit;
}

.config-area-font-size,
table.config-table {
    font-size: 16px;
}

.config-area-font-size input {
    font: inherit;
}

table {
    border-collapse: collapse;
}

table th,
table td {
    border: 1px solid var(--border-table);
    min-width: 3em;
    padding: 2px 5px;
}

table > tbody td {
    padding: 0;
    vertical-align: top;
}

table > tbody td > div {
    padding: 2px 5px;
}

table td > div[contenteditable] {
    outline: 0;
}

.v-h {
    visibility: hidden;
}

.editable-table {
    margin-bottom: 7.4em;
}

.editable-table.has-note {
    margin-bottom: 0;
}

.table-note {
    margin-bottom: 7.4em;
}

.pager {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: 0.5em;
    justify-content: flex-end;
    align-items: center;
    padding: 0.5em 0;
    background: var(--bg-center);
}

.pager > button {
    border: 1px solid var(--border-table);
    background: transparent;
    padding: 2px 6px;
}

.pager-jump {
    width: 6ch;
    padding: 2px 4px;
    border: 1px solid var(--border-table);
    font: inherit;
}

@media (max-width: 768px) {
    .table-configuration {
        width: 100%;
        min-width: 0;
        overflow-wrap: anywhere;
    }

    .config-holder {
        width: 100%;
    }

    .config-holder > button {
        flex: 1 1 9rem;
        min-height: 2.75rem;
        font-size: inherit;
        padding: 0.5rem 0.75rem;
    }

    table.config-table,
    table.config-table > tbody {
        display: block;
        width: 100%;
    }

    /* Keep table headers available to assistive technology when rows become cards. */
    table.config-table > thead {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
    }

    table.config-table > tbody > tr {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.5rem;
        padding: 0.75rem;
        border: 1px solid var(--border-table);
        border-radius: 0.4rem;
    }

    table.config-table > tbody > tr + tr {
        margin-top: 0.75rem;
    }

    table.config-table > tbody td {
        min-width: 0;
        padding: 0;
        border: 0;
    }

    table.config-table td[data-label] {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
        align-items: center;
        gap: 0.5rem;
        min-height: 2rem;
    }

    table.config-table td[data-label]::before {
        content: attr(data-label);
        color: var(--color-utility);
        font-size: 0.875rem;
    }

    table.config-table td > input,
    table.config-table td > select,
    table.config-table td > button {
        width: 100%;
        min-width: 0;
        min-height: 2.75rem;
        box-sizing: border-box;
    }

    .config-area-font-size,
    .config-area-font-size input,
    .config-area-note code,
    .table-configuration code-mirror {
        min-width: 0;
        max-width: 100%;
        box-sizing: border-box;
    }

    .table-configuration code-mirror {
        display: block;
        width: 100%;
    }

    .editor-row {
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .editor-row > span {
        flex: 1 1 8rem;
        min-width: 0;
    }

    .table-view {
        min-width: 100%;
        width: max-content;
    }

    /* Use the page's scroll container for both axes and sticky headers.
     * Keep wide tables from squeezing wrapped columns into tall, narrow rows. */
    .editable-table {
        width: max-content;
    }

    .editable-table td.wrapped {
        max-width: min(24rem, calc(100vw - 3rem));
    }

    .pager {
        left: 0;
        flex-wrap: wrap;
    }

    .pager,
    .table-note {
        width: calc(100vw - 3rem);
    }

    .pos-r > .filter-clear {
        position: static;
        padding: 0.5em 0;
    }

    .pager > button {
        min-width: 36px;
        min-height: 36px;
        padding: 4px 10px;
        font-size: 16px;
    }

    .pager-jump {
        font-size: 16px;
        min-height: 36px;
        padding: 4px 8px;
        width: 8ch;
    }

    td.table-actions button {
        min-width: 36px;
        min-height: 36px;
        font-size: 16px;
        padding: 4px 8px;
    }
}

.config-area-note {
    margin-top: 0.5em;
}

.config-area-note code {
    border: 1px solid lightgrey;
    padding: 2px;
    display: inline-block;
}

td.table-actions {
    border: 0;
    padding-left: 1rem;
    white-space: nowrap;
}

td.table-actions button {
    border: 1px solid var(--border-table);
    background: transparent;
    color: var(--color-utility);
}

:global(.editable-table) > thead th {
    position: sticky;
    top: 0;
    background-color: var(--bg-center);
    z-index: 1;
}

:global(.editable-table) > tbody:nth-of-type(1) tr:nth-of-type(1) td {
    border-top: none !important;
}

:global(.editable-table) > thead th {
    border-top: none !important;
    border-bottom: none !important;
    box-shadow:
        inset 0 1px 0 var(--border-table),
        inset 0 -1px 0 var(--border-table);
}

/* ── Column header filter button ── */
.col-label {
    margin-right: 2px;
}

.filter-btn {
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 0.65em;
    padding: 0 1px;
    vertical-align: middle;
    opacity: 0.45;
    line-height: 1;
}

.filter-btn:hover,
.filter-btn--active {
    opacity: 1;
}

.filter-btn--active {
    color: var(--color-pa-btn);
}

/* ── Filter dropdown panel ── */
.filter-dropdown {
    position: absolute;
    z-index: 9999;
    background: var(--bg-topbar);
    border: 1px solid var(--border-table);
    box-shadow: 0 4px 12px rgba(0,0,0,0.18);
    min-width: 160px;
    max-width: 280px;
    padding: 4px;
    font-size: 14px;
}

.filter-list {
    max-height: 240px;
    overflow-y: auto;
}

.filter-item {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 2px 3px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
}

.filter-item:hover {
    background: var(--bg-pa-hover);
}

.filter-select-all {
    font-weight: 600;
    border-bottom: 1px solid var(--border-topbar);
    margin-bottom: 2px;
    padding-bottom: 3px;
}

/* ── Clear filters button ── */
.filter-clear {
    position: absolute;
    right: 130px;
    top: 0;
    cursor: pointer;
    color: #c00;
    font-size: 0.85em;
}
</style>
