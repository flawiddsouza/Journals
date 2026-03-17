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

let lastKeyWasBracket = false

function handleKeysInPageContainer(e) {
    // If dropdown is open, route navigation keys to it
    if (pageLinkAnchorRect && pageLinkDropdown) {
        const handled = pageLinkDropdown.handleKeydown(e)
        if (handled) return
        // Any other key: update query or close on backspace past [[
        if (e.key === 'Backspace') {
            if (pageLinkQuery.length > 0) {
                pageLinkQuery = pageLinkQuery.slice(0, -1)
            } else {
                closePageLinkDropdown()
            }
            return
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            pageLinkQuery += e.key
        }
        // let the keystroke fall through to insert the character
    }

    defaultKeydownHandlerForContentEditableArea(e)
    saveCursorPosition()

    if (e.ctrlKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        insertFileModalLinkLabel = window.getSelection().toString()
        showInsertFileModal = true
        return
    }

    if (e.key === 'Tab') {
        e.preventDefault()
        document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;')
        return
    }

    // Detect [[ to open page link dropdown
    if (e.key === '[' && !e.ctrlKey && !e.metaKey) {
        if (lastKeyWasBracket) {
            lastKeyWasBracket = false
            // Second [ typed — open dropdown after this keystroke is processed
            setTimeout(() => openPageLinkDropdown(), 0)
        } else {
            lastKeyWasBracket = true
        }
    } else {
        lastKeyWasBracket = false
    }
}

import Modal from '../Modal.svelte'
import PageLinkDropdown from '../PageLinkDropdown.svelte'

let showInsertFileModal = false
let insertFileModalLinkLabel = ''
let savedCursorPosition = null

// [[ page link state
let pageLinkQuery = ''
let pageLinkAnchorRect = null
let pageLinkDropdown
let pageLinkStartRange = null

function getCaretRect() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    return sel.getRangeAt(0).getBoundingClientRect()
}

function openPageLinkDropdown() {
    pageLinkAnchorRect = getCaretRect()
    pageLinkQuery = ''
    const sel = window.getSelection()
    pageLinkStartRange = sel.getRangeAt(0).cloneRange()
    try {
        pageLinkStartRange.setStart(
            pageLinkStartRange.startContainer,
            Math.max(0, pageLinkStartRange.startOffset - 2)
        )
    } catch(e) {}
}

function closePageLinkDropdown() {
    pageLinkAnchorRect = null
    pageLinkQuery = ''
    pageLinkStartRange = null
}

function insertPageLink(page) {
    const sel = window.getSelection()
    if (!pageLinkStartRange || !sel) return

    const endRange = sel.getRangeAt(0).cloneRange()
    const replaceRange = document.createRange()
    replaceRange.setStart(pageLinkStartRange.startContainer, pageLinkStartRange.startOffset)
    replaceRange.setEnd(endRange.startContainer, endRange.startOffset)

    // Delete [[query text
    replaceRange.deleteContents()

    // Build and insert the <a> element directly (avoids Chrome contenteditable="false" line-break quirk with execCommand insertHTML)
    const a = document.createElement('a')
    a.dataset.pageId = page.id
    a.className = 'page-link'
    a.href = `/page/${page.id}`
    a.target = '_blank'
    a.contentEditable = 'false'
    a.textContent = page.name

    const cursorRange = sel.getRangeAt(0)
    cursorRange.insertNode(a)

    // Move cursor to just after the inserted link
    const afterRange = document.createRange()
    afterRange.setStartAfter(a)
    afterRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(afterRange)

    closePageLinkDropdown()
    pageContainer.dispatchEvent(new Event('input'))
}

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

        fetchPlus.post(`/upload-image/${pageId}`, data)
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

                const sel = window.getSelection()
                if (!sel || sel.rangeCount === 0) return
                const range = sel.getRangeAt(0)
                range.deleteContents()

                const fragment = document.createDocumentFragment()
                text.split('\n').forEach((line, lineIndex) => {
                    if (lineIndex > 0) {
                        fragment.appendChild(document.createElement('br'))
                    }
                    line.split(/(https?:\/\/[^\s]+)/).forEach((part) => {
                        if (/^https?:\/\//.test(part)) {
                            const a = document.createElement('a')
                            a.href = part
                            a.target = '_blank'
                            a.contentEditable = 'false'
                            a.textContent = part
                            fragment.appendChild(a)
                        } else if (part) {
                            fragment.appendChild(document.createTextNode(part))
                        }
                    })
                })
                if (text.endsWith('\n')) {
                    fragment.appendChild(document.createElement('br'))
                }

                const lastNode = fragment.lastChild
                range.insertNode(fragment)

                const afterRange = document.createRange()
                afterRange.setStartAfter(lastNode)
                afterRange.collapse(true)
                sel.removeAllRanges()
                sel.addRange(afterRange)
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

<PageLinkDropdown
    bind:this={pageLinkDropdown}
    query={pageLinkQuery}
    anchorRect={pageLinkAnchorRect}
    on:select={(e) => insertPageLink(e.detail)}
    on:close={closePageLinkDropdown}
/>

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

:global(.page-link) {
    color: #4a6cf7;
    background: rgba(74, 108, 247, 0.08);
    border-radius: 3px;
    padding: 0 2px;
    text-decoration: none;
    cursor: pointer;
}

:global(.page-link:hover) {
    background: rgba(74, 108, 247, 0.16);
}
</style>
