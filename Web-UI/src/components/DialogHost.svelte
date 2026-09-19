<script>
// Shows whatever helpers/dialogs.js has queued. Mounted once, by that helper.
import { tick } from 'svelte'
import { banner, closeDialog, dialogQueue } from '../helpers/dialogs.js'

let current = null
let value = ''
let input = null
let confirmButton = null
let focusedBefore = null

$: show($dialogQueue[0] ?? null)

async function show(dialog) {
    if (dialog === current) return
    if (!current) focusedBefore = document.activeElement
    current = dialog
    if (!dialog) {
        // Back to where the person was: an editor keeps its caret that way.
        const back = focusedBefore
        focusedBefore = null
        if (back && back.isConnected && typeof back.focus === 'function') back.focus()
        return
    }
    value = dialog.kind === 'prompt' ? dialog.defaultValue : ''
    await tick()
    if (input) {
        input.focus()
        input.select()
    } else if (confirmButton) {
        confirmButton.focus()
    }
}

function confirm() {
    if (!current) return
    closeDialog(current, current.kind === 'prompt' ? value : current.kind === 'confirm' ? true : undefined)
}

function cancel() {
    if (!current) return
    closeDialog(current, current.kind === 'prompt' ? null : current.kind === 'confirm' ? false : undefined)
}

// In the capture phase, and stopped there, so a modal underneath does not also
// close on the same Escape.
function onKey(event) {
    if (!current || event.key !== 'Escape') return
    event.stopPropagation()
    event.preventDefault()
    if (event.type === 'keyup') cancel()
}
</script>

<svelte:document on:keydown|capture={onKey} on:keyup|capture={onKey} />

{#if $banner}
    <div class="app-banner" role="status">
        <span>{$banner.message}</span>
        {#if $banner.actionLabel}
            <button class="btn" on:click={() => $banner.onAction && $banner.onAction()}>{$banner.actionLabel}</button>
        {/if}
    </div>
{/if}

{#if current}
    <div class="app-dialog-background"></div>
    <div class="app-dialog-container">
        <form
            class="app-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-describedby="app-dialog-message"
            on:submit|preventDefault={confirm}
        >
            <div id="app-dialog-message" class="app-dialog-message">{current.message}</div>
            {#if current.kind === 'prompt'}
                {#if current.type === 'password'}
                    <input class="input w-100p mt-1em" type="password" autocomplete="off" aria-label={current.message} bind:value bind:this={input} />
                {:else}
                    <input class="input w-100p mt-1em" type="text" autocomplete="off" aria-label={current.message} bind:value bind:this={input} />
                {/if}
            {/if}
            <div class="app-dialog-actions">
                {#if current.kind !== 'alert'}
                    <button type="button" class="btn app-dialog-cancel" on:click={cancel}>{current.cancelLabel}</button>
                {/if}
                <button type="submit" class={current.danger ? 'btn-danger app-dialog-confirm' : 'btn app-dialog-confirm'} bind:this={confirmButton}>
                    {current.confirmLabel}
                </button>
            </div>
        </form>
    </div>
{/if}

<style>
.app-dialog-background {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background-color: rgba(0, 0, 0, 0.4);
}

.app-dialog-container {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    z-index: 1001;
}

.app-dialog {
    box-sizing: border-box;
    width: 26rem;
    max-width: calc(100vw - 32px);
    max-height: calc(100dvh - 40px);
    overflow-y: auto;
    padding: 16px;
    background: var(--bg-section-active);
    color: var(--color-section);
    border: 1px solid var(--border-nb);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.app-dialog-message {
    white-space: pre-line;
    overflow-wrap: anywhere;
    line-height: 1.4;
}

.app-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
}

/* The focused button is the one Enter presses, so it stays marked, in the
   theme's colour instead of the browser's black ring. */
.app-dialog-actions button:focus-visible {
    outline: 2px solid var(--color-tb-link);
    outline-offset: 2px;
}

.app-dialog-cancel {
    background: transparent;
    color: inherit;
    border: 1px solid var(--border-select);
}

.app-dialog-actions :global(.btn-danger) {
    font-size: inherit;
    padding: 0.4em 0.9em;
    opacity: 1;
}

.app-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 999;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 8px 12px;
    background: #fee2e2;
    color: #991b1b;
    border-bottom: 1px solid #fecaca;
    font-size: 0.9rem;
}
</style>
