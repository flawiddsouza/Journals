<script>
import fetchPlus from '../../helpers/fetchPlus.js'
import { tick, onDestroy } from 'svelte'
import debounce from '../../helpers/debounce.js'
import MystEditor from '../../libs/MystEditor/MystEditor.js'
import '../../libs/MystEditor/MystEditor.css'
import { marked } from 'marked'

export let pageId = null
export let viewOnly = false
export let pageContentOverride = undefined
export let style = ''

let pageContent = ''
let mystContainer
let mystEditor = null
let loaded = false

$: renderedMarkdown = pageContent ? marked(pageContent) : ''

$: if(pageContentOverride !== undefined) {
    pageContent = pageContentOverride
}

$: fetchPage(pageId)

$: if (loaded && mystContainer && !mystEditor && !viewOnly && pageId) {
    tick().then(() => {
        initializeMystEditor()
    })
}

$: if (viewOnly && mystEditor) {
    destroyMystEditor()
}

function fetchPage(pageId) {
    if(pageId) {
        fetchPlus.get(`/pages/content/${pageId}`).then(response => {
            pageContent = response.content
            loaded = true
        })
    }
}

const savePageContent = debounce(function() {
    fetchPlus.put(`/pages/${pageId}`, {
        pageContent
    }).catch(() => {
        alert('Page Save Failed')
    })
}, 500)

function initializeMystEditor() {
    if (!mystContainer || mystEditor || viewOnly) return

    const state = MystEditor({
        initialText: pageContent,
        mode: 'Both',
        title: '',
        collaboration: {
            enabled: false
        },
        spellcheckOpts: null,
        includeButtons: [],
        topbar: false,
        syncScroll: true,
        backslashLineBreak: true,
        transforms: [],
        customRoles: [],
        customDirectives: []
    }, mystContainer)

    mystEditor = state

    const checkForChanges = () => {
        if (window.myst_editor && window.myst_editor[`myst-editor-${pageId}`]) {
            const currentText = window.myst_editor[`myst-editor-${pageId}`].text
            if (currentText !== pageContent) {
                pageContent = currentText
                savePageContent()
            }
        }
    }

    const changeInterval = setInterval(checkForChanges, 500)

    mystEditor.changeInterval = changeInterval
}

function destroyMystEditor() {
    if (mystEditor) {
        if (mystEditor.changeInterval) {
            clearInterval(mystEditor.changeInterval)
        }
        if (mystEditor.remove) {
            mystEditor.remove()
        }
        mystEditor = null
    }
}

onDestroy(() => {
    destroyMystEditor()
})

$: if (pageContentOverride !== undefined && mystEditor && window.myst_editor && window.myst_editor[`myst-editor-${pageId}`]) {
    const currentText = window.myst_editor[`myst-editor-${pageId}`].text
    if (currentText !== pageContentOverride) {
        const editorView = window.myst_editor[`myst-editor-${pageId}`].main_editor
        if (editorView) {
            editorView.dispatch({
                changes: {
                    from: 0,
                    to: editorView.state.doc.length,
                    insert: pageContentOverride
                }
            })
        }
    }
}
</script>

{#if pageContentOverride === undefined && viewOnly === false}
    {#if loaded === false}
        <div class="page-container" style="{style}">Loading...</div>
    {:else}
        <div class="page-container" style="{style}">
            <div bind:this={mystContainer} class="myst-editor-container"></div>
        </div>
    {/if}
{:else}
    <div class="page-container view-only" style="{style}">
        {@html renderedMarkdown}
    </div>
{/if}

<style>
.page-container {
    outline: 0;
    height: 100%;
}

.page-container::after {
    content: '';
    display: block;
    cursor: text;
}

.page-container.view-only::after {
    cursor: default;
}

.page-container.view-only {
    line-height: 1.5;
}

/* Basic markdown styling for view-only mode */
.page-container.view-only :global(h1),
.page-container.view-only :global(h2),
.page-container.view-only :global(h3),
.page-container.view-only :global(h4),
.page-container.view-only :global(h5),
.page-container.view-only :global(h6) {
    margin-top: 0;
    margin-bottom: 0.5em;
    font-weight: bold;
}

.page-container.view-only :global(p) {
    margin-bottom: 1em;
}

.page-container.view-only :global(ul),
.page-container.view-only :global(ol) {
    margin-bottom: 1em;
    padding-left: 2em;
}

.page-container.view-only :global(blockquote) {
    border-left: 4px solid #ddd;
    padding-left: 1em;
    margin: 1em 0;
    color: #666;
}

.page-container.view-only :global(code) {
    background-color: #f5f5f5;
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-family: monospace;
}

.page-container.view-only :global(pre) {
    background-color: #f5f5f5;
    padding: 1em;
    border-radius: 3px;
    overflow-x: auto;
    margin-bottom: 1em;
}

.page-container.view-only :global(pre code) {
    background: none;
    padding: 0;
}

.myst-editor-container {
    width: 100%;
    height: 100%;
}

/* Override some MystEditor styles to fit better in the page */
:global(.myst-editor-container > div) {
    height: 100% !important;
}

:global(.myst-css-namespace) {
    height: 100% !important;
}
</style>
