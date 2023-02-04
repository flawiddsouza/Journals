<script>
export let pageId = null
export let viewOnly = false
export let pageContentOverride = undefined

let pageContent = ''

$: if(pageContentOverride !== undefined) {
    pageContent = pageContentOverride
}

$: fetchPage(pageId)

import fetchPlus from '../../helpers/fetchPlus.js'
let iframe

import { tick } from 'svelte'

function fetchPage(pageId) {
    if(pageId) {
        fetchPlus.get(`/pages/content/${pageId}`).then(response => {
            pageContent = response.content
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

import { onMount } from 'svelte'

function receive(event) {
    const message = JSON.parse(event.data)

    // load data
    if (message.event == 'init') {
        iframe.contentWindow.postMessage(
            JSON.stringify({
                action: 'load',
                xml: pageContent,
                autosave: true
            }),
            '*'
        )
    }

    // autosave
    else if (message.event === 'autosave') {
        pageContent = message.xml
        savePageContent()
    }
}

onMount(() => {
    window.addEventListener('message', receive)

    return () => {
        window.removeEventListener('message', receive)
    }
})

function getViewerJSON(xml) {
    return JSON.stringify({
        xml
    })
}
</script>

{#if pageContentOverride === undefined && viewOnly === false}
    <div class="page-container-drawio">
        <iframe title="Title" src="https://embed.diagrams.net/?proto=json&spin=1&libraries=1&saveAndExit=0&noSaveBtn=1&noExitBtn=1" bind:this={iframe}></iframe>
    </div>
{:else}
    <div class="page-container-drawio">
        <div class="mxgraph" style="max-width:100%; border:1px solid transparent;" data-mxgraph={getViewerJSON(pageContent)}></div>
        <script type="text/javascript" src="https://viewer.diagrams.net/js/viewer-static.min.js"></script>
    </div>
{/if}

<style>
.page-container-drawio {
    outline: 0;
    height: 100%;
    word-break: break-word;
    padding-bottom: 0.3rem;
}

.page-container-drawio > iframe {
    border: 0;
    width: 100%;
    height: 100%
}
</style>
