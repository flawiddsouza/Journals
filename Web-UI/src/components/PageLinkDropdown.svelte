<script>
import { createEventDispatcher, onDestroy } from 'svelte'
import fetchPlus from '../helpers/fetchPlus.js'

export let query = ''
export let anchorRect = null // { top, left, width, height } of the trigger element/caret

const dispatch = createEventDispatcher()

let results = []
let selectedIndex = 0
let dropdown

$: if (query !== undefined) {
    search(query)
}

function search(q) {
    selectedIndex = 0
    if (q.length === 0) {
        results = []
        return
    }
    fetchPlus.post('/pages/search', { query: q, searchContent: false }).then((r) => {
        results = r.slice(0, 8)
    })
}

export function handleKeydown(e) {
    if (e.key === 'ArrowDown') {
        e.preventDefault()
        selectedIndex = Math.min(selectedIndex + 1, results.length - 1)
        return true
    }
    if (e.key === 'ArrowUp') {
        e.preventDefault()
        selectedIndex = Math.max(selectedIndex - 1, 0)
        return true
    }
    if (e.key === 'Enter' && results.length > 0) {
        e.preventDefault()
        selectResult(results[selectedIndex])
        return true
    }
    if (e.key === 'Escape') {
        dispatch('close')
        return true
    }
    return false
}

function selectResult(page) {
    dispatch('select', page)
}

let top = 0
let left = 0

$: if (anchorRect) {
    top = anchorRect.bottom + 4
    left = anchorRect.left
}
</script>

{#if anchorRect}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
        class="page-link-dropdown"
        style="top: {top}px; left: {left}px"
        bind:this={dropdown}
    >
        {#if results.length === 0}
            <div class="page-link-dropdown-empty">{query.length === 0 ? 'Type to search for a page...' : 'No pages found'}</div>
        {:else}
            {#each results as result, i}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <div
                    class="page-link-dropdown-item"
                    class:selected={i === selectedIndex}
                    on:mousedown|preventDefault={() => selectResult(result)}
                    on:mouseover={() => (selectedIndex = i)}
                >
                    <span class="page-link-dropdown-name">{result.name}</span>
                    <span class="page-link-dropdown-type">{result.notebook_name} > {result.section_name}</span>
                </div>
            {/each}
        {/if}
    </div>
{/if}

<style>
.page-link-dropdown {
    position: fixed;
    z-index: 9999;
    background: var(--bg-topbar);
    border: 1px solid var(--border-select);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    min-width: 240px;
    max-width: 360px;
    max-height: 280px;
    overflow-y: auto;
}

.page-link-dropdown-empty {
    padding: 8px 12px;
    color: var(--color-utility);
    font-size: 0.9em;
}

.page-link-dropdown-item {
    padding: 6px 12px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
}

.page-link-dropdown-item:hover,
.page-link-dropdown-item.selected {
    background: var(--bg-pa-hover);
    color: var(--color-pa-hover);
}

.page-link-dropdown-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.page-link-dropdown-type {
    font-size: 0.75em;
    color: var(--color-utility);
    flex-shrink: 0;
}
</style>
