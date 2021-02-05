<script>
export let pageId = null
export let viewOnly = false
export let pageContentOverride = undefined
export let style = ''

let columns = []
let items = []
let totals = {}
let widths = {}

$: if(pageContentOverride) {
    let parsedPage = JSON.parse(pageContentOverride)
    columns = parsedPage.columns
    items = parsedPage.items
    totals = parsedPage.totals
    widths = parsedPage.widths
}

$: fetchPage(pageId)

import fetchPlus from '../helpers/fetchPlus.js'

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
            widths: {}
        }
        columns = parsedResponse.columns
        dontTriggerSave = true
        items = parsedResponse.items
        totals = parsedResponse.totals
        widths = parsedResponse.widths ? parsedResponse.widths : {}

        if(columns.length === 0) {
            configuration = true
            showAddColumn = true
        }

        // set focus to the last cell in the table
        setTimeout(() => {
            if(editableTable) {
                editableTable.querySelector('tbody > tr:last-child > td:last-child > div').focus()
                editableTable.querySelector('tbody > tr:last-child > td:last-child > div').scrollIntoView()
                // move cursor to the end of editable area
                document.execCommand('selectAll', false, null);
                document.getSelection().collapseToEnd();
            }
        }, 0)
    })
}

import debounce from '../helpers/debounce.js'

const savePageContent = debounce(function() {
    if(pageId === null) {
        return
    }
    fetchPlus.put(`/pages/${pageId}`, {
        pageContent: JSON.stringify({
            columns,
            items,
            totals,
            widths
        })
    })
}, 500)

let dontTriggerSave = true

$: if(items) {
    totals = totals
    Object.keys(totals).forEach(columnName => {
        if(totals[columnName] === '') {
            delete totals[columnName]
        }
    })
    widths = widths
    Object.keys(widths).forEach(columnName => {
        if(widths[columnName] === '') {
            delete widths[columnName]
        }
    })

    if(!dontTriggerSave) {
        savePageContent()
    }

    dontTriggerSave = false
}

function evalulateJS(jsString) {
    try {
        return new Function('items', jsString).call(this, items)
    } catch(e) {
        return 'error evaluating given expression'
    }
}

let undoStackForRemoveRow = []

import defaultKeydownHandlerForContentEditableArea from '../helpers/defaultKeydownHandlerForContentEditableArea.js'

function handleKeysInTD(e, itemIndex, itemColumn) {
    defaultKeydownHandlerForContentEditableArea(e)

    // insert row below
    if(e.ctrlKey && e.key === 'Enter')  {
        let insertObj = {}
        columns.forEach(column => {
            insertObj[column.name] = ''
        })

        items.splice(itemIndex + 1, 0, insertObj)
        items = items

        // move focus to the first cell of the inserted row
        setTimeout(() => {
            let rows = e.target.closest('tbody').querySelectorAll('tr')
            let bottomRow = rows[itemIndex + 1]
            if(typeof bottomRow !== 'undefined') {
                let bottomCell = bottomRow.querySelector('div')
                bottomCell.focus()
            }
        }, 0)
    }

    // remove current row
    if(e.ctrlKey && e.key.toLowerCase() === 'delete') {
        e.preventDefault()

        if(items.length === 1) {
            undoStackForRemoveRow.push({ index: 0, item: JSON.parse(JSON.stringify(items[0])) }) // save undo

            columns.forEach(column => {
                items[0][column.name] = ''
            })

            return
        }

        undoStackForRemoveRow.push({ index: itemIndex, item: items[itemIndex] }) // save undo

        items.splice(itemIndex, 1)
        items = items

        // move focus to the first cell of the row before the removed row
        let tbody = e.target.closest('tbody')
        if(!tbody) { return }
        let rows = tbody.querySelectorAll('tr')
        let bottomRow = rows[itemIndex - 1]
        if(typeof bottomRow !== 'undefined') {
            let bottomCell = bottomRow.querySelector('div')
            bottomCell.focus()
        }
    }

    // move to upper cell
    if(e.key === 'ArrowUp') {
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
        e.preventDefault()
        let rows = e.target.closest('tbody').querySelectorAll('tr')
        let currentColumn = e.target.parentElement.cellIndex
        let bottomRow = rows[e.target.parentElement.parentElement.rowIndex]
        if(typeof bottomRow !== 'undefined') {
            let bottomCell = bottomRow.querySelector('td:nth-of-type(' + (currentColumn + 1) + ') > div')
            bottomCell.focus()
        }
    }
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
    label: ''
}

$: if(showAddColumn) {
    column = {
        name: '',
        label: ''
    }
    cancelEditColumn()
}

function addColumn() {
    let existingColumnNames = columns.map(column => column.name)
    if(existingColumnNames.includes(column.name)) {
        alert('You can\'t use an existing column name')
        return
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
        label: ''
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
                        <th>{column.label}<span class="v-h">{column.label === '' ? column.name : ''}</span></th>
                    {/each}
                </tr>
            </thead>
            <tbody>
                {#each items as item, itemIndex}
                    <tr>
                        {#each columns as column}
                            <td style="width: {widths[column.name]}">
                                {#if pageContentOverride === undefined && viewOnly === false}
                                    <div contenteditable spellcheck="false" bind:innerHTML={item[column.name]} on:keydown={(e) => handleKeysInTD(e, itemIndex, column.name)}></div>
                                {:else}
                                    <div>{@html item[column.name]}</div>
                                {/if}
                            </td>
                        {/each}
                    </tr>
                {/each}
            </tbody>
            {#if Object.keys(totals).length > 0}
                <tr>
                    {#each columns as column}
                        {#if totals.hasOwnProperty(column.name)}
                            <th>{@html evalulateJS(totals[column.name]) }</th>
                        {:else}
                            <th></th>
                        {/if}
                    {/each}
                </tr>
            {/if}
        </table>
    {:else}
        <div class="config" on:click={() => configuration = false}>Exit Configuration</div>

        <div class="config-heading">Columns</div>
        <form on:submit|preventDefault={addColumn}>
            <table class="config-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Label</th>
                    </tr>
                </thead>
                <tbody>
                    {#each columns as column, index}
                        {#if columnToEditReference && columnToEditReference.name === column.name}
                            <tr>
                                <td><input type="text" bind:value={columnToEditCopy.name} use:focus></td>
                                <td><input type="text" bind:value={columnToEditCopy.label}></td>
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
                            <td><input type="text" bind:value={column.label}></td>
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

        <div class="config-heading mt-1em">Totals</div>
        <div class="config-area-font-size">
            {#each columns as column}
                <div>{column.label ? column.label : column.name}</div>
                <div>
                    <textarea value={totals[column.name] ? totals[column.name]: ''} on:input={(e) => totals[column.name] = e.target.value} class="w-100p"></textarea>
                </div>
            {/each}
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
    {/if}
</div>

<style>
.pos-r {
    position: relative;
}

.config {
    position: absolute;
    right: 24px;
    top: -47px;
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

.mt-1em {
    margin-top: 1em;
}

.w-100p {
    width: 100%;
}

.config-area-font-size, table.config-table {
    font-size: 16px;
}

.config-area-font-size textarea, .config-area-font-size input {
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
    margin-bottom: 2em;
}
</style>
