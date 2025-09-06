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
import * as encryptionManager from '../../helpers/encryptionManager.js'
let iframe

import { tick } from 'svelte'

function fetchPage(pageId) {
    if(pageId) {
        fetchPlus.get(`/pages/content/${pageId}`).then(response => {
            // Check if we have a decrypted version in session
            const decryptedContent = encryptionManager.getPageContent(pageId.toString())

            if (decryptedContent !== null) {
                // Use decrypted content from session
                pageContent = decryptedContent
            } else {
                // Use content as-is (either unprotected or encrypted)
                pageContent = response.content
            }
        })
    }
}

import debounce from '../../helpers/debounce.js'

const savePageContent = debounce(async function() {
    try {
        // Check if page is encrypted and we have the key
        if (encryptionManager.hasPageKey(pageId.toString())) {
            // Save encrypted content
            const result = await encryptionManager.saveEncryptedContent(pageId.toString(), pageContent)
            if (!result.success) {
                alert(result.error || 'Page Save Failed')
            }
        } else {
            // Save unencrypted content normally
            await fetchPlus.put(`/pages/${pageId}`, {
                pageContent
            })
        }
    } catch (error) {
        console.error('Save error:', error)
        alert('Page Save Failed')
    }
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
        {#if pageContent}
            <script type="text/javascript" src="https://viewer.diagrams.net/js/viewer-static.min.js"></script>
        {/if}
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
