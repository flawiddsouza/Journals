<script>
// One command or address to copy, for ConnectMcpModal. Each holds its own
// "Copied", which goes back to "Copy" by itself.
import { onDestroy } from 'svelte'

export let text

let copied = false
let timer = null
let shown = null

async function copy() {
    try {
        await navigator.clipboard.writeText(text)
    } catch {
        // No clipboard access. The text is selected instead, ready for Ctrl+C.
        window.getSelection().selectAllChildren(shown)
        return
    }
    copied = true
    clearTimeout(timer)
    timer = setTimeout(() => (copied = false), 1500)
}

onDestroy(() => clearTimeout(timer))
</script>

<div class="mcp-code">
    <pre bind:this={shown}>{text}</pre>
    <button type="button" class="btn-sm" on:click={copy}>{copied ? 'Copied' : 'Copy'}</button>
</div>

<style>
.mcp-code {
    display: flex;
    align-items: flex-start;
    gap: 0.6em;
    margin-top: 0.4em;
    padding: 0.5em 0.6em;
    background: var(--bg-select);
    border: 1px solid var(--border-select);
    border-radius: 4px;
}

/* Wraps at spaces and never scrolls sideways. A long address, which has no
   spaces, is the one thing allowed to break inside. */
pre {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 0.85em;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

button {
    flex-shrink: 0;
}
</style>
