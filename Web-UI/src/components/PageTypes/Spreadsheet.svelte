<script>
export let pageId = null
export let viewOnly = false
export let pageContentOverride = undefined

let pageContent = ''
let pageContainer
let spreadsheet

import { tick } from 'svelte'

$: if(pageContentOverride !== undefined) {
    pageContent = pageContentOverride
    tick().then(() => {
        loadPageContentToSpreadsheet()
    })
}

$: fetchPage(pageId)

import fetchPlus from '../../helpers/fetchPlus.js'
import Spreadsheet from 'x-data-spreadsheet'

function loadPageContentToSpreadsheet() {
    let parsedData = pageContent !== null ? JSON.parse(pageContent) : [{ name: 'Sheet 1' }]

    spreadsheet.loadData(parsedData)
    spreadsheet.sheetIndex = parsedData.length + 1

    if(pageContentOverride === undefined && viewOnly === false) {
        spreadsheet
            .change(() => {
                pageContent = spreadsheet.getData()
                savePageContent()
            })
    }
}

function fetchPage(pageId) {
    if(pageId) {
        fetchPlus.get(`/pages/content/${pageId}`).then(response => {
            pageContent = response.content
            loadPageContentToSpreadsheet()
        })
    }
}

import debounce from '../../helpers/debounce.js'

const savePageContent = debounce(function() {
    fetchPlus.put(`/pages/${pageId}`, {
        pageContent: JSON.stringify(pageContent)
    })
}, 500)

import { onMount } from 'svelte'

onMount(() => {
    spreadsheet = new Spreadsheet(pageContainer, {
        mode: pageContentOverride || viewOnly ? 'read' : 'edit',
        showToolbar: pageContentOverride || viewOnly ? false : true,
        view: {
            height: () => pageContentOverride ? '700' : (pageContainer.parentElement.parentElement.clientHeight - 151),
            width: () => pageContentOverride ? '1200' : pageContainer.parentElement.parentElement.clientWidth
        }
    })
})

</script>

<div bind:this={pageContainer}></div>
