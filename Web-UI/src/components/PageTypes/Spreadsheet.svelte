<script>
export let pageId = null
export let viewOnly = false
export let pageContentOverride = undefined

let pageContent = ''
let pageContainer
let spreadsheet

import { tick } from 'svelte'

$: if(pageContentOverride !== undefined) {
    pageContent = pageContentOverride
    tick().then(() => {
        loadPageContentToSpreadsheet()
    })
}

$: fetchPage(pageId)

import fetchPlus from '../../helpers/fetchPlus.js'
import * as encryptionManager from '../../helpers/encryptionManager.js'
import Spreadsheet from 'x-data-spreadsheet'

function loadPageContentToSpreadsheet() {
    let parsedData = pageContent !== null ? JSON.parse(pageContent) : [{ name: 'Sheet 1' }]

    spreadsheet.loadData(parsedData)
    spreadsheet.sheetIndex = parsedData.length + 1

    if(pageContentOverride === undefined && viewOnly === false) {
        spreadsheet
            .change(() => {
                pageContent = spreadsheet.getData()
                savePageContent()
            })
    }
}

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

            loadPageContentToSpreadsheet()
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

import { onMount } from 'svelte'

onMount(() => {
    spreadsheet = new Spreadsheet(pageContainer, {
        mode: pageContentOverride || viewOnly ? 'read' : 'edit',
        showToolbar: pageContentOverride || viewOnly ? false : true,
        view: {
            height: () => pageContentOverride ? '700' : (pageContainer.parentElement.parentElement.clientHeight - 151),
            width: () => pageContentOverride ? '1200' : pageContainer.parentElement.parentElement.clientWidth
        }
    })
})

</script>

<div bind:this={pageContainer}></div>
