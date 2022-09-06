<script>
import Modal from '../Modal.svelte'
import { createLoader } from '../../helpers/loader.js'
import { restoreCursorPosition, insertElementAtCursor } from '../../helpers/cursorHelpers.js'
import { createEventDispatcher } from 'svelte'
import { baseURL } from '../../../config.js'

export let pageId = null
export let savedCursorPosition = null
export let contentEditableDivToFocus = null
export let showInsertFileModal = false
export let insertFileModalLinkLabel = ''

let insertFileModalFile = null
let insertFileModalType = 'file'

function uploadFile() {
    showInsertFileModal = false
    contentEditableDivToFocus.focus()
    restoreCursorPosition(savedCursorPosition)

    if(insertFileModalType === 'url') {
        if(insertFileModalLinkLabel === '') {
            document.execCommand('insertHTML', false, `<img style="max-width: 100%" loading="lazy" src="${insertFileModalFile}">`)
        } else {
            document.execCommand('insertHTML', false, `<a href="${insertFileModalFile}" target="_blank" contenteditable="false">${insertFileModalLinkLabel}</a>`)
        }

        insertFileModalFile = null
        insertFileModalLinkLabel = ''
    } else if(insertFileModalType === 'file') {
        const loader = createLoader()

        var data = new FormData()
        data.append('image', insertFileModalFile[0])

        fetch(`${baseURL}/upload-image/${pageId}`, {
            method: 'POST',
            body: data,
            headers: { 'Token': localStorage.getItem('token') }
        }).then(response => response.json()).then(response => {
            loader.remove()
            if(insertFileModalLinkLabel === '') {
                document.execCommand('insertHTML', false, `<img style="max-width: 100%" loading="lazy" src="${baseURL + '/' + response.imageUrl}">`)
            } else {
                let anchorTag = document.createElement('a')
                anchorTag.href = baseURL + '/' + response.imageUrl
                anchorTag.target = '_blank'
                anchorTag.contentEditable = false
                anchorTag.textContent = insertFileModalLinkLabel
                insertElementAtCursor(anchorTag)
                contentEditableDivToFocus.dispatchEvent(new Event('input'))
            }

            insertFileModalFile = null
            insertFileModalLinkLabel = ''
        })
    }
}

function focus(element) {
    element.focus()
}
</script>

<Modal on:close-modal={() => showInsertFileModal = false}>
    <form on:submit|preventDefault={uploadFile}>
        <h2>Insert File</h2>
        <a href="#from-url" on:click|preventDefault={() => insertFileModalType = 'url'} class:td-n={insertFileModalType === 'url'}>From URL</a> | <a href="#from-file" on:click|preventDefault={() => insertFileModalType = 'file'} class:td-n={insertFileModalType === 'file'}>From File</a>
        {#if insertFileModalType === 'url'}
            <label class="d-b mt-1em">From URL<br>
                <input type="text" bind:value={insertFileModalFile} required class="w-100p" use:focus>
            </label>
        {:else}
            <label class="d-b mt-1em">From File<br>
                <input type="file" bind:files={insertFileModalFile} required class="w-100p" use:focus>
            </label>
        {/if}
        <label class="d-b mt-1em">Link Label<br>
            <input type="text" bind:value={insertFileModalLinkLabel} class="w-100p">
        </label>
        <div style="width: 16rem; margin-top: 0.3rem">If link label is provided, inserted file will be inserted as a link instead of a image.</div>
        <button class="w-100p mt-1em">Add</button>
    </form>
</Modal>

<style>
.td-n {
    text-decoration: none;
}

.d-b {
    display: block;
}

.mt-1em {
    margin-top: 1em;
}

.w-100p {
    width: 100%;
}
</style>
