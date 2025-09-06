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
import Header from '@editorjs/header';
import edjsHTML from 'editorjs-html'
import { baseURL } from '../../../config.js'

const edjsParser = edjsHTML()

let editor

async function uploadByFile(file) {
    const data = new FormData()
    data.append('image', file)

    const response = await fetch(`${baseURL}/upload-image/${pageId}`, {
        method: 'POST',
        body: data,
        headers: { 'Token': localStorage.getItem('token') }
    }).then(response => response.json())

    return {
        success: 1,
        file: {
            url: baseURL + '/' + response.imageUrl,
            title: file.name,
        }
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
                    }
                }
            },
            image: {
                class: ImageTool,
                config: {
                    uploader: {
                        uploadByFile,
                    }
                }
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
                    colorCollections: ['#EC7878','#9C27B0','#673AB7','#3F51B5','#0070FF','#03A9F4','#00BCD4','#4CAF50','#8BC34A','#CDDC39', '#FFF'],
                    defaultColor: '#FF1300',
                    type: 'text',
                    customPicker: true,
                }
            },
            Marker: {
                class: ColorPlugin,
                config: {
                    colorCollections: ['#EC7878','#9C27B0','#673AB7','#3F51B5','#0070FF','#03A9F4','#00BCD4','#4CAF50','#8BC34A','#CDDC39', '#FFF'],
                    defaultColor: '#FFBF00',
                    type: 'marker',
                    customPicker: true,
                }
            },
            header: {
                class: Header,
                inlineToolbar: true,
            },
        },
        minHeight: '100%',
        onReady() {
            new Undo({ editor })
            new DragDrop(editor)
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
        editor.destroy()
    }
})

import InsertFileModal from '../Modals/InsertFileModal.svelte'
</script>

{#if pageContentOverride === undefined && viewOnly === false}
    {#if loaded === false}
        <div class="page-container loading" style="{style}">Loading...</div>
    {:else}
        <div class="page-container" spellcheck="false" style="{style}" use:pageContainerMounted></div>
    {/if}
{:else}
    <div class="page-container view-only" style="{style}; margin-left: 4.5rem;">{@html pageContentParsed}</div>
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

.page-container :global(.codex-editor), .page-container :global(.codex-editor__redactor) {
    height: 100%;
}

.page-container :global(.codex-editor > .ce-toolbar > .ce-toolbar__content) {
    margin: 0 4rem;
}

.page-container :global(.codex-editor > .codex-editor__redactor > .ce-block .ce-block__content) {
    margin: 0 4.5rem;
}
</style>
