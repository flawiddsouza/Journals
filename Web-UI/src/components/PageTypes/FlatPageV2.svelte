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
import * as encryptionManager from '../../helpers/encryptionManager.js'
let pageContainer

let loaded = false

function fetchPage(pageId) {
    if(pageId) {
        fetchPlus.get(`/pages/content/${pageId}`).then(response => {
            // Check if we have a decrypted version in session
            const decryptedContent = encryptionManager.getPageContent(pageId.toString())

            if (decryptedContent !== null) {
                // Use decrypted content from session
                pageContent = JSON.parse(decryptedContent)
            } else {
                // Use content as-is (either unprotected or encrypted)
                pageContent = JSON.parse(response.content)
            }

            loaded = true
        })
    }
}

import debounce from '../../helpers/debounce.js'

const savePageContent = debounce(async function() {
    try {
        const contentString = JSON.stringify(pageContent)

        // Check if page is encrypted and we have the key
        if (encryptionManager.hasPageKey(pageId.toString())) {
            // Save encrypted content
            const result = await encryptionManager.saveEncryptedContent(pageId.toString(), contentString)
            if (!result.success) {
                alert(result.error || 'Page Save Failed')
            }
        } else {
            // Save unencrypted content normally
            await fetchPlus.put(`/pages/${pageId}`, {
                pageContent: contentString
            })
        }
    } catch (error) {
        console.error('Save error:', error)
        alert('Page Save Failed')
    }
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

                let html = text.split('\n').map(line => {
                    return line.replace(linksRegex, '<a href="$1" target="_blank" contenteditable="false">$1</a>')
                }).join('<br>')

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

import { onDestroy } from 'svelte'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Paragraph from '@tiptap/extension-paragraph'
import { mergeAttributes } from '@tiptap/core'
import { generateHTML } from '@tiptap/html'

const extensions = [
    StarterKit.configure({
        paragraph: false,
        horizontalRule: false,
        blockquote: false,
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
        },
        editorProps: {
            // From: https://github.com/bluesky-social/social-app/pull/6658/files
            clipboardTextParser(text, context) {
                const blocks = text.split(/(?:\r\n?|\n)/)
                const nodes = blocks.map(line => {
                    return Node.fromJSON(
                    context.doc.type.schema,
                    line.length > 0
                        ? {type: 'paragraph', content: [{type: 'text', text: line}]}
                        : {type: 'paragraph', content: []},
                    )
                })

                const fragment = Fragment.fromArray(nodes)
                return Slice.maxOpen(fragment)
            },
        },
    })

    editor.commands.focus('end')

    const scrollContainerParent = document.querySelector('main.journal-page > .journal-page-entries .ProseMirror')

    let scrollContainer = scrollContainerParent?.querySelector('div > main.journal-page > .journal-page-entries .ProseMirror')

    if(!scrollContainer) {
        scrollContainer = scrollContainerParent
    }

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

    const generatedHTML = generateHTML(pageContentCopy, extensions)

    globalThis.generatedHTML = generatedHTML

    return generateHTML
}

$: pageContentParsed = pageContent ? getPageContentHTML() : ''

onDestroy(() => {
    if (editor) {
        editor.destroy()
    }
})

import InsertFileModal from '../Modals/InsertFileModal.svelte'
import { Fragment, Node, Slice } from '@tiptap/pm/model'
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
    overflow: auto;
}

.page-container > :global(.ProseMirror :where(ul, ol)) {
    padding-left: 1rem;
    margin: 0;
}
</style>
