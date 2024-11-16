<script>
import { createEventDispatcher } from 'svelte';
export let suggestions = [];
export let position = { top: 0, left: 0 };
export let show = false;

const dispatch = createEventDispatcher();

function selectSuggestion(suggestion) {
    dispatch('select', { suggestion });
}
</script>

{#if show}
    <ul class="suggestions" style="top: {position.top}px; left: {position.left}px;">
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
