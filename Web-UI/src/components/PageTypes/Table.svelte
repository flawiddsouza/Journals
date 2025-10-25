<script>
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
let showInsertFileModal = false
let insertFileModalLinkLabel = ''
let currentTd = null
let noteContainer = null
let savedCursorPosition = null
// Styles and computed columns are calculated on the fly per visible cell to reduce state bookkeeping

// Minimal pagination (show last 500 rows by default when large)
const PAGE_SIZE = 500
let currentPage = 1
let totalPages = 1
let showPagination = false
let visibleStartIndex = 0
let visibleItems = []
let gotoPageInput = ''

let autocompleteData = {
    show: false,
    suggestions: [],
    position: { top: 0, left: 0 },
    itemIndex: null,
    columnName: null,
}

function computeRowStyle(rowIndex) {
    if (!rowStyle) return ''
    return evalulateJS('Row Style', rowStyle, rowIndex)
}

function computeColumnStyle(rowIndex, columnIndex, columnName) {
    if (!columns[columnIndex].style) return ''
    return evalulateJS(
        'Column Style',
        columns[columnIndex].style,
        rowIndex,
        columnName,
    )
}

function computeComputedColumn(rowIndex, columnIndex) {
    const column = columns[columnIndex]
    if (!column.expression) return ''
    return evalulateJS(
        'Computed Column',
        column.expression,
        rowIndex,
        column.name,
    )
}

$: if (pageContentOverride) {
    let parsedPage = JSON.parse(pageContentOverride)
    loaded = false
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

let editableTable = null

function fetchPage(pageId) {
    if (pageId === null) {
        return
    }
    loaded = false
    // reset variables on page change
    configuration = false
    showAddColumn = false
    cancelEditColumn()
    undoStackForRemoveRow = [] // reset undo stack
    // end of reset variables on page change
    fetchPlus.get(`/pages/content/${pageId}`).then((response) => {
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
            focusLastEditableCell()
            loaded = true
        }, 0)

        // External content change -> refresh editors
        editorKey++
    })
}

import debounce from '../../helpers/debounce.js'

const savePageContent = debounce(function () {
    if (pageId === null) {
        return
    }
    fetchPlus.put(`/pages/${pageId}`, {
        pageContent: JSON.stringify({
            columns,
            items,
            totals,
            widths,
            rowStyle,
            startupScript,
            customFunctions,
            note,
        }),
    })
}, 500)

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
        savePageContent()
    }

    dontTriggerSave = false
}

// Reactive pagination derivations
$: totalPages = Math.max(1, Math.ceil((items?.length || 0) / PAGE_SIZE))
$: showPagination = (items?.length || 0) > PAGE_SIZE

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
    ? (items || []).slice(visibleStartIndex, visibleStartIndex + PAGE_SIZE)
    : items || []

function evalulateStartupScript(jsString, dynamicVariables) {
    try {
        const functionParameters = Object.keys(dynamicVariables).join(',')
        const functionArguments = Object.values(dynamicVariables)
        return new Function(functionParameters, jsString).apply(
            this,
            functionArguments,
        )
    } catch (e) {
        alert('error evaluating startup script')
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

function goToPage(n) {
    const clamped = Math.min(totalPages, Math.max(1, n))
    if (clamped !== currentPage) {
        currentPage = clamped
        // Scroll table top into view without smooth behavior to avoid lag
        scrollTableTop()
    }
}

function focusLastEditableCell() {
    if (!editableTable) return
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

function evalulateJS(source, jsString, rowIndex = null, columnName = null) {
    // Track evaluation stats instead of logging each call
    if (source.includes('Row Style')) {
        evalStats.rowStyle++
    } else if (source.includes('Column Style')) {
        evalStats.columnStyle++
    } else if (source.includes('Computed Column')) {
        evalStats.computedColumn++
    }
    evalStats.total++

    // Debounce consolidated log (only log once after evaluations settle)
    clearTimeout(evalStatsTimer)
    evalStatsTimer = setTimeout(() => {
        if (evalStats.total > 0) {
            console.log('Evaluated expressions:', {
                'Row Styles': evalStats.rowStyle,
                'Column Styles': evalStats.columnStyle,
                'Computed Columns': evalStats.computedColumn,
                'Total': evalStats.total
            })
            evalStats = { rowStyle: 0, columnStyle: 0, computedColumn: 0, total: 0 }
        }
    }, 100)

    try {
        const customFunctionsCode = customFunctions
            ? customFunctions + '\n'
            : ''
        return new Function(
            'items',
            'rowIndex',
            'item',
            'columnName',
            customFunctionsCode + jsString,
        ).call(
            this,
            items,
            rowIndex,
            rowIndex !== null ? items[rowIndex] : null,
            columnName,
        )
    } catch (e) {
        console.error(`${source}:`, e)
        return 'error evaluating given expression'
    }
}

let undoStackForRemoveRow = []

// Consolidated logging for evalulateJS calls
let evalStats = { rowStyle: 0, columnStyle: 0, computedColumn: 0, total: 0 }
let evalStatsTimer = null

import defaultKeydownHandlerForContentEditableArea from '../../helpers/defaultKeydownHandlerForContentEditableArea.js'

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

function insertRow(rowIndex, insertAbove) {
    let insertObj = {}
    columns.forEach((column) => {
        insertObj[column.name] = ''
    })

    if (!insertAbove) {
        items.splice(rowIndex + 1, 0, insertObj)
    } else {
        // insert row above if ctrl + shift + enter
        items.splice(rowIndex, 0, insertObj)
    }
    items = items

    // styles and computed columns are now computed on the fly

    // move focus to the first focusable cell of the inserted row, if shift key is not pressed
    if (!insertAbove) {
        setTimeout(() => {
            // convert global index to local visible index since we render a slice
            const localIndex = rowIndex - visibleStartIndex
            let rows =
                document
                    .querySelector('.editable-table tbody')
                    ?.querySelectorAll('tr') || []
            let bottomRow = rows[localIndex + 1]
            if (typeof bottomRow !== 'undefined') {
                let bottomCell = bottomRow.querySelector('div[contenteditable]')
                bottomCell.focus()
            }
        }, 0)
    }
}

function deleteRow(rowIndex) {
    if (items.length === 1) {
        undoStackForRemoveRow.push({
            index: 0,
            item: JSON.parse(JSON.stringify(items[0])),
        }) // save undo

        columns.forEach((column) => {
            items[0][column.name] = ''
        })

        // styles and computed columns are now computed on the fly
        // styles and computed columns are now computed on the fly
    }

    undoStackForRemoveRow.push({ index: rowIndex, item: items[rowIndex] }) // save undo

    items.splice(rowIndex, 1)
    items = items

    // move focus to the first focusable cell of the row before the removed row
    let tbody = document.querySelector('.editable-table tbody')
    if (!tbody) {
        return
    }
    let rows = tbody.querySelectorAll('tr')
    // convert global index to local visible index
    const localIndex = rowIndex - visibleStartIndex
    let bottomRow = rows[localIndex - 1]
    if (typeof bottomRow !== 'undefined') {
        let bottomCell = bottomRow.querySelector('div[contenteditable]')
        bottomCell.focus()
    }

    // styles and computed columns are now computed on the fly
}

function handleKeysInTD(e, itemIndex, itemColumn) {
    defaultKeydownHandlerForContentEditableArea(e)
    saveCursorPosition()

    // insert row
    if (e.ctrlKey && e.key === 'Enter') {
        if (e.shiftKey) {
            insertRow(itemIndex, true)
        } else {
            insertRow(itemIndex, false)
        }
    }

    // remove current row
    if (e.ctrlKey && e.key.toLowerCase() === 'delete') {
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
}

function handleBlur(event) {
    // Check if the new focus is within the suggestions list
    setTimeout(() => {
        const activeElement = document.activeElement
        if (activeElement && activeElement.closest('.suggestions')) {
            return
        }
        autocompleteData.show = false
    }, 0)

    normalizeEditableDiv(event.target)
}

// Normalize a contenteditable div on blur: remove stray <br>
function normalizeEditableDiv(el) {
    const text = el.textContent
    if (text === '' && el.innerHTML !== '') {
        el.innerHTML = ''
        const inputEvent = new Event('input')
        el.dispatchEvent(inputEvent)
    }
}

function handleUndoStacks(e) {
    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        if (undoStackForRemoveRow.length > 0) {
            e.preventDefault()
            let undo = undoStackForRemoveRow.pop()
            if (items.length === 1) {
                let emptyKeysCount = 0
                let keys = Object.keys(items[0])
                let keysCount = keys.length
                keys.forEach((itemKey) => {
                    if (items[0][itemKey] === '') {
                        emptyKeysCount++
                    }
                })
                if (emptyKeysCount === keysCount) {
                    items.splice(undo.index, 1, undo.item)
                } else {
                    items.splice(undo.index, 0, undo.item)
                }
            } else if (items.length > 1) {
                items.splice(undo.index, 0, undo.item)
            }
            items = items
        }
    }
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
}

$: if (showAddColumn) {
    column = {
        name: '',
        label: '',
        wrap: '',
        align: '',
        type: '',
        autocomplete: '',
    }
    cancelEditColumn()
}

function addColumn() {
    let existingColumnNames = columns.map((column) => column.name)
    if (existingColumnNames.includes(column.name)) {
        alert("You can't use an existing column name")
        return
    }

    if (column.label === '') {
        column.label = column.name
    }

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
        alert("Column name can't be be empty")
        return
    }
    let existingColumnNames = columns
        .map((column) => column.name)
        .filter((columnName) => columnName != columnToEditReference.name)
    if (existingColumnNames.includes(columnToEditCopy.name)) {
        alert("You can't use an existing column name")
        return
    }
    if (columnToEditReference.name !== columnToEditCopy.name) {
        // column name changed, rename column name in items
        items.forEach((item) => {
            item[columnToEditCopy.name] = item[columnToEditReference.name]
            delete item[columnToEditReference.name]
        })
    }
    columnToEditReference.name = columnToEditCopy.name
    columnToEditReference.label = columnToEditCopy.label
    columnToEditReference.wrap = columnToEditCopy.wrap
    columnToEditReference.align = columnToEditCopy.align
    columnToEditReference.type = columnToEditCopy.type
    columnToEditReference.autocomplete = columnToEditCopy.autocomplete
    items = items // save
    columnToEditCopy = null
    columnToEditReference = null
}

function deleteColumn(columnName) {
    if (
        confirm(
            'Deleting a column, will also delete all the items under it. Are you sure you want to delete this column?',
        )
    ) {
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
    savedCursorPosition = window.getSelection().getRangeAt(0)
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

        fetch(`${baseURL}/upload-image/${pageId}`, {
            method: 'POST',
            body: data,
            headers: { Token: localStorage.getItem('token') },
            credentials: 'include',
        })
            .then((response) => response.json())
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
            if (
                confirm(
                    `Do you want to convert ${links.length} links to clickable links?`,
                )
            ) {
                event.preventDefault()

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
            }
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
        alert('Configuration copied to clipboard')
    })
}

async function pasteConfiguration() {
    const clipboardText = await navigator.clipboard.readText()
    if (
        !confirm(
            'Are you sure you want to paste configuration? This will overwrite the current configuration.',
        )
    ) {
        return
    }
    try {
        let parsedClipboardText = JSON.parse(clipboardText)
        columns = parsedClipboardText.columns
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
        alert('Invalid configuration')
    }
}

$: columnSuggestions = {}
$: {
    columns.forEach((col) => {
        if (col.autocomplete === 'Yes') {
            columnSuggestions[col.name] = [
                ...new Set(
                    items
                        .map((item) => item[col.name])
                        .filter((v) => v)
                        .map((item) => {
                            const tempDiv = document.createElement('div')
                            tempDiv.innerHTML = item.trim()
                            return tempDiv.textContent || ''
                        }),
                ),
            ].filter((item) => item !== '')
        }
    })
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

    const wordBoundaryRegex = new RegExp(`\\b${normalizedQuery.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`)
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
        const allSuggestions = columnSuggestions[columnName] || []
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
            autocompleteData.itemIndex = itemIndex // global index for data update
            autocompleteData.columnName = columnName
        } else {
            autocompleteData.show = false
        }
    } else {
        autocompleteData.show = false
    }

    // styles and computed columns are computed on demand now
}

function getSuggestionPosition(element) {
    const rect = element.getBoundingClientRect()
    return {
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
    }
}

function handleSelectSuggestion(event) {
    const suggestion = event.detail.suggestion
    const { itemIndex, columnName } = autocompleteData
    if (itemIndex !== null && columnName) {
        items[itemIndex][columnName] = suggestion
        items = items // Trigger reactivity

        autocompleteData.show = false

        // Update the cell content and focus
        const localIndex = itemIndex - visibleStartIndex
        const cell = editableTable.querySelector(
            `tbody tr:nth-child(${localIndex + 1}) td:nth-child(${columns.findIndex((col) => col.name === columnName) + 1}) div[contenteditable]`,
        )
        if (cell) {
            cell.textContent = suggestion
            cell.focus()
            // Place cursor at the end
            document.getSelection().collapse(cell, 1)
        }
    }
}

function getColumnValue(type, value) {
    if (type === undefined || type === '') {
        return value
    }

    if (type === 'Input (Plain Text)') {
        return value.split('\n').join('<br>')
    }

    alert('Invalid column type')
}

import 'code-mirror-custom-element'
import InsertFileModal from '../Modals/InsertFileModal.svelte'
import { eventStore } from '../../stores.js'
import Autocomplete from '../Autocomplete.svelte'
import { baseURL } from '../../../config.js'
import AIChatPanel from '../../components/AIChatPanel.svelte'

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
            `Field: Computed Column Expression\nColumn: ${col.label || col.name} (${col.name})\nRuntime: The code runs as new Function('items','rowIndex','item','columnName', customFunctions + code) and executes per visible cell.\nVariables: items (array of rows), rowIndex (number), item (items[rowIndex]), columnName (string).\nAccessing other columns: use item['Other Column Name'] (sanitized as needed).\nContract: Return the computed display value as a string/number/HTML. Avoid DOM access.` +
            schema
        current = col.expression || ''
    } else if (target.type === 'total') {
        const col = columns[target.columnIndex]
        ctx =
            `Field: Totals Expression\nColumn: ${col.label || col.name} (${col.name})\nRuntime: The code runs as new Function('items','rowIndex','item','columnName', customFunctions + code) with rowIndex=null and item=null.\nVariables: items (array of rows), columnName (string).\nAccessing other columns: iterate items and read row['Other']. Derive text/number as needed.\nContract: Return the footer/total content (string/number/HTML).` +
            schema
        current = totals[col.name] || ''
    } else if (target.type === 'colStyle') {
        const col = columns[target.columnIndex]
        ctx =
            `Field: Column Style\nColumn: ${col.label || col.name} (${col.name})\nRuntime: The code runs as new Function('items','rowIndex','item','columnName', customFunctions + code) per visible cell.\nVariables: items, rowIndex, item, columnName.\nCell value is item[columnName]. You may also reference other columns via item['Other'].\nContract: Return an inline CSS string (e.g., "color: red; font-weight: bold").\nExample: return (String(item?.[columnName] ?? '').replace(/<[^>]*>/g,'').trim().toLowerCase() === 'red') ? 'background-color: red;' : '';` +
            schema
        current = col.style || ''
    } else if (target.type === 'rowStyle') {
        ctx =
            `Field: Row Style\nRuntime: The code runs as new Function('items','rowIndex','item', customFunctions + code) per visible row.\nVariables: items, rowIndex, item.\nAccessing columns: use item['Column Name'] for any column needed; derive text/number as needed.\nContract: Return an inline CSS string (e.g., "background: #fee").` +
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

eventStore.subscribe((event) => {
    if (event && event.event === 'configureTable') {
        configuration = true
    }
})
</script>

<div class="pos-r">
    {#if !loaded}
        <div>Loading…</div>
    {/if}
    {#if !configuration}
        {#if pageContentOverride === undefined && viewOnly === false && loaded}
            <div class="config" on:click={() => (configuration = true)}>
                Configure Table
            </div>
        {/if}
        <table
            on:paste={handlePaste}
            on:keydown={(e) => handleUndoStacks(e)}
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
                            >{column.label}<span class="v-h"
                                >{column.label === '' ? column.name : ''}</span
                            ></th
                        >
                    {/each}
                </tr>
            </thead>
            <tbody>
                {#each visibleItems as item, localRowIndex (visibleStartIndex + localRowIndex)}
                    <tr>
                        {#each columns as column, columnIndex}
                            <td
                                style="min-width: {widths[
                                    column.name
                                ]}; max-width: {widths[
                                    column.name
                                ]}; {column.wrap === 'No'
                                    ? 'white-space: nowrap;'
                                    : 'word-break: break-word;'} {column.align
                                    ? `text-align: ${column.align};`
                                    : 'text-align: left;'} {computeRowStyle(
                                    visibleStartIndex + localRowIndex,
                                )}; {computeColumnStyle(
                                    visibleStartIndex + localRowIndex,
                                    columnIndex,
                                    column.name,
                                )}"
                            >
                                {#if pageContentOverride === undefined && viewOnly === false && column.type !== 'Computed'}
                                    {#if column.type === '' || column.type === undefined}
                                        <div
                                            contenteditable
                                            spellcheck="false"
                                            bind:innerHTML={item[column.name]}
                                            on:keydown={(e) =>
                                                handleKeysInTD(
                                                    e,
                                                    visibleStartIndex +
                                                        localRowIndex,
                                                    column.name,
                                                )}
                                            on:input={(e) =>
                                                handleInputInTD(
                                                    e,
                                                    visibleStartIndex +
                                                        localRowIndex,
                                                    column.name,
                                                )}
                                            on:blur={handleBlur}
                                        ></div>
                                    {:else}
                                        <div
                                            contenteditable="plaintext-only"
                                            spellcheck="false"
                                            bind:innerHTML={item[column.name]}
                                            on:keydown={(e) =>
                                                handleKeysInTD(
                                                    e,
                                                    visibleStartIndex +
                                                        localRowIndex,
                                                    column.name,
                                                )}
                                            on:input={(e) =>
                                                handleInputInTD(
                                                    e,
                                                    visibleStartIndex +
                                                        localRowIndex,
                                                    column.name,
                                                )}
                                            on:blur={handleBlur}
                                        ></div>
                                    {/if}
                                {:else if column.type === 'Computed'}
                                    <div>
                                        {@html computeComputedColumn(
                                            visibleStartIndex + localRowIndex,
                                            columnIndex,
                                        )}
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
                        {#if pageContentOverride === undefined && viewOnly === false}
                            <td class="table-actions">
                                <button
                                    on:click={() =>
                                        insertRow(
                                            visibleStartIndex + localRowIndex,
                                            true,
                                        )}>↑</button
                                >
                                <button
                                    on:click={() =>
                                        insertRow(
                                            visibleStartIndex + localRowIndex,
                                            false,
                                        )}>↓</button
                                >
                                <button
                                    on:click={() => {
                                        if (
                                            !confirm(
                                                'Are you sure you want to delete this row?',
                                            )
                                        ) {
                                            return
                                        }
                                        deleteRow(
                                            visibleStartIndex + localRowIndex,
                                        )
                                    }}>x</button
                                >
                            </td>
                        {/if}
                    </tr>
                {/each}
            </tbody>
            {#if Object.keys(totals).length > 0}
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
    {:else}
        <div class="config-holder">
            <div on:click={() => (configuration = false)}>
                Exit Configuration
            </div>
            <div on:click={copyConfiguration} style="margin-top: 0.5rem">
                Copy Configuration
            </div>
            <div on:click={pasteConfiguration} style="margin-top: 0.25rem">
                Paste Configuration
            </div>
        </div>

        <div class="config-heading">Columns</div>
        <form on:submit|preventDefault={addColumn}>
            <table class="config-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Label</th>
                        <th>Wrap</th>
                        <th>Align</th>
                        <th>Type</th>
                        <th>Autocomplete</th>
                    </tr>
                </thead>
                <tbody>
                    {#each columns as column, index}
                        {#if columnToEditReference && columnToEditReference.name === column.name}
                            <tr>
                                <td
                                    ><input
                                        type="text"
                                        bind:value={columnToEditCopy.name}
                                        use:focus
                                    /></td
                                >
                                <td
                                    ><input
                                        type="text"
                                        bind:value={columnToEditCopy.label}
                                    /></td
                                >
                                <td>
                                    <select bind:value={columnToEditCopy.wrap}>
                                        <option value="">Yes</option>
                                        <option>No</option>
                                    </select>
                                </td>
                                <td>
                                    <select bind:value={columnToEditCopy.align}>
                                        <option value="">Left</option>
                                        <option>Center</option>
                                        <option>Right</option>
                                    </select>
                                </td>
                                <td>
                                    <select bind:value={columnToEditCopy.type}>
                                        <option value="">Input</option>
                                        <option>Input (Plain Text)</option>
                                        <option>Computed</option>
                                    </select>
                                </td>
                                <td>
                                    <select
                                        bind:value={
                                            columnToEditCopy.autocomplete
                                        }
                                    >
                                        <option value="">No</option>
                                        <option>Yes</option>
                                    </select>
                                </td>
                                <td>
                                    <button
                                        type="button"
                                        on:click={updateColumn}>Update</button
                                    >
                                </td>
                                <td>
                                    <button
                                        type="button"
                                        on:click={cancelEditColumn}
                                        >Cancel</button
                                    >
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td>{column.name}</td>
                                <td>{column.label}</td>
                                <td>{column.wrap || 'Yes'}</td>
                                <td>{column.align || 'Left'}</td>
                                <td>{column.type || 'Input'}</td>
                                <td>{column.autocomplete || 'No'}</td>
                                <td
                                    ><button
                                        type="button"
                                        on:click={() => moveUp(index)}
                                        >Move Up</button
                                    ></td
                                >
                                <td
                                    ><button
                                        type="button"
                                        on:click={() => moveDown(index)}
                                        >Move Down</button
                                    ></td
                                >
                                <td
                                    ><button
                                        type="button"
                                        on:click={() => startEditColumn(column)}
                                        >Edit</button
                                    ></td
                                >
                                <td
                                    ><button
                                        type="button"
                                        on:click={() =>
                                            deleteColumn(column.name)}
                                        >Delete</button
                                    ></td
                                >
                            </tr>
                        {/if}
                    {/each}
                    {#if showAddColumn}
                        <tr>
                            <td
                                ><input
                                    type="text"
                                    bind:value={column.name}
                                    required
                                    use:focus
                                /></td
                            >
                            <td
                                ><input
                                    type="text"
                                    bind:value={column.label}
                                    placeholder="Keep blank to be = name"
                                /></td
                            >
                            <td>
                                <select bind:value={column.wrap}>
                                    <option value="">Yes</option>
                                    <option>No</option>
                                </select>
                            </td>
                            <td>
                                <select bind:value={column.align}>
                                    <option value="">Left</option>
                                    <option>Center</option>
                                    <option>Right</option>
                                </select>
                            </td>
                            <td>
                                <select bind:value={column.type}>
                                    <option value="">Input</option>
                                    <option>Computed</option>
                                </select>
                            </td>
                            <td>
                                <select bind:value={column.autocomplete}>
                                    <option value="">No</option>
                                    <option>Yes</option>
                                </select>
                            </td>
                            <td>
                                <button>Add</button>
                            </td>
                            <td>
                                <button
                                    class="ml-0_5em"
                                    type="button"
                                    on:click={() => (showAddColumn = false)}
                                    >Cancel</button
                                >
                            </td>
                        </tr>
                    {/if}
                </tbody>
            </table>
        </form>
        {#if !showAddColumn}
            <button class="mt-1em" on:click={() => (showAddColumn = true)}
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
                <code style="white-space: pre;"
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

<style>
.pos-r {
    position: relative;
}

.config-holder {
    position: absolute;
    right: 24px;
    top: 0;
}

.config-holder > div {
    cursor: pointer;
    color: blue;
}

.config {
    position: absolute;
    right: 24px;
    top: 0;
    cursor: pointer;
    color: blue;
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
    border: 1px solid grey;
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
    background: white;
}

.pager > button {
    border: 1px solid grey;
    background: transparent;
    padding: 2px 6px;
}

.pager-jump {
    width: 6ch;
    padding: 2px 4px;
    border: 1px solid grey;
    font: inherit;
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
    opacity: 0.5;
}

td.table-actions button {
    border: 1px solid grey;
    background: transparent;
}

:global(.editable-table) > thead th {
    position: sticky;
    top: 0;
    background-color: white;
    z-index: 1;
}

:global(.editable-table) > tbody:nth-of-type(1) tr:nth-of-type(1) td {
    border-top: none !important;
}

:global(.editable-table) > thead th {
    border-top: none !important;
    border-bottom: none !important;
    box-shadow:
        inset 0 1px 0 grey,
        inset 0 -1px 0 grey;
}
</style>
