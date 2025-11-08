<script>
export let pageId = null
export let viewOnly = false
export let pageContentOverride = undefined
export let style = ''

let pageContent = ''

$: if (pageContentOverride !== undefined) {
    pageContent = pageContentOverride
}

$: fetchPage(pageId)

import fetchPlus from '../../helpers/fetchPlus.js'
let pageContainer

import { tick } from 'svelte'

let loaded = false

function fetchPage(pageId) {
    if (pageId) {
        fetchPlus.get(`/pages/content/${pageId}`).then((response) => {
            pageContent = response.content
            loaded = true
            if (!viewOnly) {
                tick().then(() => {
                    pageContainer.focus()
                    document.execCommand('selectAll', false, null)
                    try {
                        document.getSelection().collapseToEnd()
                    } catch (e) {}

                    const scrollContainerParent = document.querySelector(
                        'main.journal-page > .journal-page-entries',
                    )

                    let scrollContainer = scrollContainerParent?.querySelector(
                        'div > main.journal-page > .journal-page-entries',
                    )

                    if (!scrollContainer) {
                        scrollContainer = scrollContainerParent
                    }

                    const paddingBottom =
                        5.4 *
                        parseFloat(getComputedStyle(scrollContainer).fontSize)
                    scrollContainer.scrollTop =
                        scrollContainer.scrollHeight + paddingBottom
                })
            }
        })
    }
}

import debounce from '../../helpers/debounce.js'

const savePageContent = debounce(function () {
    fetchPlus
        .put(`/pages/${pageId}`, {
            pageContent,
        })
        .catch(() => {
            alert('Page Save Failed')
        })
}, 500)

import defaultKeydownHandlerForContentEditableArea from '../../helpers/defaultKeydownHandlerForContentEditableArea.js'

function handleKeysInPageContainer(e) {
    defaultKeydownHandlerForContentEditableArea(e)
    saveCursorPosition()

    if (e.ctrlKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        insertFileModalLinkLabel = window.getSelection().toString() // prefill selected text, so that you can convert selected text to a link to an upload file
        showInsertFileModal = true
    }

    // add 4 spaces when pressing tab instead of its default behavior
    if (e.key === 'Tab') {
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

function handlePaste(event) {
    var items = (event.clipboardData || event.originalEvent.clipboardData).items
    // find pasted image among pasted items
    var blob = null
    for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') === 0) {
            blob = items[i].getAsFile()
        }
    }
    // load image if there is a pasted image
    if (blob !== null) {
        event.preventDefault()

        document.execCommand(
            'insertHTML',
            false,
            `<img class="upload-image-loader" style="max-width: 100%" src="/images/loader-rainbow-dog.gif">`,
        )

        var data = new FormData()
        data.append('image', blob)

        fetch(`${baseURL}/upload-image/${pageId}`, {
            method: 'POST',
            body: data,
            headers: { Token: localStorage.getItem('token') },
            credentials: 'include',
        })
            .then((response) => response.json())
            .then((response) => {
                const img = document.createElement('img')
                img.style.maxWidth = '100%'
                img.loading = 'lazy'
                img.src = `${baseURL}/${response.imageUrl}`
                const loader = document.querySelector('.upload-image-loader')
                loader.replaceWith(img)
                const range = document.createRange()
                range.setStartAfter(img)
                range.setEndAfter(img)
                const selection = window.getSelection()
                selection.removeAllRanges()
                selection.addRange(range)

                // Trigger input event to update pageContent and save
                pageContainer.dispatchEvent(new Event('input'))
            })
    }

    // on a plain text paste, detect links, show confirmation and if yes, convert the
    // detected links to links before the pasted text is inserted into the page
    if (event.clipboardData.types.includes('text/plain')) {
        const text = event.clipboardData.getData('text/plain')
        const linksRegex = /(https?:\/\/[^\s]+)/g
        const links = text.match(linksRegex)
        if (links && links.length > 0) {
            if (
                confirm(
                    `Do you want to convert ${links.length} links to clickable links?`,
                )
            ) {
                event.preventDefault()

                let html = text
                    .split('\n')
                    .map((line) => {
                        return line.replace(
                            linksRegex,
                            '<a href="$1" target="_blank" contenteditable="false">$1</a>',
                        )
                    })
                    .join('<br>')

                if (text.endsWith('\n')) {
                    html += '<br>'
                }

                document.execCommand('insertHTML', false, html)
            }
        }
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
    {#if loaded === false}
        <div class="page-container" {style}>Loading...</div>
    {:else}
        <div
            class="page-container"
            contenteditable
            bind:innerHTML={pageContent}
            on:keydown={(e) => handleKeysInPageContainer(e)}
            spellcheck="false"
            on:input={onInput}
            bind:this={pageContainer}
            on:paste={handlePaste}
            {style}
        ></div>
    {/if}
{:else}
    <div class="page-container view-only" {style}>{@html pageContent}</div>
{/if}

{#if showInsertFileModal}
    <InsertFileModal
        bind:pageId
        bind:savedCursorPosition
        bind:contentEditableDivToFocus={pageContainer}
        bind:insertFileModalLinkLabel
        bind:showInsertFileModal
    ></InsertFileModal>
{/if}

<style>
.page-container {
    outline: 0;
    height: 100%;
    word-break: break-word;
}

.page-container::after {
    content: '';
    display: block;
    height: 5.4em;
    cursor: text;
}

.page-container.view-only::after {
    cursor: default;
}
</style>
