<script>
export let pageId

let pageContent = ''

$: fetchPage(pageId)

import fetchPlus from '../helpers/fetchPlus.js'

function fetchPage(pageId) {
    fetchPlus.get(`http://localhost:3000/pages/content/${pageId}`).then(response => {
        pageContent = response.content
        if(!pageContent) {
            pageContent = '<p>Enter text here...</p>'
        }
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

<div class="page-container" contenteditable bind:innerHTML={pageContent} on:keydown={(e) => handleKeysInPageContainer(e)} spellcheck="false" on:input={savePageContent}></div>

<style>
.page-container {
    outline: 0;
}
</style>
