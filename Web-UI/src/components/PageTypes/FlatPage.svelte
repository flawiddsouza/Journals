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

import fetchPlus from '../../helpers/fetchPlus.js'
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

import debounce from '../../helpers/debounce.js'

const savePageContent = debounce(function() {
    fetchPlus.put(`/pages/${pageId}`, {
        pageContent
    }).catch(() => {
        alert('Page Save Failed')
    })
}, 500)

import defaultKeydownHandlerForContentEditableArea from '../../helpers/defaultKeydownHandlerForContentEditableArea.js'

function handleKeysInPageContainer(e) {
    defaultKeydownHandlerForContentEditableArea(e)
    saveCursorPosition()

    if(e.ctrlKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        insertFileModalLinkLabel = window.getSelection().toString() // prefill selected text, so that you can convert selected text to a link to an upload file
        showInsertFileModal = true
    }

    // add 4 spaces when pressing tab instead of its default behavior
    if(e.key === 'Tab') {
        e.preventDefault()
        document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;')
    }
}

import Modal from '../Modal.svelte'

let showInsertFileModal = false
let insertFileModalLinkLabel = ''
let savedCursorPosition = null

function focus(element) {
    element.focus()
}

import { baseURL } from '../../../config.js'

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

function saveCursorPosition() {
    savedCursorPosition = window.getSelection().getRangeAt(0)
}

function onInput() {
    savePageContent(event)
}

import InsertFileModal from '../Modals/InsertFileModal.svelte'
</script>

{#if pageContentOverride === undefined && viewOnly === false}
    <div class="page-container" contenteditable bind:innerHTML={pageContent} on:keydown={(e) => handleKeysInPageContainer(e)} spellcheck="false" on:input={onInput} bind:this={pageContainer} on:paste={handleImagePaste} style="{style}"></div>
{:else}
    <div class="page-container" style="{style}">{@html pageContent}</div>
{/if}

{#if showInsertFileModal}
    <InsertFileModal
        bind:pageId={pageId}
        bind:savedCursorPosition={savedCursorPosition}
        bind:contentEditableDivToFocus={pageContainer}
        bind:insertFileModalLinkLabel={insertFileModalLinkLabel}
        bind:showInsertFileModal={showInsertFileModal}
    ></InsertFileModal>
{/if}

<style>
.page-container {
    outline: 0;
    height: 100%;
    word-break: break-word;
}
</style>
