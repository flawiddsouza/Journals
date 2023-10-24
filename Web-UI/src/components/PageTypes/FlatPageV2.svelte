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

let loaded = false

function fetchPage(pageId) {
    if(pageId) {
        fetchPlus.get(`/pages/content/${pageId}`).then(response => {
            pageContent = JSON.parse(response.content)
            loaded = true
        })
    }
}

import debounce from '../../helpers/debounce.js'

const savePageContent = debounce(function() {
    fetchPlus.put(`/pages/${pageId}`, {
        pageContent: JSON.stringify(pageContent)
    }).catch(() => {
        alert('Page Save Failed')
    })
}, 500)

let showInsertFileModal = false
let insertFileModalLinkLabel = ''
let savedCursorPosition = null

import { baseURL } from '../../../config.js'

function handlePaste(event) {
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

    // on a plain text paste, detect links, show confirmation and if yes, convert the
    // detected links to links before the pasted text is inserted into the page
    if(event.clipboardData.types.includes('text/plain')) {
        const text = event.clipboardData.getData('text/plain')
        const linksRegex = /(https?:\/\/[^\s]+)/g
        const links = text.match(linksRegex)
        if (links && links.length > 0) {
            if(confirm(`Do you want to convert ${links.length} links to clickable links?`)) {
                event.preventDefault()
                const html = text.replace(linksRegex, '<a href="$1" target="_blank" contenteditable="false">$1</a>')
                .replaceAll('\n', '<br>')
                document.execCommand('insertHTML', false, html)
            }
        }
    }
}

function saveCursorPosition() {
    savedCursorPosition = window.getSelection().getRangeAt(0)
}

import { onDestroy } from 'svelte'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Paragraph from '@tiptap/extension-paragraph'
import { mergeAttributes } from '@tiptap/core'
import { generateHTML } from '@tiptap/html'

const extensions = [
    StarterKit.configure({
        paragraph: false,
    }),
    // From: https://github.com/ueberdosis/tiptap/issues/291#issuecomment-867346201
    Paragraph.extend({
        parseHTML() {
            return [{ tag: 'div' }]
        },
        renderHTML({ HTMLAttributes }) {
            return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
        },
    }),
]

let editor

function pageContainerMounted(element) {
    pageContainer = element

    editor = new Editor({
        element: element,
        extensions,
        content: pageContent,
        onTransaction() {
            // force re-render so `editor.isActive` works as expected
            editor = editor
        },
        onUpdate() {
            pageContent = editor.getJSON()
            savePageContent()
        }
    })

    editor.commands.focus('end')

    const scrollContainer = document.querySelector('main.journal-page')
    scrollContainer.scrollTop = scrollContainer.scrollHeight
}

/*
    getPageContentHTML makes generateHTML output the same html structure as prosemirror

    Example:

    input json:
    [
        {"type":"paragraph","content":[{"type":"text","text":"cat"}]},
        {"type":"paragraph"},
        {"type":"paragraph"},
        {"type":"paragraph","content":[{"type":"hardBreak"},{"type":"hardBreak"},{"type":"hardBreak"},{"type":"hardBreak"},{"type":"hardBreak"},{"type":"hardBreak"},{"type":"hardBreak"}]},
        {"type":"paragraph"},
        {"type":"paragraph","content":[{"type":"text","text":"cat"}]}
    ]

    promemirror outputs:
    <div>cat</div>
    <div><br class="ProseMirror-trailingBreak"></div>
    <div><br class="ProseMirror-trailingBreak"></div>
    <div><br><br><br><br><br><br><br><br class="ProseMirror-trailingBreak"></div>
    <div><br class="ProseMirror-trailingBreak"></div>
    <div>cat</div>

    generateHTML outputs:
    <div>cat</div>
    <div></div>
    <div></div>
    <div><br><br><br><br><br><br><br></div>
    <div></div>
    <div>cat</div>

    our below modification outputs the same dom structure as prosemirror sans the "ProseMirror-trailingBreak" class:
    <div>cat</div>
    <div><br></div>
    <div><br></div>
    <div><br><br><br><br><br><br><br><br></div>
    <div><br></div>
    <div>cat</div>
*/
function getPageContentHTML() {
    const pageContentCopy = JSON.parse(JSON.stringify(pageContent))

    pageContentCopy.content.forEach(block => {
        if('content' in block) {
            const hardBreakIndexes = []

            block.content?.forEach((content, index) => {
                if(content.type === 'hardBreak') {
                    hardBreakIndexes.push(index)
                }
            })

            if(hardBreakIndexes.length > 0) {
                block.content.splice(hardBreakIndexes[hardBreakIndexes.length - 1],  0, { type: 'hardBreak' })
            }
        } else {
            if(block.type === 'paragraph') {
                block.content = [{ type: 'hardBreak' }]
            }
        }
    })

    return generateHTML(pageContentCopy, extensions)
}

$: pageContentParsed = pageContent ? getPageContentHTML() : ''

onDestroy(() => {
    if (editor) {
        editor.destroy()
    }
})

import InsertFileModal from '../Modals/InsertFileModal.svelte'
</script>

{#if pageContentOverride === undefined && viewOnly === false}
    {#if loaded === false}
        <div class="page-container" style="{style}">Loading...</div>
    {:else}
        <div class="page-container" spellcheck="false" style="{style}" use:pageContainerMounted></div>
    {/if}
{:else}
    <div class="page-container view-only" style="{style}">{@html pageContentParsed}</div>
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
    height: 100%;
}

.page-container.view-only {
    padding-bottom: 5.4em;
}

.page-container > :global(.ProseMirror) {
    height: 100%;
    padding-bottom: 5.4em;
    outline: none;
}
</style>
