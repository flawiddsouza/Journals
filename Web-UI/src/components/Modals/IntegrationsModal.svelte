<script>
// The services a Table's pull script or a Mini App can call by name. The
// secret headers are saved in the API and never read back, so editing one
// shows only that it is set.
import Modal from '../Modal.svelte'
import { showConfirm } from '../../helpers/dialogs.js'
import {
    apiError,
    createIntegration,
    deleteIntegration,
    listIntegrations,
    revokeIntegration,
    updateIntegration,
} from '../../helpers/integrations.js'

let integrations = null
let error = ''
// The integration being edited: { id, name, baseUrl, headers: [{ name, value, saved }] }.
// id is null for a new one.
let draft = null
let formError = ''
let saving = false

async function load() {
    try {
        integrations = await listIntegrations()
        error = ''
    } catch {
        error = "Couldn't load your integrations."
    }
}

load()

function startAdding() {
    formError = ''
    draft = { id: null, name: '', baseUrl: '', headers: [{ name: 'Authorization', value: '', saved: false }] }
}

function startEditing(integration) {
    formError = ''
    draft = {
        id: integration.id,
        name: integration.name,
        baseUrl: integration.baseUrl,
        headers: integration.headerNames.map((name) => ({ name, value: '', saved: true })),
    }
}

async function save() {
    const headers = {}
    for (const header of draft.headers) {
        const name = header.name.trim()
        if (!name) continue
        // A saved value left blank stays as it is.
        headers[name] = header.saved && header.value === '' ? null : header.value
    }
    const body = { name: draft.name, baseUrl: draft.baseUrl, headers }
    saving = true
    try {
        if (draft.id === null) await createIntegration(body)
        else await updateIntegration(draft.id, body)
        draft = null
        await load()
    } catch (failure) {
        formError = (await apiError(failure, "Couldn't save the integration.")).message
    } finally {
        saving = false
    }
}

async function remove(integration) {
    const yes = await showConfirm(
        `Delete the integration "${integration.name}"?\n\nIt goes to the Recycle Bin, and its saved headers stay there until you empty the bin. Pull scripts and Mini Apps that call it fail until you restore it. Your pages are not changed.`,
        { confirmLabel: 'Delete', danger: true },
    )
    if (!yes) return
    try {
        await deleteIntegration(integration.id)
    } catch {
        error = `Couldn't delete "${integration.name}".`
        return
    }
    await load()
}

async function disallow(integration, grant) {
    try {
        await revokeIntegration(grant.pageId, integration.id)
    } catch {
        error = `Couldn't take "${integration.name}" away from ${grant.pageName}.`
        return
    }
    await load()
}
</script>

<Modal width="40rem" on:close-modal>
    <h2 class="heading">Integrations</h2>
    <p class="int-intro">
        An integration saves a service's address and the headers it needs, such as an API token.
        A Table's pull script and a Mini App call it by name. The header values stay on the server and are not shown again.
    </p>

    {#if error}
        <div class="red" role="alert">{error}</div>
    {/if}

    {#if draft}
        <form class="int-form" on:submit|preventDefault={save}>
            <label class="int-field">
                <span>Name</span>
                <!-- svelte-ignore a11y-autofocus -->
                <input class="input" bind:value={draft.name} placeholder="GitHub" autofocus required />
            </label>
            <label class="int-field">
                <span>Base address</span>
                <input class="input" bind:value={draft.baseUrl} placeholder="https://api.github.com" required />
            </label>
            <div class="int-field">
                <span>Headers</span>
                {#each draft.headers as header, index}
                    <div class="int-header">
                        <input class="input" bind:value={header.name} placeholder="Header name" aria-label="Header name" />
                        <input
                            class="input"
                            type="password"
                            autocomplete="off"
                            bind:value={header.value}
                            placeholder={header.saved ? 'Saved. Type to replace it.' : 'Value, such as Bearer <token>'}
                            aria-label="Header value"
                        />
                        <button
                            type="button"
                            class="btn-danger"
                            on:click={() => (draft.headers = draft.headers.filter((_, i) => i !== index))}>Remove</button
                        >
                    </div>
                {/each}
                <button
                    type="button"
                    class="int-link int-add-header"
                    on:click={() => (draft.headers = [...draft.headers, { name: '', value: '', saved: false }])}>Add a header</button
                >
            </div>
            {#if formError}
                <div class="red" role="alert">{formError}</div>
            {/if}
            <div class="int-actions">
                <button type="submit" class="btn" disabled={saving}>{draft.id === null ? 'Add integration' : 'Save'}</button>
                <button type="button" class="btn-sm int-secondary" on:click={() => (draft = null)}>Cancel</button>
            </div>
        </form>
        <details class="int-example">
            <summary>Example: GitHub</summary>
            <ol>
                <li>Create a token at github.com, under Settings, Developer settings, Personal access tokens.</li>
                <li>Name: <code>GitHub</code>. Base address: <code>https://api.github.com</code>.</li>
                <li>Header <code>Authorization</code> with the value <code>Bearer</code> followed by a space and the token.</li>
                <li>In a pull script: <code>await integration('GitHub').get('/user/repos')</code></li>
            </ol>
        </details>
    {:else}
        {#if integrations && !integrations.length}
            <p class="int-dim">No integrations yet.</p>
        {:else if integrations}
            <ul class="int-list">
                {#each integrations as integration (integration.id)}
                    <li class="int-item">
                        <div class="int-item-head">
                            <span class="int-name">{integration.name}</span>
                            <span class="int-actions-inline">
                                <button type="button" class="btn-sm" on:click={() => startEditing(integration)}>Edit</button>
                                <button type="button" class="btn-danger" on:click={() => remove(integration)}>Delete</button>
                            </span>
                        </div>
                        <div class="int-dim">
                            {integration.baseUrl}
                            {#if integration.headerNames.length}
                                · sends {integration.headerNames.join(', ')}
                            {/if}
                        </div>
                        <div class="int-dim">Scripts call it as <code>integration('{integration.name}')</code></div>
                        {#if integration.grants.length}
                            <div class="int-grants">
                                Mini Apps allowed to use it:
                                {#each integration.grants as grant (grant.pageId)}
                                    <span class="int-grant">
                                        <a href={`/page/${grant.pageId}`} target="_blank">{grant.pageName}</a>
                                        <button type="button" class="int-link" on:click={() => disallow(integration, grant)}>Remove</button>
                                    </span>
                                {/each}
                            </div>
                        {/if}
                    </li>
                {/each}
            </ul>
        {/if}
        <div class="int-actions">
            <button type="button" class="btn" on:click={startAdding}>Add an integration</button>
        </div>
    {/if}
</Modal>

<style>
.int-intro {
    margin: 0.5em 0 1em;
    line-height: 1.5;
}

.int-form {
    display: grid;
    gap: 0.8em;
}

.int-field {
    display: grid;
    gap: 0.3em;
}

.int-field > span {
    font-weight: bold;
    font-size: 0.9em;
}

.int-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto;
    gap: 0.5em;
    align-items: center;
}

.int-link {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--color-tb-link);
    text-decoration: underline;
    cursor: pointer;
}

.int-add-header {
    justify-self: start;
}

.int-actions {
    display: flex;
    align-items: center;
    gap: 0.8em;
    margin-top: 1em;
}

.int-actions .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.int-secondary {
    background: transparent;
    color: inherit;
    border: 1px solid var(--border-select);
}

.int-example {
    margin-top: 1em;
    font-size: 0.9em;
}

.int-example summary {
    cursor: pointer;
    color: var(--color-tb-link);
}

.int-example ol {
    margin: 0.5em 0 0;
    padding-left: 1.4em;
    line-height: 1.6;
}

.int-example code,
.int-item code {
    background: var(--bg-select);
    border-radius: 3px;
    padding: 0 0.3em;
}

.int-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 50vh;
    overflow-y: auto;
}

.int-item {
    padding: 0.6em 0;
    border-bottom: 1px solid var(--border-select);
}

.int-item-head {
    display: flex;
    align-items: center;
    gap: 0.8em;
}

.int-name {
    font-weight: bold;
}

.int-actions-inline {
    margin-left: auto;
    display: flex;
    gap: 0.5em;
}

.int-dim {
    font-size: 0.85em;
    opacity: 0.75;
    margin: 0.2em 0 0;
    overflow-wrap: anywhere;
}

.int-grants {
    font-size: 0.85em;
    margin-top: 0.3em;
}

.int-grant {
    display: inline-flex;
    gap: 0.3em;
    margin-left: 0.5em;
}
</style>
