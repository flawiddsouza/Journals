<script>
export let pageId

let pageContent = ''

$: fetchPage(pageId)

import fetchPlus from '../helpers/fetchPlus.js'
let pageContainer

function fetchPage(pageId) {
    fetchPlus.get(`/pages/content/${pageId}`).then(response => {
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
    fetchPlus.put(`/pages/${pageId}`, {
        pageContent
    })
}, 500)

import defaultKeydownHandlerForContentEditableArea from '../helpers/defaultKeydownHandlerForContentEditableArea.js'

function handleKeysInPageContainer(e) {
    defaultKeydownHandlerForContentEditableArea(e)

    if(e.ctrlKey && e.key.toLowerCase() === 'i') {
        showInsertImageModal = true
    }
}

import Modal from './Modal.svelte'

let showInsertImageModal = false
let image = null
let insertType = 'url'

function focus(element) {
    element.focus()
}

function uploadImage() {
    if(insertType === 'url') {
        pageContainer.focus()
        document.execCommand('insertHTML', false, `<img style="max-width: 50%" src="${image}">`)
    } else if(insertType === 'file') {
        let reader = new FileReader()
        reader.onload = e => {
            pageContainer.focus()
            document.execCommand('insertHTML', false, `<img style="max-width: 50%" src="${e.target.result}">`)
        }
        reader.readAsDataURL(image[0])
    }
    showInsertImageModal = false
}

$: if(showInsertImageModal) {
    image = null
    insertType = 'url'
}

function handleImagePaste(event) {
    var items = (event.clipboardData  || event.originalEvent.clipboardData).items
    // find pasted image among pasted items
    var blob = null
    for(var i = 0; i < items.length; i++) {
        if(items[i].type.indexOf('image') === 0) {
            blob = items[i].getAsFile()
        }
    }
    // load image if there is a pasted image
    if(blob !== null) {
        event.preventDefault()
        let reader = new FileReader()
        reader.onload = e => {
            document.execCommand('insertHTML', false, `<img style="max-width: 50%" src="${e.target.result}">`)
        }
        reader.readAsDataURL(blob)
    }
}
</script>

<div class="page-container" contenteditable bind:innerHTML={pageContent} on:keydown={(e) => handleKeysInPageContainer(e)} spellcheck="false" on:input={savePageContent} bind:this={pageContainer} on:paste={handleImagePaste}></div>

{#if showInsertImageModal}
    <Modal on:close-modal={() => showInsertImageModal = false}>
        <form on:submit|preventDefault={uploadImage}>
            <h2>Insert Image</h2>
            <a href="#from-url" on:click|preventDefault={() => insertType = 'url'} class:td-n={insertType === 'url'}>From URL</a> | <a href="#from-file" on:click|preventDefault={() => insertType = 'file'} class:td-n={insertType === 'file'}>From File</a>
            {#if insertType === 'url'}
                <label class="d-b mt-1em">From URL<br>
                    <input type="text" bind:value={image} required class="w-100p" use:focus>
                </label>
            {:else}
                <label class="d-b mt-1em">From File<br>
                    <input type="file" bind:files={image} required class="w-100p" use:focus>
                </label>
            {/if}
            <button class="w-100p mt-1em">Add</button>
        </form>
    </Modal>
{/if}

<style>
.page-container {
    outline: 0;
}

.d-b {
    display: block;
}

.w-100p {
    width: 100%;
}

.mt-1em {
    margin-top: 1em;
}

.td-n {
    text-decoration: none;
}
</style>
