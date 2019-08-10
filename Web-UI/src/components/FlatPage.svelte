<script>
export let pageId

let pageContent = ''

$: fetchPage(pageId)

import fetchPlus from '../helpers/fetchPlus.js'
let pageContainer

function fetchPage(pageId) {
    fetchPlus.get(`http://localhost:3000/pages/content/${pageId}`).then(response => {
        pageContent = response.content
        setTimeout(() => {
            pageContainer.focus()
            document.execCommand('selectAll', false, null)
            document.getSelection().collapseToEnd()
        }, 0)
    })
}

import debounce from '../helpers/debounce.js'

const savePageContent = debounce(function() {
    fetchPlus.put(`http://localhost:3000/pages/${pageId}`, {
        pageContent
    })
}, 500)

import defaultKeydownHandlerForContentEditableArea from '../helpers/defaultKeydownHandlerForContentEditableArea.js'

function handleKeysInPageContainer(e) {
    defaultKeydownHandlerForContentEditableArea(e)
}
</script>

<div class="page-container" contenteditable bind:innerHTML={pageContent} on:keydown={(e) => handleKeysInPageContainer(e)} spellcheck="false" on:input={savePageContent} bind:this={pageContainer}></div>

<style>
.page-container {
    outline: 0;
}
</style>
