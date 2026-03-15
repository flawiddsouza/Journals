<script>
import { createEventDispatcher } from 'svelte'
import fetchPlus from '../helpers/fetchPlus.js'

export let pageId = null

const dispatch = createEventDispatcher()

let links = []
let backlinks = []
let loading = false

$: if (pageId) {
    load(pageId)
}

function load(id) {
    loading = true
    Promise.all([
        fetchPlus.get(`/pages/links/${id}`),
        fetchPlus.get(`/pages/backlinks/${id}`),
    ]).then(([l, b]) => {
        links = l
        backlinks = b
        loading = false
    }).catch(() => {
        loading = false
    })
}
</script>

<div class="backlinks-overlay">
    <div class="backlinks-panel">
        <div class="backlinks-header">
            <span class="backlinks-title">Backlinks</span>
            <button class="backlinks-close" on:click={() => dispatch('close')}>✕</button>
        </div>
        <div class="backlinks-body">
            {#if loading}
                <div class="backlinks-empty">Loading...</div>
            {:else}
                <div class="backlinks-section-title">Referenced by ({backlinks.length})</div>
                {#if backlinks.length === 0}
                    <div class="backlinks-empty">No pages reference this yet.</div>
                {:else}
                    {#each backlinks as link}
                        <a class="backlinks-item" href={`/page/${link.id}`} target="_blank">
                            <span class="backlinks-item-name">{link.name}</span>
                            <span class="backlinks-item-location">{link.notebook_name} > {link.section_name}</span>
                        </a>
                    {/each}
                {/if}
                <div class="backlinks-section-title">References ({links.length})</div>
                {#if links.length === 0}
                    <div class="backlinks-empty">No references.</div>
                {:else}
                    {#each links as link}
                        <a class="backlinks-item" href={`/page/${link.id}`} target="_blank">
                            <span class="backlinks-item-name">{link.name}</span>
                            <span class="backlinks-item-location">{link.notebook_name} > {link.section_name}</span>
                        </a>
                    {/each}
                {/if}
            {/if}
        </div>
    </div>
</div>

<style>
.backlinks-overlay {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    pointer-events: none;
    display: flex;
    justify-content: flex-end;
}

.backlinks-panel {
    pointer-events: all;
    width: 300px;
    height: 100%;
    background: var(--bg-topbar);
    border-left: 1px solid var(--border-sidebar);
    box-shadow: -4px 0 12px rgba(0,0,0,0.08);
    display: flex;
    flex-direction: column;
}

.backlinks-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-topbar);
    user-select: none;
}

.backlinks-title {
    font-weight: 600;
    font-size: 0.95em;
}

.backlinks-close {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1em;
    color: var(--color-utility);
    padding: 2px 6px;
    border-radius: 3px;
}

.backlinks-close:hover {
    background: var(--bg-utility-hover);
}

.backlinks-body {
    flex: 1;
    overflow-y: auto;
}

.backlinks-section-title {
    padding: 6px 16px;
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-section);
    background: var(--bg-nb-header);
    border-bottom: 1px solid var(--border-topbar);
}

.backlinks-empty {
    padding: 10px 16px;
    color: var(--color-section);
    opacity: 0.6;
    font-size: 0.9em;
}

.backlinks-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border-topbar);
    text-decoration: none;
    color: inherit;
}

.backlinks-item:hover {
    background: var(--bg-pa-hover);
}

.backlinks-item-name {
    font-size: 0.9em;
    font-weight: 500;
}

.backlinks-item-location {
    font-size: 0.75em;
    color: var(--color-section);
    opacity: 0.6;
}
</style>
