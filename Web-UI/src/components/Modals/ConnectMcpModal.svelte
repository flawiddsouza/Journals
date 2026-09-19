<script>
// How to point an AI app at this journal's MCP server, with the address
// already filled in, and the apps that have been let in, each with a way to
// take that back. The sidecar is served from the app's own address (MCP/README.md).
import Modal from '../Modal.svelte'
import ConnectMcpCode from './ConnectMcpCode.svelte'
import fetchPlus from '../../helpers/fetchPlus.js'
import { showConfirm } from '../../helpers/dialogs.js'

const SERVER_NAME = 'journals'
const origin = window.location.origin
const url = `${origin}/mcp`

// Terminal tools, then web apps, then the desktop app.
const CLIENTS = [
    { id: 'claude-code', label: 'Claude Code' },
    { id: 'codex', label: 'Codex' },
    { id: 'claude-web', label: 'Claude (web)' },
    { id: 'chatgpt', label: 'ChatGPT (web)' },
    { id: 'claude-desktop', label: 'Claude Desktop' },
]
let client = CLIENTS[0].id

let connections = null
let error = ''
let disconnecting = null

async function load() {
    try {
        connections = await fetchPlus.get(`${origin}/oauth/connections`)
        error = ''
    } catch {
        error = "Couldn't load the connected apps. The MCP server may not be running."
    }
}

load()

async function disconnect(connection) {
    const yes = await showConfirm(
        `Disconnect "${connection.name}"?\n\nIt can no longer ${connection.canWrite ? 'read or change' : 'read'} your pages until you authorize it again. Your pages are not affected.`,
        { confirmLabel: 'Disconnect', danger: true },
    )
    if (!yes) return
    disconnecting = connection.id
    const failed = await fetchPlus.delete(`${origin}/oauth/connections/${encodeURIComponent(connection.id)}`).then(
        () => false,
        () => true,
    )
    await load()
    disconnecting = null
    // Said after the list is read again, which clears the error line. An app
    // that is gone all the same, disconnected from another tab say, is no failure.
    if (failed && connections?.some((c) => c.id === connection.id)) error = `Couldn't disconnect "${connection.name}".`
}

const since = (value) => new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
</script>

<Modal width="40rem" on:close-modal>
    <h2 class="heading">Connect AI Apps</h2>
    <p class="mcp-intro">
        An AI app can read and edit your pages over MCP. Pick your app. It signs in through your browser as you, and sees only your own journal.
    </p>

    <div class="mcp-tabs" role="tablist">
        {#each CLIENTS as { id, label }}
            <button type="button" role="tab" aria-selected={id === client} class="mcp-tab" class:mcp-tab-active={id === client} on:click={() => (client = id)}>
                {label}
            </button>
        {/each}
    </div>

    <!-- Keyed, so a "Copied" from one app's steps never shows on another's. -->
    {#key client}
        {#if client === 'claude-code'}
            <ol class="mcp-steps">
                <li>In a terminal:<ConnectMcpCode text={`claude mcp add --scope user --transport http ${SERVER_NAME} ${url}`} /></li>
                <li>In Claude Code run <code>/mcp</code>, pick <b>{SERVER_NAME}</b> and choose <b>Authenticate</b>. A browser opens. Sign in and approve.</li>
            </ol>
        {:else if client === 'codex'}
            <ol class="mcp-steps">
                <li>In a terminal:<ConnectMcpCode text={`codex mcp add ${SERVER_NAME} --url ${url}\ncodex mcp login ${SERVER_NAME}`} /></li>
                <li>Sign in and approve in the browser Codex opens. The tools load on the next run.</li>
            </ol>
            <details class="mcp-alt">
                <summary>Or edit ~/.codex/config.toml by hand</summary>
                <p>The Codex IDE extension and desktop app read the same file.</p>
                <ConnectMcpCode text={`[mcp_servers.${SERVER_NAME}]\nurl = "${url}"\nauth = "oauth"`} />
            </details>
        {:else if client === 'claude-web'}
            <ol class="mcp-steps">
                <li>On claude.ai open <b>Settings</b>, then <b>Connectors</b>, then <b>Add custom connector</b>. On a Team or Enterprise plan an owner does this once.</li>
                <li>Paste this URL and click <b>Add</b>:<ConnectMcpCode text={url} /></li>
                <li>Click <b>Connect</b>, sign in and approve. The tools then appear in the chat's tool menu.</li>
            </ol>
        {:else if client === 'chatgpt'}
            <ol class="mcp-steps">
                <li>Turn on <b>Developer mode</b> in ChatGPT's settings. A managed workspace needs an admin to allow custom connectors.</li>
                <li>In <b>Settings</b> open <b>Connectors</b> and choose <b>Create</b>.</li>
                <li>Name it <code>{SERVER_NAME}</code>, set authentication to <b>OAuth</b>, and use this URL:<ConnectMcpCode text={url} /></li>
                <li>Create it, sign in and allow access. In a chat, switch <b>{SERVER_NAME}</b> on from the tools menu.</li>
            </ol>
        {:else}
            <ol class="mcp-steps">
                <li>Open <b>Settings</b>, then <b>Connectors</b>, then <b>Add custom connector</b>.</li>
                <li>Name it <code>{SERVER_NAME}</code>, paste this URL and click <b>Add</b>:<ConnectMcpCode text={url} /></li>
                <li>Click <b>Connect</b>, sign in and approve. Leave the advanced OAuth fields blank.</li>
            </ol>
        {/if}
    {/key}

    <h3 class="mcp-section-title">Connected apps</h3>
    {#if error}
        <div class="red" role="alert">{error}</div>
    {/if}
    {#if connections && !connections.length}
        <p class="mcp-dim">No apps connected yet. An app appears here after it signs in.</p>
    {:else if connections}
        <ul class="mcp-connections">
            {#each connections as connection (connection.id)}
                <li class="mcp-connection">
                    <span class="mcp-connection-name">{connection.name}</span>
                    <span class="mcp-dim">{connection.canWrite ? 'read and write' : 'read only'} · since {since(connection.since)}</span>
                    <button type="button" class="btn-danger" disabled={disconnecting === connection.id} on:click={() => disconnect(connection)}>
                        Disconnect
                    </button>
                </li>
            {/each}
        </ul>
    {/if}
</Modal>

<style>
.mcp-intro {
    margin: 0.5em 0 1em;
    line-height: 1.5;
}

.mcp-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4em;
    margin-bottom: 0.8em;
}

.mcp-tab {
    font: inherit;
    font-size: 0.85em;
    padding: 0.3em 0.8em;
    border: 1px solid var(--border-select);
    border-radius: 999px;
    background: transparent;
    color: inherit;
    cursor: pointer;
}

.mcp-tab:hover {
    background: var(--bg-tb-hover);
}

/* After hover, and covering it, so the chosen app looks chosen while the
   pointer is still on it. */
.mcp-tab-active,
.mcp-tab-active:hover {
    background: var(--color-tb-link);
    border-color: var(--color-tb-link);
    color: var(--bg-section-active);
}

.mcp-steps {
    margin: 0;
    padding-left: 1.4em;
    line-height: 1.5;
}

.mcp-steps li {
    margin-bottom: 0.6em;
}

.mcp-steps code {
    background: var(--bg-select);
    border-radius: 3px;
    padding: 0 0.3em;
}

.mcp-alt {
    margin: 0.2em 0 0 1.4em;
    font-size: 0.9em;
}

.mcp-alt summary {
    cursor: pointer;
    color: var(--color-tb-link);
}

.mcp-alt p {
    margin: 0.5em 0 0;
}

.mcp-section-title {
    font-size: 1em;
    margin: 1.4em 0 0.5em;
    padding-top: 1em;
    border-top: 1px solid var(--border-select);
}

.mcp-dim {
    font-size: 0.85em;
    opacity: 0.75;
    margin: 0;
}

.mcp-connections {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 14em;
    overflow-y: auto;
}

.mcp-connection {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3em 0.8em;
    padding: 0.35em 0;
}

.mcp-connection-name {
    font-weight: bold;
}

.mcp-connection .btn-danger {
    margin-left: auto;
}
</style>
