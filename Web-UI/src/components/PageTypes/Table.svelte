<script>
export let pageId = null
export let viewOnly = false
export let pageContentOverride = undefined
export let style = ''

let columns = []
let items = []
let totals = {}
let widths = {}
let rowStyle = ''
let startupScript = ''
let customFunctions = ''
let showInsertFileModal = false
let insertFileModalLinkLabel = ''
let currentTd = null
let savedCursorPosition = null
let computedRowStyles = []
let computedColumnStyles = []
let computedColumnValues = []

let autocompleteData = {
    show: false,
    suggestions: [],
    position: { top: 0, left: 0 },
    itemIndex: null,
    columnName: null
};

function computeRowStyle(rowIndex) {
    if (!rowStyle) return ''
    return evalulateJS('Row Style', rowStyle, rowIndex)
}

function computeAllRowStyles() {
    computedRowStyles = items.map((_, index) => computeRowStyle(index))
}

function recomputeRowStyle(rowIndex) {
    computedRowStyles[rowIndex] = computeRowStyle(rowIndex)
    computedRowStyles = computedRowStyles
}

function computeColumnStyle(rowIndex, columnIndex, columnName) {
    if (!columns[columnIndex].style) return ''
    return evalulateJS('Column Style', columns[columnIndex].style, rowIndex, columnName)
}

function computeAllColumnStyles() {
    computedColumnStyles = items.map((_, rowIndex) =>
        columns.map((column, columnIndex) => computeColumnStyle(rowIndex, columnIndex, column.name))
    )
}

function recomputeColumnStyle(rowIndex) {
    computedColumnStyles[rowIndex] = columns.map((column, columnIndex) => computeColumnStyle(rowIndex, columnIndex, column.name))
    computedColumnStyles = computedColumnStyles
}

function computeComputedColumn(rowIndex, columnIndex) {
    const column = columns[columnIndex]
    if (!column.expression) return ''
    return evalulateJS('Computed Column', column.expression, rowIndex, column.name)
}

function computeAllComputedColumns() {
    computedColumnValues = items.map((_, rowIndex) =>
        columns.map((column, columnIndex) =>
            column.type === 'Computed' ? computeComputedColumn(rowIndex, columnIndex) : null
        )
    )
}

function recomputeComputedColumn(rowIndex) {
    computedColumnValues[rowIndex] = columns.map((column, columnIndex) =>
        column.type === 'Computed' ? computeComputedColumn(rowIndex, columnIndex) : null
    )
    computedColumnValues = computedColumnValues
}

$: if(pageContentOverride) {
    let parsedPage = JSON.parse(pageContentOverride)
    columns = parsedPage.columns
    items = parsedPage.items
    totals = parsedPage.totals
    widths = parsedPage.widths
    rowStyle = parsedPage.rowStyle
    startupScript = parsedPage.startupScript
    customFunctions = parsedPage.customFunctions

    computeAllRowStyles()
    computeAllColumnStyles()
    computeAllComputedColumns()
}

$: fetchPage(pageId)

import fetchPlus from '../../helpers/fetchPlus.js'

let editableTable = null

function fetchPage(pageId) {
    if(pageId === null) {
        return
    }
    // reset variables on page change
    configuration = false
    showAddColumn = false
    cancelEditColumn()
    undoStackForRemoveRow = [] // reset undo stack
    // end of reset variables on page change
    fetchPlus.get(`/pages/content/${pageId}`).then(response => {
        let parsedResponse = response.content ? JSON.parse(response.content) : {
            columns: [],
            items: [],
            totals: {},
            widths: {},
            rowStyle: '',
            startupScript: '',
            customFunctions: '',
        }
        columns = parsedResponse.columns
        dontTriggerSave = true
        totals = parsedResponse.totals
        widths = parsedResponse.widths ? parsedResponse.widths : {}
        rowStyle = parsedResponse.rowStyle ? parsedResponse.rowStyle : ''
        startupScript = parsedResponse.startupScript ? parsedResponse.startupScript : ''
        customFunctions = parsedResponse.customFunctions ? parsedResponse.customFunctions : ''

        if(!viewOnly && columns.length > 0 && startupScript && startupScript.trim()) {
            const copyOfItems = JSON.stringify(parsedResponse.items)
            evalulateStartupScript(startupScript, { rows: parsedResponse.items })
            if(copyOfItems !== JSON.stringify(parsedResponse.items)) {
                dontTriggerSave = false
            }
        }

        items = parsedResponse.items

        computeAllRowStyles()
        computeAllColumnStyles()
        computeAllComputedColumns()

        if(columns.length === 0) {
            configuration = true
            showAddColumn = true
        }

        // set focus to the last cell in the table
        setTimeout(() => {
            if(editableTable) {
                let lastEditableTD = editableTable.querySelectorAll('tbody > tr:last-child > td > div[contenteditable]:empty')
                if(lastEditableTD.length === 0) {
                    lastEditableTD = editableTable.querySelectorAll('tbody > tr:last-child > td > div[contenteditable]')
                    lastEditableTD = lastEditableTD[lastEditableTD.length - 1]
                } else {
                    lastEditableTD = lastEditableTD[0]
                }
                if(lastEditableTD) {
                    lastEditableTD.focus()
                    lastEditableTD.scrollIntoView()
                }
                // move cursor to the end of editable area
                document.execCommand('selectAll', false, null);
                document.getSelection().collapseToEnd();
            }
        }, 0)
    })
}

import debounce from '../../helpers/debounce.js'

const savePageContent = debounce(function() {
    if(pageId === null) {
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
        })
    })
}, 500)

let dontTriggerSave = true

function save() {
    items = items // save
}

$: if(items) {
    totals = totals
    Object.keys(totals).forEach(columnName => {
        if(totals[columnName] === '') {
            delete totals[columnName]
        }

        // remove totals for columns that are not present in the table
        if(!columns.some(column => column.name === columnName)) {
            delete totals[columnName]
        }
    })

    widths = widths
    Object.keys(widths).forEach(columnName => {
        if(widths[columnName] === '') {
            delete widths[columnName]
        }
    })

    rowStyle = rowStyle

    startupScript = startupScript

    customFunctions = customFunctions

    if(!dontTriggerSave) {
        savePageContent()
    }

    dontTriggerSave = false
}

function evalulateStartupScript(jsString, dynamicVariables) {
    try {
        const functionParameters = Object.keys(dynamicVariables).join(',')
        const functionArguments = Object.values(dynamicVariables)
        return new Function(functionParameters, jsString).apply(this, functionArguments)
    } catch(e) {
        alert('error evaluating startup script')
        console.log('startup script error', e)
    }
}

function evalulateJS(source, jsString, rowIndex=null, columnName=null) {
    console.log('evaluating', source)
    try {
        const customFunctionsCode = customFunctions ? customFunctions + '\n' : ''
        return new Function('items', 'rowIndex', 'item', 'columnName', customFunctionsCode + jsString).call(this, items, rowIndex, rowIndex !== null ? items[rowIndex] : null, columnName)
    } catch(e) {
        console.error(`${source}:`, e)
        return 'error evaluating given expression'
    }
}

let undoStackForRemoveRow = []

import defaultKeydownHandlerForContentEditableArea from '../../helpers/defaultKeydownHandlerForContentEditableArea.js'

// From: https://stackoverflow.com/a/7478420/4932305
function getSelectionTextInfo(el) {
    var atStart = false, atEnd = false
    var selRange, testRange
    if (window.getSelection) {
        var sel = window.getSelection()
        if (sel.rangeCount) {
            selRange = sel.getRangeAt(0)
            testRange = selRange.cloneRange()

            testRange.selectNodeContents(el)
            testRange.setEnd(selRange.startContainer, selRange.startOffset)
            atStart = (testRange.toString() == '')

            testRange.selectNodeContents(el)
            testRange.setStart(selRange.endContainer, selRange.endOffset)
            atEnd = (testRange.toString() == '')
        }
    } else if (document.selection && document.selection.type != 'Control') {
        selRange = document.selection.createRange()
        testRange = selRange.duplicate()

        testRange.moveToElementText(el)
        testRange.setEndPoint('EndToStart', selRange)
        atStart = (testRange.text == '')

        testRange.moveToElementText(el)
        testRange.setEndPoint('StartToEnd', selRange)
        atEnd = (testRange.text == '')
    }

    return { atStart: atStart, atEnd: atEnd }
}

function insertRow(rowIndex, insertAbove) {
    let insertObj = {}
    columns.forEach(column => {
        insertObj[column.name] = ''
    })

    if(!insertAbove) {
        items.splice(rowIndex + 1, 0, insertObj)
    } else { // insert row above if ctrl + shift + enter
        items.splice(rowIndex, 0, insertObj)
    }
    items = items

    computeAllRowStyles()
    computeAllColumnStyles()
    computeAllComputedColumns()

    // move focus to the first focusable cell of the inserted row, if shift key is not pressed
    if(!insertAbove) {
        setTimeout(() => {
            let rows = document.querySelector('.editable-table tbody').querySelectorAll('tr')
            let bottomRow = rows[rowIndex + 1]
            if(typeof bottomRow !== 'undefined') {
                let bottomCell = bottomRow.querySelector('div[contenteditable]')
                bottomCell.focus()
            }
        }, 0)
    }
}

function deleteRow(rowIndex) {
    if(items.length === 1) {
        undoStackForRemoveRow.push({ index: 0, item: JSON.parse(JSON.stringify(items[0])) }) // save undo

        columns.forEach(column => {
            items[0][column.name] = ''
        })

        computeAllRowStyles()
        computeAllColumnStyles()
        computeAllComputedColumns()
        return
    }

    undoStackForRemoveRow.push({ index: rowIndex, item: items[rowIndex] }) // save undo

    items.splice(rowIndex, 1)
    items = items

    // move focus to the first focusable cell of the row before the removed row
    let tbody = document.querySelector('.editable-table tbody')
    if(!tbody) { return }
    let rows = tbody.querySelectorAll('tr')
    let bottomRow = rows[rowIndex - 1]
    if(typeof bottomRow !== 'undefined') {
        let bottomCell = bottomRow.querySelector('div[contenteditable]')
        bottomCell.focus()
    }

    computeAllRowStyles()
    computeAllColumnStyles()
    computeAllComputedColumns()
}

function handleKeysInTD(e, itemIndex, itemColumn) {
    defaultKeydownHandlerForContentEditableArea(e)
    saveCursorPosition()

    // insert row
    if(e.ctrlKey && e.key === 'Enter')  {
        if(e.shiftKey) {
            insertRow(itemIndex, true)
        } else {
            insertRow(itemIndex, false)
        }
    }

    // remove current row
    if(e.ctrlKey && e.key.toLowerCase() === 'delete') {
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
    if(e.key === 'ArrowUp') {
        if(getSelectionTextInfo(e.target.closest('td')).atStart === false && e.ctrlKey === false) {
            return
        }
        e.preventDefault()
        let rows = e.target.closest('tbody').querySelectorAll('tr')
        let currentColumn = e.target.parentElement.cellIndex
        let upperRow = rows[e.target.parentElement.parentElement.rowIndex - 2]
        if(typeof upperRow !== 'undefined') {
            let upperCell = upperRow.querySelector('td:nth-of-type(' + (currentColumn + 1) + ') > div')
            upperCell.focus()
        }
    }

    // move to bottom cell
    if(e.key === 'ArrowDown') {
        if(getSelectionTextInfo(e.target.closest('td')).atEnd === false && e.ctrlKey === false) {
            return
        }
        e.preventDefault()
        let rows = e.target.closest('tbody').querySelectorAll('tr')
        let currentColumn = e.target.parentElement.cellIndex
        let bottomRow = rows[e.target.parentElement.parentElement.rowIndex]
        if(typeof bottomRow !== 'undefined') {
            let bottomCell = bottomRow.querySelector('td:nth-of-type(' + (currentColumn + 1) + ') > div')
            bottomCell.focus()
        }
    }

    // copy all content from the above cell to the current cell
    if(e.ctrlKey && e.key === ';') {
        e.preventDefault()
        const rows = e.target.closest('tbody').querySelectorAll('tr')
        const currentColumn = e.target.parentElement.cellIndex
        const upperRow = rows[e.target.parentElement.parentElement.rowIndex - 2]
        if(typeof upperRow !== 'undefined') {
            const upperCell = upperRow.querySelector('td:nth-of-type(' + (currentColumn + 1) + ') > div')
            document.execCommand('insertHTML', false, upperCell.innerHTML)
        }
    }

    if(e.ctrlKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        currentTd = e.target
        insertFileModalLinkLabel = window.getSelection().toString() // prefill selected text, so that you can convert selected text to a link to an upload file
        showInsertFileModal = true
    }

    if (e.key === 'Escape') {
        e.preventDefault();
        autocompleteData.show = false;
    }
}

function handleBlur(event) {
    // Check if the new focus is within the suggestions list
    setTimeout(() => {
        const activeElement = document.activeElement;
        if (activeElement && activeElement.closest('.suggestions')) {
            return;
        }
        autocompleteData.show = false;
    }, 0);
}

function handleUndoStacks(e) {
    if(e.ctrlKey && e.key.toLowerCase() === 'z') {
        if(undoStackForRemoveRow.length > 0) {
            e.preventDefault()
            let undo = undoStackForRemoveRow.pop()
            if(items.length === 1) {
                let emptyKeysCount = 0
                let keys = Object.keys(items[0])
                let keysCount = keys.length
                keys.forEach(itemKey => {
                    if(items[0][itemKey] === '') {
                        emptyKeysCount++
                    }
                })
                if(emptyKeysCount === keysCount) {
                    items.splice(undo.index, 1, undo.item)
                } else {
                    items.splice(undo.index, 0, undo.item)
                }
            } else if(items.length > 1) {
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
    autocomplete: ''
}

$: if(showAddColumn) {
    column = {
        name: '',
        label: '',
        wrap: '',
        align: '',
        type: '',
        autocomplete: ''
    }
    cancelEditColumn()
}

function addColumn() {
    let existingColumnNames = columns.map(column => column.name)
    if(existingColumnNames.includes(column.name)) {
        alert('You can\'t use an existing column name')
        return
    }

    if (column.label === '') {
        column.label = column.name
    }

    columns.push(column)
    columns = columns
    if(items.length === 0) {
        items.push({
            [column.name]: ''
        })
    } else {
        items.forEach(item => {
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
        autocomplete: ''
    }
    showAddColumn = false
}

function swapElement(array, fromIndex, toIndex) {
    var tmp = array[fromIndex]
    array[fromIndex] = array[toIndex]
    array[toIndex] = tmp
}

function moveUp(index) {
    if(index > 0) {
        swapElement(columns, index, index - 1)
        columns = columns
        items = items // save
    }
}

function moveDown(index) {
    if(index < columns.length - 1) {
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
    if(columnToEditCopy.name === '') {
        alert('Column name can\'t be be empty')
        return
    }
    let existingColumnNames = columns.map(column => column.name).filter(columnName => columnName != columnToEditReference.name)
    if(existingColumnNames.includes(columnToEditCopy.name)) {
        alert('You can\'t use an existing column name')
        return
    }
    if(columnToEditReference.name !== columnToEditCopy.name) { // column name changed, rename column name in items
        items.forEach(item => {
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
    if(confirm('Deleting a column, will also delete all the items under it. Are you sure you want to delete this column?')) {
        columns = columns.filter(column => column.name !== columnName)
        items.forEach(item => {
            Object.keys(item).forEach(itemColumName => {
                if(!(columns.map(column => column.name).includes(itemColumName))) {
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

function copyConfiguration() {
    let copyText = JSON.stringify({
        columns,
        totals,
        widths,
        rowStyle,
        startupScript,
        customFunctions,
    })
    navigator.clipboard.writeText(copyText).then(() => {
        alert('Configuration copied to clipboard')
    })
}

async function pasteConfiguration() {
    const clipboardText = await navigator.clipboard.readText()
    if(!confirm('Are you sure you want to paste configuration? This will overwrite the current configuration.')) {
        return
    }
    try {
        let parsedClipboardText = JSON.parse(clipboardText)
        columns = parsedClipboardText.columns
        if(items.length === 0) {
            items.push({})
        }
        totals = parsedClipboardText.totals
        widths = parsedClipboardText.widths
        rowStyle = parsedClipboardText.rowStyle
        startupScript = parsedClipboardText.startupScript
        customFunctions = parsedClipboardText.customFunctions
    } catch(e) {
        alert('Invalid configuration')
    }
}

$: columnSuggestions = {}
$: {
    columns.forEach(col => {
        if (col.autocomplete === 'Yes') {
            columnSuggestions[col.name] = [...new Set(items.map(item => item[col.name]).filter(v => v).map(item => item.trim()))].filter(item => item !== '<br>')
        }
    })
}

function handleInputInTD(e, itemIndex, columnName) {
    const column = columns.find(col => col.name === columnName);
    if (column && column.autocomplete === 'Yes') {
        const value = e.target.textContent;
        const allSuggestions = columnSuggestions[columnName];
        const filteredSuggestions = allSuggestions.filter(suggestion =>
            suggestion.toLowerCase().includes(value.toLowerCase()) && suggestion !== value
        );

        if (filteredSuggestions.length > 0) {
            autocompleteData.show = true;
            autocompleteData.suggestions = filteredSuggestions;
            autocompleteData.position = getSuggestionPosition(e.target);
            autocompleteData.itemIndex = itemIndex;
            autocompleteData.columnName = columnName;
        } else {
            autocompleteData.show = false;
        }
    } else {
        autocompleteData.show = false;
    }

    recomputeRowStyle(itemIndex);
    recomputeColumnStyle(itemIndex);
    recomputeComputedColumn(itemIndex);
}

function getSuggestionPosition(element) {
    const rect = element.getBoundingClientRect();
    return {
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX
    };
}

function handleSelectSuggestion(event) {
    const suggestion = event.detail.suggestion;
    const { itemIndex, columnName } = autocompleteData;
    if (itemIndex !== null && columnName) {
        items[itemIndex][columnName] = suggestion;
        items = items; // Trigger reactivity

        autocompleteData.show = false;

        // Update the cell content and focus
        const cell = editableTable.querySelector(
            `tbody tr:nth-child(${itemIndex + 1}) td:nth-child(${columns.findIndex(col => col.name === columnName) + 1}) div[contenteditable]`
        );
        if (cell) {
            cell.textContent = suggestion;
            cell.focus();
            // Place cursor at the end
            document.getSelection().collapse(cell, 1);
        }
    }
}

import 'code-mirror-custom-element'
import InsertFileModal from '../Modals/InsertFileModal.svelte'
import { eventStore } from '../../stores.js'
import Autocomplete from '../Autocomplete.svelte'

eventStore.subscribe(event => {
    if(event && event.event === 'configureTable') {
        configuration = true
    }
})
</script>

<div class="pos-r">
    {#if !configuration}
        {#if pageContentOverride === undefined && viewOnly === false}
            <div class="config" on:click={() => configuration = true}>Configure Table</div>
        {/if}
        <table on:paste={handlePaste} on:keydown={e => handleUndoStacks(e)} class="editable-table" bind:this={editableTable} style="{style}">
            <thead>
                <tr>
                    {#each columns as column}
                        <th style="{column.wrap === 'No' ? 'white-space: nowrap;' : ''}">{column.label}<span class="v-h">{column.label === '' ? column.name : ''}</span></th>
                    {/each}
                </tr>
            </thead>
            <tbody>
                {#each items as item, itemIndex}
                    <tr>
                        {#each columns as column, columnIndex}
                            <td style="min-width: {widths[column.name]}; max-width: {widths[column.name]}; {column.wrap === 'No' ? 'white-space: nowrap;' : 'word-break: break-word;'} {column.align ? `text-align: ${column.align};` : 'text-align: left;'} {computedRowStyles[itemIndex]}; {computedColumnStyles[itemIndex] ? computedColumnStyles[itemIndex][columnIndex] : ''}">
                                {#if pageContentOverride === undefined && viewOnly === false && column.type !== 'Computed'}
                                    <div
                                        contenteditable
                                        spellcheck="false"
                                        bind:innerHTML={item[column.name]}
                                        on:keydown={(e) => handleKeysInTD(e, itemIndex, column.name)}
                                        on:input={(e) => handleInputInTD(e, itemIndex, column.name)}
                                        on:blur={handleBlur}
                                    ></div>
                                {:else}
                                    {#if column.type === 'Computed'}
                                        <div>{@html computedColumnValues[itemIndex][columnIndex]}</div>
                                    {:else}
                                        <div>{@html item[column.name] || '<span style="visibility: hidden">cat</span>'}</div>
                                    {/if}
                                {/if}
                            </td>
                        {/each}
                        {#if pageContentOverride === undefined && viewOnly === false}
                        <td class="table-actions">
                            <button on:click={() => insertRow(itemIndex, true)}>↑</button>
                            <button on:click={() => insertRow(itemIndex, false)}>↓</button>
                            <button on:click={() => {
                                if(!confirm('Are you sure you want to delete this row?')) {
                                    return
                                }
                                deleteRow(itemIndex)
                            }}>x</button>
                        </td>
                        {/if}
                    </tr>
                {/each}
            </tbody>
            {#if Object.keys(totals).length > 0}
                <tr>
                    {#each columns as column}
                        {#if totals.hasOwnProperty(column.name)}
                            <th style="{column.wrap === 'No' ? 'white-space: nowrap;' : ''}">{@html evalulateJS('Totals', totals[column.name], null, column.name) }</th>
                        {:else}
                            <th></th>
                        {/if}
                    {/each}
                </tr>
            {/if}
        </table>
    {:else}
        <div class="config-holder">
            <div on:click={() => configuration = false}>Exit Configuration</div>
            <div on:click={copyConfiguration} style="margin-top: 0.5rem">Copy Configuration</div>
            <div on:click={pasteConfiguration} style="margin-top: 0.25rem">Paste Configuration</div>
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
                                <td><input type="text" bind:value={columnToEditCopy.name} use:focus></td>
                                <td><input type="text" bind:value={columnToEditCopy.label}></td>
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
                                        <option>Computed</option>
                                    </select>
                                </td>
                                <td>
                                    <select bind:value={columnToEditCopy.autocomplete}>
                                        <option value="">No</option>
                                        <option>Yes</option>
                                    </select>
                                </td>
                                <td>
                                    <button type="button" on:click={updateColumn}>Update</button>
                                </td>
                                <td>
                                    <button type="button" on:click={cancelEditColumn}>Cancel</button>
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
                                <td><button type="button" on:click={() => moveUp(index)}>Move Up</button></td>
                                <td><button type="button" on:click={() => moveDown(index)}>Move Down</button></td>
                                <td><button type="button" on:click={() => startEditColumn(column)}>Edit</button></td>
                                <td><button type="button" on:click={() => deleteColumn(column.name)}>Delete</button></td>
                            </tr>
                        {/if}
                    {/each}
                    {#if showAddColumn}
                        <tr>
                            <td><input type="text" bind:value={column.name} required use:focus></td>
                            <td><input type="text" bind:value={column.label} placeholder="Keep blank to be = name"></td>
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
                                <button class="ml-0_5em" type="button" on:click={() => showAddColumn = false}>Cancel</button>
                            </td>
                        </tr>
                    {/if}
                </tbody>
            </table>
        </form>
        {#if !showAddColumn}
            <button class="mt-1em" on:click={() => showAddColumn = true}>Add Column</button>
        {/if}

        {#if columns.filter(column => column.type === 'Computed').length > 0}
            <div class="config-heading mt-1em">Computed Columns</div>
            <div class="config-area-font-size">
                {#each columns.filter(column => column.type === 'Computed') as column}
                    <div>{column.label ? column.label : column.name}</div>
                    <div>
                        <code-mirror
                            value={column.expression}
                            on:input={e => { column.expression = e.target.value; save() }}
                            style="border: 1px solid darkgray"
                        ></code-mirror>
                    </div>
                {/each}
            </div>
            <div class="config-area-note">
                Available variables: <code>items</code>, <code>rowIndex</code> & <code>item</code>
            </div>
        {/if}

        <div class="config-heading mt-1em">Totals</div>
        <div class="config-area-font-size">
            {#each columns as column}
                <div>{column.label ? column.label : column.name}</div>
                <div>
                    <code-mirror
                        value={totals[column.name] ? totals[column.name]: ''}
                        on:input={(e) => totals[column.name] = e.target.value}
                        style="border: 1px solid darkgray"
                    >
                    </code-mirror>
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
                    <input type="text" value={widths[column.name] ? widths[column.name]: ''} on:input={(e) => widths[column.name] = e.target.value}>
                </div>
            {/each}
        </div>

        <div class="config-heading mt-1em">Column Styles</div>
        <div class="config-area-font-size">
            {#each columns as column}
                <div>{column.label ? column.label : column.name}</div>
                <div>
                    <code-mirror
                        value={column.style}
                        on:input={e => { column.style = e.target.value; save() }}
                        style="border: 1px solid darkgray"
                    >
                    </code-mirror>
                </div>
            {/each}
        </div>
        <div class="config-area-note">
            Available variables: <code>items</code>, <code>rowIndex</code>, <code>item</code> & <code>columnName</code><br>
            You can add conditions and return a style like:<br>
            <code>return items[rowIndex][columnName] === 'foo' ? 'color: red' : ''</code>
        </div>

        <div class="config-heading mt-1em">Row Style</div>
        <div class="config-area-font-size">
            <div>
                <code-mirror
                    value={rowStyle}
                    on:input={(e) => rowStyle = e.target.value}
                    style="border: 1px solid darkgray"
                ></code-mirror>
            </div>
        </div>
        <div class="config-area-note">
            Available variables: <code>items</code>, <code>rowIndex</code> & <code>item</code><br>
            You can add conditions and return a style like:<br>
            <code>return items[rowIndex]['My Column Name'] === 'foo' ? 'color: red' : ''</code>
        </div>

        <div class="config-heading mt-1em">Startup Script</div>
        <div class="config-area-font-size">
            <div>
                <code-mirror
                    value={startupScript}
                    on:input={(e) => startupScript = e.target.value}
                    style="border: 1px solid darkgray"
                ></code-mirror>
            </div>
        </div>
        <div class="config-area-note">
            Available variables: <code>rows</code><br>
            <details>
                <summary style="cursor: pointer; user-select: none;">Click here to see example code on how to modify the rows in the table on startup</summary>
                <code style="white-space: pre;">{@html
`// Modify all rows
rows.forEach(row => {
    row['Column 1'] = row['Column 1'] + 'foo'
})

// add a new row at the end
rows.push({
    'Column 1' : 'Hi'
})

// add a new row at any index
const insertAtIndex = 1
rows.splice(insertAtIndex, 0, { 'Column 1': 'Inserted at index 1' })`
                }</code>
            </details>
        </div>

        <div class="config-heading mt-1em">Custom Functions</div>
        <div class="config-area-font-size">
            <div>
                <code-mirror
                    value={customFunctions}
                    on:input={(e) => customFunctions = e.target.value}
                    style="border: 1px solid darkgray"
                ></code-mirror>
            </div>
        </div>
        <div class="config-area-note">
            Define custom functions here that can be used in any evaluated JS code.
        </div>

        <div style="margin-bottom: 3rem"></div>
    {/if}
</div>

{#if showInsertFileModal}
    <InsertFileModal
        bind:pageId={pageId}
        bind:savedCursorPosition={savedCursorPosition}
        bind:contentEditableDivToFocus={currentTd}
        bind:insertFileModalLinkLabel={insertFileModalLinkLabel}
        bind:showInsertFileModal={showInsertFileModal}
    ></InsertFileModal>
{/if}

<Autocomplete
    bind:show={autocompleteData.show}
    suggestions={autocompleteData.suggestions}
    position={autocompleteData.position}
    on:select={handleSelectSuggestion}
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

table.config-table > tbody td {
    padding: 2px 5px;
}

table.config-table > tbody td > input {
    font: inherit;
}

.config-area-font-size, table.config-table {
    font-size: 16px;
}

.config-area-font-size input {
    font: inherit;
}

table {
    border-collapse: collapse;
}

table th, table td {
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
    box-shadow: inset 0 1px 0 grey,
                inset 0 -1px 0 grey;
}
</style>
