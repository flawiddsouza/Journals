<script>
export let pageId = null
export let viewOnly = false
export let pageContentOverride = undefined
export let style = ''

let pageContent = ''

$: if(pageContentOverride !== undefined) {
    pageContent = pageContentOverride
}

$: fetchPage(pageId)

import fetchPlus from '../helpers/fetchPlus.js'
let pageContainer

import { tick } from 'svelte'

function fetchPage(pageId) {
    if(pageId) {
        fetchPlus.get(`/pages/content/${pageId}`).then(response => {
            pageContent = response.content
            if(!viewOnly) {
                tick().then(() => {
                    pageContainer.focus()
                    document.execCommand('selectAll', false, null)
                    try {
                        document.getSelection().collapseToEnd()
                    } catch(e) {}
                    pageContainer.parentElement.parentElement.scrollTop = pageContainer.parentElement.parentElement.scrollHeight
                })
            }
        })
    }
}

import debounce from '../helpers/debounce.js'

const savePageContent = debounce(function() {
    fetchPlus.put(`/pages/${pageId}`, {
        pageContent
    }).catch(() => {
        alert('Page Save Failed')
    })
}, 500)

import defaultKeydownHandlerForContentEditableArea from '../helpers/defaultKeydownHandlerForContentEditableArea.js'

function handleKeysInPageContainer(e) {
    defaultKeydownHandlerForContentEditableArea(e)

    if(e.ctrlKey && e.key.toLowerCase() === 'i') {
        showInsertImageModal = true
    }

    // add 4 spaces when pressing tab instead of its default behavior
    if(e.key === 'Tab') {
        e.preventDefault()
        document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;')
    }
}

import Modal from './Modal.svelte'

let showInsertImageModal = false
let image = null
let insertType = 'url'

function focus(element) {
    element.focus()
}

import { baseURL } from '../../config.js'
import placeCaretAtEnd from '../helpers/placeCaretAtEnd.js'

function uploadImage() {
    showInsertImageModal = false
    if(insertType === 'url') {
        pageContainer.focus()
        document.execCommand('insertHTML', false, `<img style="max-width: 100%" loading="lazy" src="${image}">`)
    } else if(insertType === 'file') {
        pageContainer.focus()
        let imageElement = document.createElement('img')
        imageElement.src = '/images/loader-rainbow-dog.gif'
        imageElement.style.maxWidth = '100%'
        imageElement.loading = 'lazy'
        pageContainer.appendChild(imageElement)
        placeCaretAtEnd(pageContainer)

        var data = new FormData()
        data.append('image', image[0])

        fetch(`${baseURL}/upload-image/${pageId}`, {
            method: 'POST',
            body: data,
            headers: { 'Token': localStorage.getItem('token') }
        }).then(response => response.json()).then(response => {
            imageElement.src = baseURL + '/' + response.imageUrl
            pageContainer.dispatchEvent(new Event('input'))
        })
    }
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

        document.execCommand('insertHTML', false, `<img class="upload-image-loader" style="max-width: 100%" src="/images/loader-rainbow-dog.gif">`)

        var data = new FormData()
        data.append('image', blob)

        fetch(`${baseURL}/upload-image/${pageId}`, {
            method: 'POST',
            body: data,
            headers: { 'Token': localStorage.getItem('token') }
        }).then(response => response.json()).then(response => {
            document.querySelector('.upload-image-loader').remove()
            document.execCommand('insertHTML', false, `<img style="max-width: 100%" loading="lazy" src="${baseURL + '/' + response.imageUrl}">`)
        })
    }
}
</script>

{#if pageContentOverride === undefined && viewOnly === false}
    <div class="page-container" contenteditable bind:innerHTML={pageContent} on:keydown={(e) => handleKeysInPageContainer(e)} spellcheck="false" on:input={savePageContent} bind:this={pageContainer} on:paste={handleImagePaste} style="{style}"></div>
{:else}
    <div class="page-container" style="{style}">{@html pageContent}</div>
{/if}

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
