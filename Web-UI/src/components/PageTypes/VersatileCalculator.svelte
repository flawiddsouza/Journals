<script>
export let pageId = null
export let viewOnly = false
export let pageContentOverride = undefined
export let style = ''

import fetchPlus from '../../helpers/fetchPlus.js'
import debounce from '../../helpers/debounce.js'
import Core from './VersatileCalculator/Core.svelte'
import { normalizeSections } from './VersatileCalculator/state.js'

let sections = []
let loaded = false

function parseContent(content) {
    try {
        const parsed = typeof content === 'string' ? JSON.parse(content) : content
        return normalizeSections(parsed ? parsed.sections : null)
    } catch (e) {
        return normalizeSections(null)
    }
}

// Page-history preview: render read-only from an injected content blob.
$: if (pageContentOverride !== undefined) {
    sections = parseContent(pageContentOverride)
    loaded = true
}

function fetchPage(id) {
    fetchPlus
        .get(`/pages/content/${id}`)
        .then((res) => {
            sections = parseContent(res.content)
            loaded = true
        })
        .catch(() => {
            sections = normalizeSections(null)
            loaded = true
        })
}

$: if (pageContentOverride === undefined && pageId) fetchPage(pageId)

const savePageContent = debounce(function () {
    if (pageId === null) return
    fetchPlus
        .put(`/pages/${pageId}`, { pageContent: JSON.stringify({ sections }) })
        .catch(() => alert('Page Save Failed'))
}, 500)
</script>

{#if loaded}
    <Core
        bind:sections
        viewOnly={viewOnly || pageContentOverride !== undefined}
        {style}
        on:change={savePageContent}
    />
{/if}
