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

let loaded = false

function fetchPage(pageId) {
    if (pageId) {
        fetchPlus.get(`/pages/content/${pageId}`).then((response) => {
            pageContent = JSON.parse(response.content)
            loaded = true
        })
    }
}

import debounce from '../../helpers/debounce.js'

const savePageContent = debounce(function () {
    fetchPlus
        .put(`/pages/${pageId}`, {
            pageContent: JSON.stringify(pageContent),
        })
        .catch(() => {
            alert('Page Save Failed')
        })
}, 500)

let showInsertFileModal = false
let insertFileModalLinkLabel = ''
let savedCursorPosition = null

import { onDestroy } from 'svelte'
import EditorJS from '@editorjs/editorjs'
import Table from '@editorjs/table'
import EditorjsList from '@editorjs/list'
import editorJsCodeCup from '@calumk/editorjs-codecup'
import AttachesTool from '@editorjs/attaches'
import ImageTool from '@editorjs/image'
import Underline from '@editorjs/underline'
import Undo from 'editorjs-undo'
import InlineCode from '@editorjs/inline-code'
import DragDrop from 'editorjs-drag-drop'
import Strikethrough from '@sotaproject/strikethrough'
import ToggleBlock from 'editorjs-toggle-block'
import ColorPlugin from 'editorjs-text-color-plugin'
import Header from '@editorjs/header'
import edjsHTML from 'editorjs-html'
import { baseURL } from '../../../config.js'

const edjsParser = edjsHTML()

class PageLinkInlineTool {
    static get isInline() { return true }
    static get sanitize() {
        return {
            a: {
                href: true,
                target: true,
                'data-page-id': true,
                class: true,
                contenteditable: true,
            }
        }
    }
    render() {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.style.display = 'none'
        return btn
    }
    surround() {}
    checkState() { return false }
}

let editor

async function uploadByFile(file) {
    const data = new FormData()
    data.append('image', file)

    const response = await fetchPlus.post(`/upload-image/${pageId}`, data)

    return {
        success: 1,
        file: {
            url: baseURL + '/' + response.imageUrl,
            title: file.name,
        },
    }
}

function pageContainerMounted(element) {
    pageContainer = element

    editor = new EditorJS({
        holder: pageContainer,
        data: pageContent,
        tools: {
            table: {
                class: Table,
                inlineToolbar: true,
            },
            list: {
                class: EditorjsList,
                inlineToolbar: true,
            },
            code: editorJsCodeCup,
            attaches: {
                class: AttachesTool,
                config: {
                    uploader: {
                        uploadByFile,
                    },
                },
            },
            image: {
                class: ImageTool,
                config: {
                    uploader: {
                        uploadByFile,
                    },
                },
            },
            underline: {
                class: Underline,
                shortcut: 'CMD+U',
            },
            inlineCode: InlineCode,
            strikethrough: Strikethrough,
            toggle: {
                class: ToggleBlock,
                inlineToolbar: true,
            },
            Color: {
                class: ColorPlugin,
                config: {
                    colorCollections: [
                        '#EC7878',
                        '#9C27B0',
                        '#673AB7',
                        '#3F51B5',
                        '#0070FF',
                        '#03A9F4',
                        '#00BCD4',
                        '#4CAF50',
                        '#8BC34A',
                        '#CDDC39',
                        '#FFF',
                    ],
                    defaultColor: '#FF1300',
                    type: 'text',
                    customPicker: true,
                },
            },
            Marker: {
                class: ColorPlugin,
                config: {
                    colorCollections: [
                        '#EC7878',
                        '#9C27B0',
                        '#673AB7',
                        '#3F51B5',
                        '#0070FF',
                        '#03A9F4',
                        '#00BCD4',
                        '#4CAF50',
                        '#8BC34A',
                        '#CDDC39',
                        '#FFF',
                    ],
                    defaultColor: '#FFBF00',
                    type: 'marker',
                    customPicker: true,
                },
            },
            header: {
                class: Header,
                inlineToolbar: true,
            },
            pageLink: {
                class: PageLinkInlineTool,
            },
        },
        minHeight: '100%',
        onReady() {
            new Undo({ editor })
            new DragDrop(editor)
            pageContainer.addEventListener('keydown', handlePageLinkKeydown, true)
            loaded = true
            editor.focus(true)
            const scrollContainer = document.querySelector('main.journal-page')
            scrollContainer.scrollTop = scrollContainer.scrollHeight
        },
        async onChange() {
            pageContent = await editor.save()
            savePageContent()
        },
    })
}

function getPageContentHTML() {
    const pageContentCopy = JSON.parse(JSON.stringify(pageContent))

    const parsedPageContent = edjsParser.parse(pageContentCopy)

    globalThis.generatedHTML = parsedPageContent

    return parsedPageContent
}

$: pageContentParsed = pageContent ? getPageContentHTML() : ''

onDestroy(() => {
    if (editor) {
        if (pageContainer) {
            pageContainer.removeEventListener('keydown', handlePageLinkKeydown, true)
        }
        editor.destroy()
    }
})

import InsertFileModal from '../Modals/InsertFileModal.svelte'
import PageLinkDropdown from '../PageLinkDropdown.svelte'

// [[ page link state
let pageLinkQuery = ''
let pageLinkAnchorRect = null
let pageLinkDropdown
let pageLinkStartRange = null
let lastKeyWasBracket = false

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
    lastKeyWasBracket = false
}

function insertPageLink(page) {
    const sel = window.getSelection()
    if (pageLinkStartRange && sel) {
        const endRange = sel.getRangeAt(0).cloneRange()
        const replaceRange = document.createRange()
        replaceRange.setStart(pageLinkStartRange.startContainer, pageLinkStartRange.startOffset)
        replaceRange.setEnd(endRange.startContainer, endRange.startOffset)
        sel.removeAllRanges()
        sel.addRange(replaceRange)
    }
    const markerId = `plm-${Date.now()}`
    document.execCommand('insertHTML', false,
        `<a data-page-id="${page.id}" class="page-link" href="/page/${page.id}" target="_blank" contenteditable="false">${page.name}</a><span id="${markerId}"></span>`)
    const marker = document.getElementById(markerId)
    if (marker) {
        const range = document.createRange()
        range.setStartAfter(marker)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        marker.parentNode.removeChild(marker)
    }
    closePageLinkDropdown()
}

function handlePageLinkKeydown(e) {
    if (pageLinkAnchorRect) {
        if (pageLinkDropdown) {
            const handled = pageLinkDropdown.handleKeydown(e)
            if (handled) {
                e.stopPropagation()
                return
            }
        }
        if (e.key === 'Escape') {
            e.stopPropagation()
            closePageLinkDropdown()
            return
        }
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
        return
    }

    if (e.key === '[' && !e.ctrlKey && !e.metaKey) {
        if (lastKeyWasBracket) {
            lastKeyWasBracket = false
            setTimeout(() => openPageLinkDropdown(), 0)
        } else {
            lastKeyWasBracket = true
        }
    } else {
        lastKeyWasBracket = false
    }
}
</script>

{#if pageContentOverride === undefined && viewOnly === false}
    {#if loaded === false}
        <div class="page-container loading" {style}>Loading...</div>
    {:else}
        <div
            class="page-container"
            spellcheck="false"
            {style}
            use:pageContainerMounted
        ></div>
    {/if}
{:else}
    <div class="page-container view-only" style="{style}; margin-left: 4.5rem;">
        {@html pageContentParsed}
    </div>
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
    height: 100%;
}

.page-container.loading {
    margin: 0 4.5rem;
}

.page-container.view-only {
    padding-bottom: 5.4em;
}

.page-container.view-only > :global(:where(ul, ol)) {
    padding-left: 1rem;
    margin: 0;
}

.page-container :global(.codex-editor) {
    padding-bottom: 5.4em;
}

.page-container :global(.codex-editor),
.page-container :global(.codex-editor__redactor) {
    height: 100%;
}

.page-container :global(.codex-editor > .ce-toolbar > .ce-toolbar__content) {
    margin: 0 4rem;
}

.page-container
    :global(
        .codex-editor > .codex-editor__redactor > .ce-block .ce-block__content
    ) {
    margin: 0 4.5rem;
}
</style>
