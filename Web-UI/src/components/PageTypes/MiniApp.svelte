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
import DataViewer from '../../components/DataViewer.svelte'
import { baseURL } from '../../../config.js'

let iframe
let configuration = false
let showHelp = false
let showData = false
let autoBuild = true
let contentReady = false
let aiOpen = false
let activeTab = 'html'
// Keys to force-refresh editors on external updates (AI/apply or fetch)
let htmlKey = 0
let cssKey = 0
let jsKey = 0
// Derived flag to unify read-only conditions
$: readOnlyMode = viewOnly || pageContentOverride !== undefined

// Ensure only one of the info panels is open at a time
function togglePanel(panel) {
    if (panel === 'data') {
        const next = !showData
        showData = next
        if (next) showHelp = false
    } else if (panel === 'help') {
        const next = !showHelp
        showHelp = next
        if (next) showData = false
    }
}

// Tabs keyboard support (Left/Right arrows)
const tabOrder = ['html', 'css', 'js']
function onTabKeydown(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const idx = tabOrder.indexOf(activeTab)
        const next = e.key === 'ArrowRight' ? (idx + 1) % tabOrder.length : (idx - 1 + tabOrder.length) % tabOrder.length
        activeTab = tabOrder[next]
        // move focus to the newly selected tab
        const btn = document.getElementById('tab-' + activeTab)
        if (btn) btn.focus()
        e.preventDefault()
    }
}

// System prompt for AIChatPanel to make it MiniApp-aware and reusable
const aiSystemPrompt = `You are an assistant that generates or edits small, self-contained web mini apps for a sandboxed iframe editor.

 Environment:
 - Code runs inside an iframe. The editor injects CSS, HTML, and executes JS as a module script (<script type="module">). Top-level await is allowed.
- Persistent storage is available via a global async object Journals with methods: getItem(key), setItem(key, value), removeItem(key), clear(), keys(); plus file helpers: upload(file[, filename?]) and getFileUrl(pathOrUrl). All return Promises.
- Storage semantics: getItem/setItem accept and return JSON-serializable values via structured clone over postMessage. Do NOT JSON.stringify or JSON.parse; pass plain objects/arrays/primitives. Avoid functions, symbols, DOM nodes, and BigInt. Dates will be stored as strings.
 - You may use ESM imports for whitelisted libraries via an import map. For example, Vue is available as: import { createApp, ref, onMounted } from 'vue'.
 - No external network resources or CDNs. Only bare specifiers provided by the import map are allowed (e.g., 'vue'). No relative/absolute URLs in import.

 Uploads:
 - You can upload a user-selected File or Blob via Journals.upload(file[, filename?]): Promise<string>. It returns a URL string to the uploaded file.
 - You can delete a previously uploaded file via Journals.deleteFile(pathOrUrl): Promise<boolean>.
 - Typical usage: const f = document.querySelector('input[type=file]').files[0]; const url = await Journals.upload(f); // url is a string.

 Assets:
 - Many media URLs require auth (cookies/headers) and cannot be loaded directly in the iframe via <img src>.
 - Use Journals.getFileUrl(pathOrUrl): Promise<string> to fetch the file from the parent with credentials and receive a blob URL to assign to src.

 Output format (strict):
 - Reply with fenced code blocks labeled exactly: html, css, javascript. Example: \`\`\`html ...\`\`\`.
 - When editing existing code, return ONLY the blocks that need changes; omit blocks that are unchanged. For any block you include, provide the FULL updated content of that block (not a diff or patch). Keep explanations very brief, after the code.
 - JS should attach event listeners with addEventListener and can use await directly at top-level (module script). If you import from 'vue', use the ESM API.

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

// If pageContentOverride is provided (history view), load from it and skip fetching/saving
$: if (pageContentOverride !== undefined) {
    contentReady = false
    const parsed = parseContent(pageContentOverride)
    if (parsed && parsed.files) {
        files = parsed.files
        kv = parsed.kv || {}
    }
    contentReady = true
    htmlKey++; cssKey++; jsKey++
    tick().then(buildAndRun)
}

$: fetchPage(pageId)

function parseContent(content) {
    if (!content) return null
    try { return JSON.parse(content) } catch (e) { return null }
}

function fetchPage(id) {
    // Don't fetch when we have an override (history preview) or missing id
    if (!id || pageContentOverride !== undefined) return
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
    // Do not save when viewing history or explicitly view-only
    if (readOnlyMode) return
    const payload = JSON.stringify({ files, kv })
    try {
        await fetchPlus.put(`/pages/${pageId}`, { pageContent: payload })
    } catch (e) {
        console.error(e)
        alert('Page Save Failed')
    }
}, 500)

function handleEditorInput(kind, e) {
    if (readOnlyMode) return
    files = { ...files, [kind]: e.target.value }
    if (autoBuild) buildAndRunDebounced()
    savePageContent()
}

function handleAIApply(e) {
    if (readOnlyMode) return
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
    if (readOnlyMode) return
    if (!confirm('Clear this Mini App\'s data?')) return
    kv = {}
    savePageContent()
    // inform iframe to clear its cache too (rebuild)
    buildAndRun()
}

function buildSrcdoc() {
    // Inject bridge first, then bootstrap that sets import map (if needed) and runs user JS as a module
    const bridge = `
<script>
(() => {
    const pending = new Map();
    let seq = 0;

    window.addEventListener('message', ev => {
        if (!ev.data) return;
        if (
            ev.data.type !== 'MiniAppStorageResponse' &&
            ev.data.type !== 'MiniAppUploadResponse' &&
            ev.data.type !== 'MiniAppFetchAssetResponse' &&
            ev.data.type !== 'MiniAppLoadLibraryResponse'
        ) return;
        const { requestId, result } = ev.data;
        const resolver = pending.get(requestId);
        if (resolver) { resolver(result); pending.delete(requestId); }
    });

    function call(method, key, value){
        const requestId = 'r'+(++seq);
        parent.postMessage({ type:'MiniAppStorage', method, key, value, requestId }, '*');
        return new Promise(res => pending.set(requestId, res));
    }

    async function callUpload(file, filename){
        const requestId = 'r'+(++seq);
        let name = filename;
        let fileData = null;
        let mime = '';
        try {
            if (file && typeof file.arrayBuffer === 'function') {
                fileData = await file.arrayBuffer();
                mime = file.type || '';
                if (!name && file.name) name = file.name;
            }
        } catch (e) {
            // fall back to posting the File/Blob directly
        }

        if (fileData) {
            // Prefer transferring raw bytes to avoid structured clone edge cases
            parent.postMessage({ type:'MiniAppUpload', fileData, mime, filename: name, requestId }, '*', [fileData]);
        } else {
            parent.postMessage({ type:'MiniAppUpload', file, filename: name, requestId }, '*');
        }
        return new Promise(res => pending.set(requestId, res));
    }

    function callFetchAsset(url){
        const requestId = 'r'+(++seq);
        parent.postMessage({ type:'MiniAppFetchAsset', url, requestId }, '*');
        return new Promise(res => pending.set(requestId, res));
    }

    function callDelete(url){
        const requestId = 'r'+(++seq);
        parent.postMessage({ type:'MiniAppDelete', url, requestId }, '*');
        return new Promise(res => pending.set(requestId, res));
    }

    function callLoadLibrary(name){
        const requestId = 'r'+(++seq);
        parent.postMessage({ type:'MiniAppLoadLibrary', name, requestId }, '*');
        return new Promise(res => pending.set(requestId, res));
    }

    window.Journals = {
        async getItem(k){ return call('getItem', k) },
        async setItem(k, v){ return call('setItem', k, v) },
        async removeItem(k){ return call('removeItem', k) },
        async clear(){ return call('clear') },
        async keys(){ return call('keys') },
        async upload(file, filename){ return callUpload(file, filename) },
        async deleteFile(pathOrUrl){ return callDelete(pathOrUrl) },
        async getFileUrl(url){
            const res = await callFetchAsset(url)
            if (!res || !res.buffer) return null
            try {
                const blob = new Blob([res.buffer], { type: res.mime || 'application/octet-stream' })
                return URL.createObjectURL(blob)
            } catch (e) { return null }
        }
    };

    // Expose loader for bootstrap
    window.__MiniAppCallLoadLibrary = callLoadLibrary;
})();
<\/script>`

    // Detect if user code references 'vue' via static or dynamic import
    const needsVue = /\bfrom\s+['\"]vue['\"]|import\s*\(\s*['\"]vue['\"]\s*\)/.test(files.js || '')
    const userJsLiteral = JSON.stringify(files.js || '')

    return `<!doctype html>
<html>
<head>
    <meta charset="utf-8" />
    <style>${files.css || ''}</style>
</head>
<body>
    ${files.html || ''}
    ${bridge}
    <script>
    (async () => {
        try {
            const NEEDS_VUE = ${needsVue ? 'true' : 'false'};
            // If Vue is needed, request its ESM code from parent and set an import map to a blob URL created inside the iframe
            if (NEEDS_VUE && typeof window.__MiniAppCallLoadLibrary === 'function') {
                const res = await window.__MiniAppCallLoadLibrary('vue');
                if (res && res.ok && res.code) {
                    const libBlob = new Blob([res.code], { type: 'text/javascript' });
                    const libUrl = URL.createObjectURL(libBlob);
                    const im = document.createElement('script');
                    im.type = 'importmap';
                    im.textContent = JSON.stringify({ imports: { vue: libUrl } });
                    document.head.appendChild(im);
                }
            }
            // Now run the user's JS as a module so static imports work
            const userCode = ${userJsLiteral};
            const jsBlob = new Blob([userCode], { type: 'text/javascript' });
            const jsUrl = URL.createObjectURL(jsBlob);
            const s = document.createElement('script');
            s.type = 'module';
            s.src = jsUrl;
            document.body.appendChild(s);
            // Optionally revoke later; keep alive while running
            s.addEventListener('load', () => { /* URL.revokeObjectURL(jsUrl) */ });
        } catch (e) { console.error(e); }
    })();
    <\/script>
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
    if (!msg) return

    // Storage API
    if (msg.type === 'MiniAppStorage') {
        let result
        try {
            switch (msg.method) {
                case 'getItem':
                    result = kv[msg.key];
                    break
                case 'setItem':
                    kv[msg.key] = msg.value
                    if (!readOnlyMode) {
                        savePageContent()
                    }
                    result = true
                    break
                case 'removeItem':
                    delete kv[msg.key]
                    if (!readOnlyMode) {
                        savePageContent()
                    }
                    result = true
                    break
                case 'clear':
                    kv = {}
                    if (!readOnlyMode) {
                        savePageContent()
                    }
                    result = true
                    break
                case 'keys':
                    result = Object.keys(kv)
                    break
                default: result = null
            }
        } catch (e) { result = null }
        ev.source.postMessage({ type: 'MiniAppStorageResponse', requestId: msg.requestId, result }, '*')
        return
    }

    // Upload API
    if (msg.type === 'MiniAppUpload') {
        // Disallow in read-only contexts
        if (readOnlyMode) {
            ev.source.postMessage({ type: 'MiniAppUploadResponse', requestId: msg.requestId, result: null }, '*')
            return
        }
        let filename = msg.filename || 'upload.bin'
        let blob
        if (msg.fileData) {
            // Reconstruct a Blob from transferred bytes
            blob = new Blob([msg.fileData], { type: msg.mime || 'application/octet-stream' })
        } else {
            const fileOrBlob = msg.file
            blob = fileOrBlob
            if (!filename && fileOrBlob && fileOrBlob.name) filename = fileOrBlob.name
        }
        ;(async () => {
            try {
                const data = new FormData()
                data.append('image', blob, filename)
                const resp = await fetch(`${baseURL}/upload-image/${pageId}`, {
                    method: 'POST',
                    body: data,
                    headers: { 'Token': localStorage.getItem('token') },
                    credentials: 'include'
                }).then(r => r.json())
                const url = `${baseURL}/${resp.imageUrl}`
                ev.source.postMessage({ type: 'MiniAppUploadResponse', requestId: msg.requestId, result: url }, '*')
            } catch (e) {
                console.error('MiniAppUpload failed', e)
                ev.source.postMessage({ type: 'MiniAppUploadResponse', requestId: msg.requestId, result: null }, '*')
            }
        })()
        return
    }

    // Fetch protected asset and return bytes
    if (msg.type === 'MiniAppFetchAsset') {
        const url = msg.url
        ;(async () => {
            try {
                const resp = await fetch(url, {
                    method: 'GET',
                    headers: { 'Token': localStorage.getItem('token') },
                    credentials: 'include'
                })
                const mime = resp.headers.get('Content-Type') || ''
                const buf = await resp.arrayBuffer()
                ev.source.postMessage({ type: 'MiniAppFetchAssetResponse', requestId: msg.requestId, result: { buffer: buf, mime } }, '*', [buf])
            } catch (e) {
                ev.source.postMessage({ type: 'MiniAppFetchAssetResponse', requestId: msg.requestId, result: null }, '*')
            }
        })()
        return
    }

    // Delete previously uploaded asset by path or URL
    if (msg.type === 'MiniAppDelete') {
        if (readOnlyMode) {
            ev.source.postMessage({ type: 'MiniAppStorageResponse', requestId: msg.requestId, result: false }, '*')
            return
        }
        ;(async () => {
            try {
                const resp = await fetch(`${baseURL}/page-uploads/delete-by-path`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Token': localStorage.getItem('token')
                    },
                    credentials: 'include',
                    body: JSON.stringify({ pageId, path: msg.url })
                })
                const ok = resp.ok
                ev.source.postMessage({ type: 'MiniAppStorageResponse', requestId: msg.requestId, result: ok }, '*')
            } catch (e) {
                ev.source.postMessage({ type: 'MiniAppStorageResponse', requestId: msg.requestId, result: false }, '*')
            }
        })()
        return
    }

    // Library loader: serve vendored ESM source code (whitelisted)
    if (msg.type === 'MiniAppLoadLibrary') {
        ;(async () => {
            try {
                // Whitelist map; extend as needed. Keep prod build for minimal footprint.
                const libMap = {
                    vue: '/libs/vue@3.x/vue.esm-browser.prod.js'
                }
                const path = libMap[msg.name]
                if (!path) {
                    ev.source.postMessage({ type: 'MiniAppLoadLibraryResponse', requestId: msg.requestId, result: { ok: false } }, '*')
                    return
                }
                const resp = await fetch(path, { credentials: 'include' })
                if (!resp.ok) throw new Error('Failed to fetch '+path)
                const code = await resp.text()
                ev.source.postMessage({ type: 'MiniAppLoadLibraryResponse', requestId: msg.requestId, result: { ok: true, code } }, '*')
            } catch (e) {
                console.error('MiniAppLoadLibrary failed', e)
                ev.source.postMessage({ type: 'MiniAppLoadLibraryResponse', requestId: msg.requestId, result: { ok: false } }, '*')
            }
        })()
        return
    }
}

onMount(() => {
    window.addEventListener('message', handleStorageRequest)
    const unsub = eventStore.subscribe(evt => {
        if (!evt || !evt.event) return
        // Ignore configuration events when viewing history or explicitly view-only
        if (readOnlyMode) return
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
            <iframe title="Mini App" sandbox="allow-scripts allow-modals allow-downloads allow-forms allow-popups allow-popups-to-escape-sandbox" bind:this={iframe}></iframe>
        </div>
    {:else}
    <div class="miniapp" class:hasPanel={showHelp || showData}>
            <div class="toolbar">
                <label class="autobuild-toggle"><input type="checkbox" bind:checked={autoBuild} on:change={() => { if (autoBuild) buildAndRun() }} /> Auto build</label>
                <button on:click={buildAndRun} disabled={autoBuild} title={autoBuild ? 'Disable Auto build to use Run' : 'Run the mini app'}>Run</button>
                <button on:click={() => aiOpen = true}>AI Chat</button>
                <div class="spacer"></div>
                <button class="linklike" title="Show stored data for this mini app" on:click={() => togglePanel('data')}>Stored Data</button>
                <button class="linklike" title="Show Mini App API help" on:click={() => togglePanel('help')}>Mini App API</button>
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
await Journals.clear()

// Upload a user-selected file and get back a URL string
const input = document.querySelector('input[type=file]')
const file = input.files[0]
const url = await Journals.upload(file)
// e.g. set <img alt="" src=url> or save in storage

// Resolve a protected file URL/path to a usable blob URL
const imgUrl = await Journals.getFileUrl('/uploads/images/abc.png')
// Then set it on an element: img.src = imgUrl
// Delete an uploaded file by its returned URL/path
await Journals.deleteFile('/uploads/images/abc.png')
</code></pre>
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
                                <tr>
                                    <td><code>upload(file[, filename])</code></td>
                                    <td>Upload a <code>File</code> or <code>Blob</code> and receive its URL.</td>
                                    <td><code>string (URL) | null</code></td>
                                </tr>
                                <tr>
                                    <td><code>getFileUrl(pathOrUrl)</code></td>
                                    <td>Return a blob URL for protected files (adds auth on your behalf).</td>
                                    <td><code>string (blob URL) | null</code></td>
                                </tr>
                                <tr>
                                    <td><code>deleteFile(pathOrUrl)</code></td>
                                    <td>Delete a previously uploaded file owned by this page.</td>
                                    <td><code>boolean</code></td>
                                </tr>
                            </tbody>
                        </table>
                        <p class="miniapp-help-note">
                            Notes: Storage is persisted per page and scoped to this mini app. Store plain values—no JSON.stringify/parse needed. Values must be JSON-serializable; Dates become strings and BigInt is not supported.
                        </p>
                    </div>
                </div>
            {/if}
            {#if showData}
                <div style="margin-top: 0.5rem;"></div>
                <DataViewer {kv} readOnly={readOnlyMode} on:clearData={clearData} />
            {/if}
            <div class="panes">
                <div class="editors">
                    <div class="tabs" role="tablist" aria-label="Mini App editors" tabindex="0" on:keydown={onTabKeydown}>
                        <button
                            id="tab-html"
                            class="tab"
                            role="tab"
                            aria-selected={activeTab === 'html'}
                            aria-controls="panel-html"
                            tabindex={activeTab === 'html' ? 0 : -1}
                            on:click={() => (activeTab = 'html')}
                        >HTML</button>
                        <button
                            id="tab-css"
                            class="tab"
                            role="tab"
                            aria-selected={activeTab === 'css'}
                            aria-controls="panel-css"
                            tabindex={activeTab === 'css' ? 0 : -1}
                            on:click={() => (activeTab = 'css')}
                        >CSS</button>
                        <button
                            id="tab-js"
                            class="tab"
                            role="tab"
                            aria-selected={activeTab === 'js'}
                            aria-controls="panel-js"
                            tabindex={activeTab === 'js' ? 0 : -1}
                            on:click={() => (activeTab = 'js')}
                        >JS</button>
                    </div>
                    <div class="tab-panels">
                        {#if activeTab === 'html'}
                            <div role="tabpanel" id="panel-html" aria-labelledby="tab-html" class="editor-panel">
                                {#key htmlKey}
                                    <code-mirror language="html" value={files.html} on:input={(e) => handleEditorInput('html', e)} style="border:1px solid #aaa"></code-mirror>
                                {/key}
                            </div>
                        {:else if activeTab === 'css'}
                            <div role="tabpanel" id="panel-css" aria-labelledby="tab-css" class="editor-panel">
                                {#key cssKey}
                                    <code-mirror language="css" value={files.css} on:input={(e) => handleEditorInput('css', e)} style="border:1px solid #aaa"></code-mirror>
                                {/key}
                            </div>
                        {:else}
                            <div role="tabpanel" id="panel-js" aria-labelledby="tab-js" class="editor-panel">
                                {#key jsKey}
                                    <code-mirror language="javascript" value={files.js} on:input={(e) => handleEditorInput('js', e)} style="border:1px solid #aaa"></code-mirror>
                                {/key}
                            </div>
                        {/if}
                    </div>
                </div>
                <iframe title="Mini App" sandbox="allow-scripts allow-modals allow-downloads allow-forms allow-popups allow-popups-to-escape-sandbox" bind:this={iframe}></iframe>
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

.miniapp.hasPanel {
    grid-template-rows: auto auto 1fr;
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
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    margin-top: 1rem;
    margin-bottom: 1rem;
}

.tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid #e5e7eb;
}
.tab {
    appearance: none;
    border: none;
    background: none;
    padding: 0.4rem 0.6rem;
    margin: 0;
    border-bottom: 2px solid transparent;
    cursor: pointer;
}
.tab[aria-selected="true"] {
    border-color: #0b65c2;
    color: #0b65c2;
    font-weight: 600;
}
.tab:focus-visible {
    outline: 2px solid #0b65c2;
    outline-offset: 2px;
}
.tab-panels {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
}
.editor-panel {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.editor-panel code-mirror {
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
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
    overflow: auto;
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
