<script>
import { onMount } from 'svelte'
import Modal from './Modal.svelte'
import debounce from '../helpers/debounce.js'
import fetchPlus from '../helpers/fetchPlus.js'

let isModalOpen = false
let query = ''
let results = []
let highlightedIndex = -1

$: fetchResults(query)

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

async function fetchResults(query) {
    if (query.length) {
        results = await fetchPlus.post(`/pages/search`, { query })
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
                style="width: 420px; height: 250px; display: grid; align-content: flex-start;"
            >
                <div>
                    <input
                        type="text"
                        bind:value={query}
                        style="width: 100%"
                        autofocus
                    />
                </div>
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
                            <div style="color: darkgrey;">
                                {result.notebook_name} > {result.section_name}
                            </div>
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
}

.result:hover,
.result.selected {
    background-color: #f0f0f0;
}
</style>
