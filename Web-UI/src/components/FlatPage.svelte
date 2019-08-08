<script>
export let pageId

let pageContent = ''

$: fetchPage(pageId)

function fetchPage(pageId) {
    [...Array(100).keys()].forEach(iteration => {
        pageContent += `
        <p>
            Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod
            tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam,
            quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
            consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse
            cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non
            proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
        </p>`
    })
}

import defaultKeydownHandlerForContentEditableArea from '../helpers/defaultKeydownHandlerForContentEditableArea.js'

function handleKeysInPageContainer(e) {
    defaultKeydownHandlerForContentEditableArea(e)
}
</script>

<div class="page-container" contenteditable bind:innerHTML={pageContent} on:keydown={(e) => handleKeysInPageContainer(e)} spellcheck="false"></div>

<style>
.page-container {
    outline: 0;
}
</style>
