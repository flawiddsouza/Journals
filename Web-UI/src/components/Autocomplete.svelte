<script>
import { createEventDispatcher } from 'svelte';
export let suggestions = [];
export let position = { top: 0, left: 0 };
export let show = false;

const dispatch = createEventDispatcher();

function selectSuggestion(suggestion) {
    dispatch('select', { suggestion });
}

function handleKeydown(event) {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const suggestions = document.querySelectorAll('.suggestions li');
        let currentIndex = Array.from(suggestions).findIndex(suggestion => suggestion === document.activeElement);
        if (event.key === 'ArrowUp') {
            currentIndex = (currentIndex > 0) ? currentIndex - 1 : suggestions.length - 1;
        } else {
            currentIndex = (currentIndex < suggestions.length - 1) ? currentIndex + 1 : 0;
        }
        suggestions[currentIndex].focus();
    } else if (event.key === 'Enter') {
        event.preventDefault();
        const activeElement = document.activeElement;
        if (activeElement && activeElement.tagName === 'LI') {
            selectSuggestion(activeElement.textContent.trim());
        }
    } else if (event.key === 'Escape') {
        event.preventDefault();
        show = false;
        globalThis.cellFocus.focus();
    }
}
</script>

{#if show}
    <ul class="suggestions" style="top: {position.top}px; left: {position.left}px;" on:keydown={handleKeydown}>
        {#each suggestions as suggestion}
            <li tabindex="0" on:mousedown|preventDefault on:click={() => selectSuggestion(suggestion)}>
                {suggestion}
            </li>
        {/each}
    </ul>
{/if}

<style>
.suggestions {
    position: absolute;
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid #ccc;
    background: #fff;
    max-height: 150px;
    overflow-y: auto;
    z-index: 1000;
}

.suggestions li {
    padding: 5px 10px;
    cursor: pointer;
}

.suggestions li:hover {
    background-color: #f0f0f0;
}
</style>
