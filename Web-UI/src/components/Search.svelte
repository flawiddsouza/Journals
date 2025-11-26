<script>
import { onMount } from 'svelte'
import Modal from './Modal.svelte'
import debounce from '../helpers/debounce.js'
import fetchPlus from '../helpers/fetchPlus.js'

let isModalOpen = false
let query = ''
let results = []
let highlightedIndex = -1
let searchContent = false

$: fetchResults(query, searchContent)

function openModal() {
    isModalOpen = true
}

function closeModal() {
    isModalOpen = false
    query = ''
    results = []
    highlightedIndex = -1
}

function handleKeyDown(event) {
    if (event.ctrlKey && event.key === 's') {
        event.preventDefault()
        openModal()
    } else if (isModalOpen && event.key === 'ArrowDown') {
        event.preventDefault()
        highlightedIndex = (highlightedIndex + 1) % results.length
    } else if (isModalOpen && event.key === 'ArrowUp') {
        event.preventDefault()
        highlightedIndex =
            (highlightedIndex - 1 + results.length) % results.length
    } else if (
        isModalOpen &&
        event.key === 'Enter' &&
        highlightedIndex !== -1
    ) {
        event.preventDefault()
        navigate()
    }
}

function navigate(event = null) {
    if (event) {
        event.preventDefault()
    }
    const pageId = results[highlightedIndex].id
    // in the future, instead of this we will make this the active page instead of navigating to it
    window.open(`/page/${pageId}`, '_blank')
    closeModal()
}

async function fetchResults(query, searchContent) {
    if (query.length) {
        results = await fetchPlus.post(`/pages/search`, { query, searchContent })
    } else {
        results = []
    }
    if (results.length) {
        highlightedIndex = 0
    } else {
        highlightedIndex = -1
    }
}

onMount(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => {
        window.removeEventListener('keydown', handleKeyDown)
    }
})
</script>

<div>
    {#if isModalOpen}
        <Modal on:close-modal={() => closeModal()}>
            <div
                style="width: 420px; height: 350px; display: grid; align-content: flex-start;"
            >
                <div>
                    <input
                        type="text"
                        bind:value={query}
                        style="width: 100%"
                        autofocus
                    />
                </div>
                <label style="margin-top: 0.5rem; user-select: none; display: flex; align-items: center; gap: 0.3rem;">
                    <input type="checkbox" bind:checked={searchContent} style="margin: 0;" />
                    <span style="font-size: 0.9em;">Search in content</span>
                </label>
                <div style="margin-top: 0.5rem; overflow: auto;">
                    {#if query.length === 0}
                        <div style="margin-top: 0.5rem; text-align: center;">
                            Start typing to search
                        </div>
                    {/if}
                    {#each results as result, resultIndex}
                        <a
                            class="result"
                            class:selected={resultIndex === highlightedIndex}
                            on:mouseover={() =>
                                (highlightedIndex = resultIndex)}
                            href={`/page/${result.id}`}
                            on:click={navigate}
                        >
                            <div>{result.name}</div>
                            <div style="color: darkgrey; font-size: 0.85em;">
                                {result.notebook_name} > {result.section_name}
                            </div>
                            {#if searchContent && result.snippet}
                                <div class="snippet">{@html result.snippet}</div>
                            {/if}
                        </a>
                    {/each}
                </div>
            </div>
        </Modal>
    {/if}
</div>

<style>
.result {
    display: block;
    margin-top: 0.5rem;
    cursor: pointer;
    text-decoration: none;
    color: inherit;
    padding: 0.3rem;
    border-radius: 3px;
}

.result:hover,
.result.selected {
    background-color: #f0f0f0;
}

.snippet {
    color: #666;
    font-size: 0.8em;
    margin-top: 0.2rem;
}

.snippet :global(mark) {
    background-color: #ffeb3b;
    padding: 1px 2px;
    border-radius: 2px;
}
</style>
