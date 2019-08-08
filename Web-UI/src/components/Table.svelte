<script>
export let noteId

let columns = [
	{
		'name': 'date',
		'label': 'Date'
	},
	{
		'name': 'item',
		'label': 'Item'
	},
	{
		'name': 'size',
		'label': ''
	}
]

let items = [
    {
        'id': 1,
        'date': '10-Jul-19',
        'item': 'Test',
        'size': '10 GB'
    },
    {
        'id': 2,
        'date': '11-Jul-19',
        'item': 'Test 2',
        'size': '5.5 GB'
    },
    {
        'id': 3,
        'date': '12-Jul-19',
        'item': 'Test 3',
        'size': '7.7 GB'
    },
    {
        'id': 4,
        'date': '14-Jul-19',
        'item': 'Test 4',
        'size': '9 GB'
    }
]

let totals = {
    'size': `
        return items.reduce((accumulator, item) => accumulator + Number(item.size.replace(' GB', '')), 0) + ' GB'
    `
}

$: if(items) {
    totals = totals
}

function evalulateJS(jsString) {
    return new Function('items', jsString).call(this, items)
}

import { format } from 'date-fns'

function surroundSelection(element) {
    let sel = window.getSelection()
    if(sel.toString() && sel.rangeCount) {
        var range = sel.getRangeAt(0).cloneRange()
        range.surroundContents(element)
        sel.removeAllRanges()
        sel.addRange(range)
    }
}

function handleKeysInTD(e, itemIndex, itemColumn) {
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
    if(e.ctrlKey && e.key.toLowerCase() === 'x') {
        if(items.length === 1) {
            columns.forEach(column => {
                items[0][column.name] = ''
            })
            return
        }
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

    // insert date into the current row
    if(e.altKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        document.execCommand('insertHTML', false, format(new Date(), 'DD-MMM-YY'))
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

    // create hyperlink from selection
    if(e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        let link = prompt('Enter link')
        if(link) {
            let anchorTag = document.createElement('a')
            anchorTag.href = link
            anchorTag.target = '_blank'
            anchorTag.contentEditable = false
            surroundSelection(anchorTag)
            e.target.dispatchEvent(new Event('input')) // trigger input event, so that the change is persisted to the array
        }
    }
}
</script>

<table>
    <thead>
        <tr>
            {#each columns as column}
                <th>{column.label}</th>
            {/each}
        </tr>
    </thead>
    <tbody>
        {#each items as item, itemIndex}
            <tr>
                {#each columns as column}
                    <td>
                        <div contenteditable bind:innerHTML={item[column.name]} on:keydown={(e) => handleKeysInTD(e, itemIndex, column.name)}></div>
                    </td>
                {/each}
            </tr>
        {/each}
    </tbody>
    {#if Object.keys(totals).length > 0}
        <tr>
            {#each columns as column}
                {#if totals.hasOwnProperty(column.name)}
                    <th>{ evalulateJS(totals[column.name]) }</th>
                {:else}
                    <th></th>
                {/if}
            {/each}
        </tr>
    {/if}
</table>

<style>
table {
    border-collapse: collapse;
    font-size: 16px;
}

table th, table td {
    border: 1px solid grey;
    min-width: 3em;
    padding: 2px 5px;
}

table > tbody td {
    padding: 0;
}

table > tbody td > div {
    padding: 2px 5px;
}

table td > div[contenteditable] {
    outline: 0;
}
</style>
