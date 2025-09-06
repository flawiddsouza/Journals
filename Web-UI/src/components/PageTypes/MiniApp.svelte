<script>
export let pageId = null
/* svelte-ignore unused-export-let */
export let viewOnly = false
/* svelte-ignore unused-export-let */
export let pageContentOverride = undefined

import fetchPlus from '../../helpers/fetchPlus.js'
import debounce from '../../helpers/debounce.js'
import { onMount, tick } from 'svelte'
import { eventStore } from '../../stores.js'

import 'code-mirror-custom-element'
import AIChatPanel from '../../components/AIChatPanel.svelte'

let iframe
let configuration = false
let showHelp = false
let autoBuild = true
let contentReady = false
let aiOpen = false
// Keys to force-refresh editors on external updates (AI/apply or fetch)
let htmlKey = 0
let cssKey = 0
let jsKey = 0

// System prompt for AIChatPanel to make it MiniApp-aware and reusable
const aiSystemPrompt = `You are an assistant that generates or edits small, self-contained web mini apps for a sandboxed iframe editor.

Environment:
- Code runs inside an iframe. The editor injects CSS, HTML, then wraps JS inside an async IIFE: (async () => { /* your JS */ })().
- Persistent storage is available via a global async object Journals with methods: getItem(key), setItem(key, value), removeItem(key), clear(), keys(). All return Promises.
- Storage semantics: getItem/setItem accept and return JSON-serializable values via structured clone over postMessage. Do NOT JSON.stringify or JSON.parse; pass plain objects/arrays/primitives. Avoid functions, symbols, DOM nodes, and BigInt. Dates will be stored as strings.
- No imports, no build tools, no external network resources. Use only vanilla HTML/CSS/JS.

 Output format (strict):
 - Reply with fenced code blocks labeled exactly: html, css, javascript. Example: \`\`\`html ...\`\`\`.
 - When editing existing code, return ONLY the blocks that need changes; omit blocks that are unchanged. For any block you include, provide the FULL updated content of that block (not a diff or patch). Keep explanations very brief, after the code.
 - JS should attach event listeners with addEventListener and can use await directly (it will be wrapped in an async IIFE).

Constraints:
- Keep code minimal, accessible, and self-contained.
- Prefer semantic HTML and keyboard-friendly controls.
- Use Journals for any state that should persist across reloads.
- Do not use external CDNs, images, or libraries.`

let files = {
        html: `<div id="app">
    <div id="count">0</div>
    <div class="buttons">
        <button id="dec" aria-label="Decrement">-</button>
        <button id="inc" aria-label="Increment">+</button>
    </div>
</div>`,
        css: `body {
    font-family: Ubuntu, system-ui, sans-serif;
    margin: 0;
}

#app {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

#count {
    min-width: 2ch;
    text-align: right;
    font-weight: 600;
}

.buttons button {
    padding: 4px 8px;
}`,
        js: `let counter = (await Journals.getItem('counter')) || 0
const countEl = document.getElementById('count')
const set = async (val) => {
    counter = val
    countEl.textContent = counter
    await Journals.setItem('counter', counter)
}
countEl.textContent = counter
document.getElementById('inc').addEventListener('click', () => set(counter + 1))
document.getElementById('dec').addEventListener('click', () => set(counter - 1))`
}
let kv = {}

$: fetchPage(pageId)

function parseContent(content) {
    if (!content) return null
    try { return JSON.parse(content) } catch (e) { return null }
}

function fetchPage(id) {
    if (!id) return
    contentReady = false
    fetchPlus.get(`/pages/content/${id}`).then(resp => {
        const raw = resp.content
        const parsed = parseContent(raw)
        if (parsed && parsed.files) {
            files = parsed.files
            kv = parsed.kv || {}
        }
        contentReady = true
        // External content load -> refresh editors
        htmlKey++; cssKey++; jsKey++
        buildAndRun()
    })
}

const savePageContent = debounce(async function () {
    const payload = JSON.stringify({ files, kv })
    try {
        await fetchPlus.put(`/pages/${pageId}`, { pageContent: payload })
    } catch (e) {
        console.error(e)
        alert('Page Save Failed')
    }
}, 500)

function handleEditorInput(kind, e) {
    files = { ...files, [kind]: e.target.value }
    if (autoBuild) buildAndRunDebounced()
    savePageContent()
}

function handleAIApply(e) {
    const delta = e.detail || {}
    files = { ...files, ...delta }
    // Only refresh editors for blocks that changed
    if ('html' in delta) htmlKey++
    if ('css' in delta) cssKey++
    if ('js' in delta) jsKey++
    buildAndRun()
    savePageContent()
}

function clearData() {
    if (!confirm('Clear this Mini App\'s data?')) return
    kv = {}
    savePageContent()
    // inform iframe to clear its cache too (rebuild)
    buildAndRun()
}

function buildSrcdoc() {
    // Inject bridge first, then user JS
    const bridge = `
<script>
(() => {
    const pending = new Map();
    let seq = 0;

    window.addEventListener('message', ev => {
        if (!ev.data || ev.data.type !== 'MiniAppStorageResponse') return;
        const { requestId, result } = ev.data;
        const resolver = pending.get(requestId);
        if (resolver) { resolver(result); pending.delete(requestId); }
    });

    function call(method, key, value){
        const requestId = 'r'+(++seq);
        parent.postMessage({ type:'MiniAppStorage', method, key, value, requestId }, '*');
        return new Promise(res => pending.set(requestId, res));
    }

    window.Journals = {
        async getItem(k){ return call('getItem', k) },
        async setItem(k, v){ return call('setItem', k, v) },
        async removeItem(k){ return call('removeItem', k) },
        async clear(){ return call('clear') },
        async keys(){ return call('keys') }
    };
})();
<\/script>`

    return `<!doctype html>
<html>
<head>
    <meta charset="utf-8" />
    <style>${files.css || ''}</style>
</head>
<body>
    ${files.html || ''}
    ${bridge}
    <script>(async () => { try { ${files.js || ''} } catch(e){ console.error(e) } })()<\/script>
</body>
</html>`
}

function buildAndRun() {
    if (!iframe || !contentReady) return
    iframe.srcdoc = buildSrcdoc()
}

const buildAndRunDebounced = debounce(buildAndRun, 200)

function handleStorageRequest(ev) {
    if (!iframe || ev.source !== iframe.contentWindow) return
    const msg = ev.data
    if (!msg || msg.type !== 'MiniAppStorage') return
    let result
    try {
        switch (msg.method) {
            case 'getItem': result = kv[msg.key]; break
            case 'setItem': kv[msg.key] = msg.value; savePageContent(); result = true; break
            case 'removeItem': delete kv[msg.key]; savePageContent(); result = true; break
            case 'clear': kv = {}; savePageContent(); result = true; break
            case 'keys': result = Object.keys(kv); break
            default: result = null
        }
    } catch (e) { result = null }
    ev.source.postMessage({ type: 'MiniAppStorageResponse', requestId: msg.requestId, result }, '*')
}

onMount(() => {
    window.addEventListener('message', handleStorageRequest)
    const unsub = eventStore.subscribe(evt => {
        if (!evt || !evt.event) return
        if (evt.event === 'configureMiniApp') {
            configuration = true
            // Clear the event so new subscribers don't receive stale value
            eventStore.set(null)
            tick().then(buildAndRun)
        } else if (evt.event === 'exitConfigureMiniApp') {
            configuration = false
            // Clear the event so new subscribers don't receive stale value
            eventStore.set(null)
            tick().then(buildAndRun)
        }
    })
    return () => {
        window.removeEventListener('message', handleStorageRequest)
        if (typeof unsub === 'function') unsub()
    }
})
</script>

<div class="pos-r miniapp-root">
    {#if !configuration}
        <div class="miniapp-preview">
            <iframe title="Mini App" sandbox="allow-scripts allow-modals allow-downloads allow-forms" bind:this={iframe}></iframe>
        </div>
    {:else}
        <div class="miniapp">
            <div class="toolbar">
                <label class="autobuild-toggle"><input type="checkbox" bind:checked={autoBuild} on:change={() => { if (autoBuild) buildAndRun() }} /> Auto build</label>
                <button on:click={buildAndRun} disabled={autoBuild} title={autoBuild ? 'Disable Auto build to use Run' : 'Run the mini app'}>Run</button>
                <button on:click={clearData}>Clear Data</button>
                <button on:click={() => aiOpen = true}>AI Chat</button>
                <div class="spacer"></div>
                <button class="linklike" title="Show Mini App API help" on:click={() => showHelp = !showHelp}>Mini App API</button>
            </div>
            {#if showHelp}
                <div class="miniapp-help" role="note" aria-label="Mini App API">
                    <div class="miniapp-help-title">Journals API inside the iframe</div>
                    <div class="miniapp-help-body">
                        <p>Your JS runs in a sandboxed iframe with an async storage object <code>Journals</code>:</p>
                        <pre><code>// All methods return Promises
const n = (await Journals.getItem('counter')) || 0
await Journals.setItem('counter', n + 1)
await Journals.removeItem('counter')
const keys = await Journals.keys() // ["counter", ...]
await Journals.clear()</code></pre>
                        <p>Available methods:</p>
                        <table class="miniapp-methods" aria-label="Journals API methods">
                            <thead>
                                <tr>
                                    <th scope="col">Method</th>
                                    <th scope="col">Description</th>
                                    <th scope="col">Resolves to</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><code>getItem(key)</code></td>
                                    <td>Read a value by <code>key</code>; resolves to <code>undefined</code> if absent.</td>
                                    <td><code>any | undefined</code></td>
                                </tr>
                                <tr>
                                    <td><code>setItem(key, value)</code></td>
                                    <td>Save a JSON-serializable <code>value</code> under <code>key</code>.</td>
                                    <td><code>true</code></td>
                                </tr>
                                <tr>
                                    <td><code>removeItem(key)</code></td>
                                    <td>Delete the stored entry for <code>key</code>.</td>
                                    <td><code>true</code></td>
                                </tr>
                                <tr>
                                    <td><code>clear()</code></td>
                                    <td>Remove all keys stored by this mini app.</td>
                                    <td><code>true</code></td>
                                </tr>
                                <tr>
                                    <td><code>keys()</code></td>
                                    <td>List all keys stored by this mini app.</td>
                                    <td><code>string[]</code></td>
                                </tr>
                            </tbody>
                        </table>
                        <p class="miniapp-help-note">
                            Notes: Storage is persisted per page and scoped to this mini app. Store plain values—no JSON.stringify/parse needed. Values must be JSON-serializable; Dates become strings and BigInt is not supported.
                        </p>
                    </div>
                </div>
            {/if}
            <div class="panes">
                <div class="editors">
                    <div class="editor-block">
                        <div class="editor-label">HTML</div>
                        {#key htmlKey}
                            <code-mirror language="html" value={files.html} on:input={(e) => handleEditorInput('html', e)} style="border:1px solid #aaa"></code-mirror>
                        {/key}
                    </div>
                    <div class="editor-block">
                        <div class="editor-label">CSS</div>
                        {#key cssKey}
                            <code-mirror language="css" value={files.css} on:input={(e) => handleEditorInput('css', e)} style="border:1px solid #aaa"></code-mirror>
                        {/key}
                    </div>
                    <div class="editor-block">
                        <div class="editor-label">JS</div>
                        {#key jsKey}
                            <code-mirror language="javascript" value={files.js} on:input={(e) => handleEditorInput('js', e)} style="border:1px solid #aaa"></code-mirror>
                        {/key}
                    </div>
                </div>
                <iframe title="Mini App" sandbox="allow-scripts allow-modals allow-downloads allow-forms" bind:this={iframe}></iframe>
            </div>
            <AIChatPanel
                open={aiOpen}
                on:close={() => aiOpen = false}
                on:apply={handleAIApply}
                initialContext={aiSystemPrompt}
                codeContext={files}
            />
        </div>
    {/if}
</div>

<style>
.miniapp-root {
    height: 100%;
    overflow: hidden;
}

.miniapp {
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr;
}

.toolbar {
    display: flex;
    gap: 0.5rem;
}

.toolbar .spacer { flex: 1; }
.toolbar .linklike {
    background: none;
    border: none;
    padding: 0;
    color: #0b65c2;
    cursor: pointer;
    text-decoration: underline;
}

.panes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    height: 100%;
    overflow: hidden;
}

.editors {
    display: grid;
    grid-template-rows: auto auto auto;
    gap: 0.5rem;
    overflow: auto;
    margin-top: 1rem;
    margin-bottom: 1rem;
}

.editor-block {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.editor-label {
    font-weight: 600;
}

iframe {
    width: 100%;
    height: 100%;
    border: 0;
    background: white;
    display: block;
}

.miniapp-preview {
    height: 100%;
    overflow: hidden;
}

.pos-r {
    position: relative;
}


.miniapp-help {
    margin: 0.25rem 0 0.5rem;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    background: #f6f8fa;
    color: #24292f;
    font-size: 0.9rem;
}
.miniapp-help-title {
    font-weight: 600;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid #d0d7de;
}
.miniapp-help-body {
    padding: 0.6rem;
}
.miniapp-help pre {
    margin: 0.4rem 0;
    padding: 0.5rem;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    overflow: auto;
}
.miniapp-help code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

.miniapp-methods {
    width: auto;
    max-width: 100%;
    border-collapse: collapse;
    margin-top: 0.4rem;
    background: #fff;
}
.miniapp-methods th,
.miniapp-methods td {
    border: 1px solid #e5e7eb;
    padding: 0.45rem 0.6rem;
    vertical-align: top;
}
.miniapp-methods thead th {
    background: #f0f3f6;
    font-weight: 600;
    text-align: left;
}
.miniapp-methods code {
    white-space: nowrap;
}
</style>
