// In-page replacements for alert(), confirm() and prompt(). The native ones
// freeze the page while they are open, which also stalls browser automation,
// and they cannot be styled or carry a password field.
//
// Each returns a promise, so a caller awaits the answer:
//   await showAlert('Saved')
//   if (await showConfirm('Delete this page?')) ...
//   const name = await showPrompt('Page name:', current)   // null when cancelled
//
// One dialog shows at a time. A second request waits its turn.

import { get, writable } from 'svelte/store'
import DialogHost from '../components/DialogHost.svelte'

export const dialogQueue = writable([])
export const banner = writable(null)

let host = null

function ensureHost() {
    if (!host) host = new DialogHost({ target: document.body })
}

function open(dialog) {
    ensureHost()
    // The same notice asked for again while it is still waiting, by a script
    // that runs once per table cell say, is shown once.
    const waiting = dialog.kind === 'alert' && get(dialogQueue).find((item) => item.kind === 'alert' && item.message === dialog.message)
    if (waiting) return waiting.answered
    let resolve
    const answered = new Promise((resolvePromise) => (resolve = resolvePromise))
    dialogQueue.update((queue) => [...queue, { ...dialog, resolve, answered }])
    return answered
}

/** Called by the host when the dialog on show has its answer. */
export function closeDialog(dialog, answer) {
    dialogQueue.update((queue) => queue.filter((item) => item !== dialog))
    dialog.resolve(answer)
}

export const showAlert = (message, options = {}) =>
    open({ kind: 'alert', message, confirmLabel: 'OK', ...options })

/** Resolves to true or false. `danger` styles the confirming button as one that destroys something. */
export const showConfirm = (message, options = {}) =>
    open({ kind: 'confirm', message, confirmLabel: 'OK', cancelLabel: 'Cancel', ...options })

/** Resolves to the text entered, or null when cancelled, as prompt() does. `type` can be 'password'. */
export const showPrompt = (message, defaultValue = '', options = {}) =>
    open({ kind: 'prompt', message, defaultValue: defaultValue ?? '', confirmLabel: 'OK', cancelLabel: 'Cancel', type: 'text', ...options })

/** A notice that stays at the top of the window until it is replaced or cleared. */
export function showBanner(message, { actionLabel = null, onAction = null } = {}) {
    ensureHost()
    banner.set({ message, actionLabel, onAction })
}

export const clearBanner = () => banner.set(null)
