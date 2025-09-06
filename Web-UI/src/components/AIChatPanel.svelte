<script>
import { createEventDispatcher, onMount } from 'svelte'

export let open = false
export let initialContext = ''
// Optional: pass current editor code so AI can propose edits
export let codeContext = { html: '', css: '', js: '' }
// Allow user to toggle whether to include code context in the request
export let includeContext = true

const dispatch = createEventDispatcher()

let input = ''
let busy = false
let panelEl
let showSettings = false
let showApiKey = false

// Minimal config managed by the component itself
const defaultConfig = {
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'x-ai/grok-code-fast-1',
    apiKey: ''
}
let config = { ...defaultConfig }

// Derived readiness flag
let isConfigured = false
$: isConfigured = Boolean((config.apiUrl || '').trim() && (config.model || '').trim() && (config.apiKey || '').trim())

function loadConfig() {
    const stored = {
        apiUrl: localStorage.getItem('journals.ai.apiUrl'),
        model: localStorage.getItem('journals.ai.model'),
        apiKey: localStorage.getItem('journals.ai.apiKey')
    }
    // Preserve empty strings if explicitly saved; only fall back when null
    config = {
        apiUrl: stored.apiUrl ?? defaultConfig.apiUrl,
        model: stored.model ?? defaultConfig.model,
        apiKey: stored.apiKey ?? defaultConfig.apiKey
    }
    // includeContext persisted as 'true' | 'false'; default true
    const storedCtx = localStorage.getItem('journals.ai.includeContext')
    includeContext = storedCtx == null ? true : storedCtx === 'true'
}

function saveConfig() {
    localStorage.setItem('journals.ai.apiKey', config.apiKey || '')
    localStorage.setItem('journals.ai.apiUrl', config.apiUrl || '')
    localStorage.setItem('journals.ai.model', config.model || '')
}

function saveIncludeContext() {
    localStorage.setItem('journals.ai.includeContext', includeContext ? 'true' : 'false')
}

function clearConfig() {
    // Remove persisted values and restore defaults in memory
    localStorage.removeItem('journals.ai.apiKey')
    localStorage.removeItem('journals.ai.apiUrl')
    localStorage.removeItem('journals.ai.model')
    config = { ...defaultConfig }
    showApiKey = false
}

/**
 * messages: minimal local chat state (UI only)
 * role: 'user' | 'assistant'
 * content: string (may include ```lang code``` blocks)
 */
let messages = []

function close() {
    dispatch('close')
}

function focusInput() {
    const el = panelEl?.querySelector('textarea')
    if (el) el.focus()
}

onMount(() => {
    loadConfig()
    if (!((config.apiUrl && config.model && config.apiKey))) {
        showSettings = true
    }
    if (open) focusInput()
})

$: if (open) {
    // Autofocus when opened
    setTimeout(focusInput, 0)
}

function send() {
    const text = input.trim()
    if (!text || busy) return
    if (!isConfigured) {
        showSettings = true
        return
    }
    messages = [...messages, { role: 'user', content: text }]
    input = ''
    askAI()
}

// --- Browser AI wiring (OpenAI-compatible streaming) ---
// Config is managed by this component via `config` state + settings UI.
const getApiKey = () => config.apiKey
const getEndpoint = () => config.apiUrl
const getModel = () => config.model

async function askAI() {
    // If no key is configured, gracefully fall back to the canned demo
    const apiKey = getApiKey()
    if (!apiKey) {
        showSettings = true
        busy = false
        return
    }

    busy = true
    try {
        const endpoint = getEndpoint()
        const model = getModel()

        // Prepare a new assistant message we can stream into (so typing indicator can show immediately)
        const assistantIndex = messages.length
        messages = [...messages, { role: 'assistant', content: '' }]

        // Build OpenAI-style messages from local chat state
        const chat = []
        if (initialContext) chat.push({ role: 'system', content: initialContext })

        // Optionally include current code context so model can propose edits
        if (includeContext && codeContext && (codeContext.html || codeContext.css || codeContext.js)) {
            const parts = []
            if (codeContext.html) parts.push('```html\n' + codeContext.html + '\n```')
            if (codeContext.css) parts.push('```css\n' + codeContext.css + '\n```')
            if (codeContext.js) parts.push('```javascript\n' + codeContext.js + '\n```')
            chat.push({
                role: 'system',
                content: 'Current app code (for context). Only return blocks that need changes; omit unchanged ones.\n\n' + parts.join('\n\n')
            })
        }
        for (const m of messages) {
            if (m.role === 'user' || m.role === 'assistant') {
                chat.push({ role: m.role, content: m.content })
            }
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }
        // Add recommended headers for OpenRouter in browser contexts
        if (endpoint.includes('openrouter.ai')) {
            headers['HTTP-Referer'] = location.origin
            headers['X-Title'] = 'Journals'
        }

        const body = JSON.stringify({
            model,
            messages: chat,
            stream: true
        })

        const res = await fetch(endpoint, { method: 'POST', headers, body })
        if (!res.ok) {
            const errText = await res.text().catch(() => `${res.status}`)
            // Replace placeholder with error message
            const updated = [...messages]
            updated[assistantIndex] = { role: 'assistant', content: `Error: AI request failed (${res.status}): ${errText}` }
            messages = updated
            busy = false
            return
        }

        const ct = res.headers.get('content-type') || ''
        const isStream = !!res.body && (ct.includes('text/event-stream') || ct.includes('application/x-ndjson') || ct.includes('application/event-stream') || ct.includes('text/plain'))

        if (!isStream || !res.body) {
            // Fallback: parse JSON completion
            const data = await res.json()
            const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || ''
            const updated = [...messages]
            updated[assistantIndex] = { ...updated[assistantIndex], content }
            messages = updated
            busy = false
            return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''

        while (true) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            // Split into SSE-style events (separated by blank lines)
            const events = buffer.split(/\n\n/)
            buffer = events.pop() || ''
            for (const evt of events) {
                const line = evt.trim()
                if (!line.startsWith('data:')) continue
                const payload = line.replace(/^data:\s*/, '')
                if (payload === '[DONE]') {
                    continue
                }
                try {
                    const json = JSON.parse(payload)
                    const delta = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content ?? ''
                    if (delta) {
                        const updated = [...messages]
                        updated[assistantIndex] = { ...updated[assistantIndex], content: updated[assistantIndex].content + delta }
                        messages = updated
                    }
                } catch (_) {
                    // Ignore JSON parse errors on partial lines
                }
            }
        }

        busy = false
    } catch (err) {
        // If a placeholder assistant exists, try to replace it; else append
        const idx = messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === ''
            ? messages.length - 1
            : -1
        if (idx >= 0) {
            const updated = [...messages]
            updated[idx] = { ...updated[idx], content: `Error: ${err?.message || err}` }
            messages = updated
        } else {
            messages = [...messages, { role: 'assistant', content: `Error: ${err?.message || err}` }]
        }
        busy = false
    }
}

// Extract first set of html/css/js blocks from a message content
function extractCodeBlocks(text) {
    const re = /```(\w+)?\n([\s\S]*?)```/g
    let m
    const out = { html: undefined, css: undefined, js: undefined, blocks: [] }
    while ((m = re.exec(text))) {
        const lang = (m[1] || '').toLowerCase()
        const code = m[2]
        out.blocks.push({ lang, code })
        if ((lang === 'html' || lang === 'htm') && out.html === undefined) out.html = code
        else if ((lang === 'css') && out.css === undefined) out.css = code
        else if ((lang === 'js' || lang === 'javascript' || lang === 'ts' || lang === 'typescript') && out.js === undefined) out.js = code
    }
    return out
}

let lastExtract = { html: undefined, css: undefined, js: undefined, blocks: [] }
$: {
    // Track extract for the last assistant message
    const last = [...messages].reverse().find(m => m.role === 'assistant')
    lastExtract = last ? extractCodeBlocks(last.content) : { html: undefined, css: undefined, js: undefined, blocks: [] }
}

function applySelection(sel = { html: true, css: true, js: true }) {
    const delta = {}
    if (sel.html && lastExtract.html !== undefined) delta.html = lastExtract.html
    if (sel.css && lastExtract.css !== undefined) delta.css = lastExtract.css
    if (sel.js && lastExtract.js !== undefined) delta.js = lastExtract.js
    if (Object.keys(delta).length === 0) return
    dispatch('apply', delta)
}

function keydown(e) {
    if (e.key === 'Escape') {
        e.stopPropagation()
        close()
    }
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        send()
    }
}
</script>

{#if open}
    <div class="ai-overlay" role="dialog" aria-modal="true" aria-label="AI Assistant" on:click={close}>
        <div class="ai-panel" bind:this={panelEl} on:click|stopPropagation>
            <div class="ai-header">
                <div class="title">AI Assistant</div>
                <div class="spacer"></div>
                <button class="ghost" on:click={close} aria-label="Close">✕</button>
            </div>
            <div class="ai-body">
                <div class="messages" aria-live="polite">
                    {#if initialContext}
                        <div class="message system">{initialContext}</div>
                    {/if}
                    {#each messages as m, i}
                        <div class="message {m.role}">
                            {#if m.role === 'user'}
                                <div class="label">You</div>
                            {:else}
                                <div class="label">Assistant</div>
                            {/if}
                            <div class="content">
                                {#if m.role === 'assistant' && (!m.content || m.content.trim() === '') && busy && i === messages.length - 1}
                                    <span class="typing" aria-label="Assistant is typing" role="status">
                                        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
                                    </span>
                                {:else}
                                    {m.content}
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
                <div class="extract">
                    <div class="extract-title">Detected blocks</div>
                    {#if lastExtract.blocks.length === 0}
                        <div class="extract-empty">No code blocks found in the last reply.</div>
                    {:else}
                        <ul>
                            {#each lastExtract.blocks as b}
                                <li><code>{b.lang || 'text'}</code> block ({b.code.length} chars)</li>
                            {/each}
                        </ul>
                        <div class="apply-actions">
                            <button on:click={() => applySelection({ html: true, css: true, js: true })}>Apply All</button>
                            <button on:click={() => applySelection({ html: true, css: false, js: false })} disabled={!lastExtract.html}>Apply HTML</button>
                            <button on:click={() => applySelection({ html: false, css: true, js: false })} disabled={!lastExtract.css}>Apply CSS</button>
                            <button on:click={() => applySelection({ html: false, css: false, js: true })} disabled={!lastExtract.js}>Apply JS</button>
                        </div>
                        <div class="apply-hint">Applying replaces the entire matching block (HTML/CSS/JS). The assistant should return full contents for any changed block.</div>
                    {/if}
                </div>
            </div>
            <div class="ai-input">
                <textarea rows="3" bind:value={input} placeholder="Describe the app or change you want… (Enter to send)" on:keydown={keydown}></textarea>
                <button class="send" on:click={send} disabled={busy || !input.trim() || !isConfigured}>Send</button>
            </div>
            <div class="ai-footer">
                <div style="display:flex; gap:.5rem; align-items:center; justify-content:space-between;">
                    <span>Configure AI{#if !isConfigured}<span style="margin-left:.4rem; color:#b91c1c;">(required)</span>{/if}</span>
                    <button class="ghost" on:click={() => { showSettings = !showSettings }} aria-expanded={showSettings}>{showSettings ? 'Hide' : 'Show'} Settings</button>
                </div>
                {#if codeContext && (codeContext.html || codeContext.css || codeContext.js)}
                    <div class="ctx-row">
                        <label class="ctx-toggle"><input type="checkbox" bind:checked={includeContext} on:change={saveIncludeContext} /> Include current HTML/CSS/JS as context</label>
                    </div>
                {/if}
                {#if showSettings}
                    <div class="settings">
                        <div class="row">
                            <label for="ai-api-url">API URL</label>
                            <input id="ai-api-url" type="text" bind:value={config.apiUrl} placeholder="https://openrouter.ai/api/v1/chat/completions" />
                        </div>
                        <div class="row">
                            <label for="ai-model">Model</label>
                            <input id="ai-model" type="text" bind:value={config.model} placeholder="x-ai/grok-code-fast-1" />
                        </div>
                        <div class="row">
                            <label for="ai-api-key">API Key</label>
                            <div class="input-with-toggle">
                                {#if showApiKey}
                                    <input
                                        id="ai-api-key"
                                        type="text"
                                        bind:value={config.apiKey}
                                        placeholder="sk-..."
                                        autocomplete="off"
                                        autocapitalize="off"
                                        spellcheck={false}
                                    />
                                {:else}
                                    <input
                                        id="ai-api-key"
                                        type="password"
                                        bind:value={config.apiKey}
                                        placeholder="sk-..."
                                        autocomplete="off"
                                        autocapitalize="off"
                                        spellcheck={false}
                                    />
                                {/if}
                                <button
                                    type="button"
                                    class="eye"
                                    on:click={() => (showApiKey = !showApiKey)}
                                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                                    aria-pressed={showApiKey}
                                    title={showApiKey ? 'Hide' : 'Show'}
                                >{showApiKey ? '🙈' : '👁'}</button>
                            </div>
                        </div>
                        <div class="row actions">
                            <button on:click={() => { saveConfig(); }}>Save</button>
                            <button class="ghost" on:click={() => { clearConfig(); }}>Reset</button>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
.ai-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.35);
    display: grid;
    place-items: center;
    z-index: 40;
}
.ai-panel {
    width: min(980px, 96vw);
    height: min(640px, 90vh);
    background: #fff;
    border: 1px solid #d0d7de;
    border-radius: 8px;
    display: grid;
    grid-template-rows: auto 1fr auto auto;
    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
}
.ai-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.8rem;
    border-bottom: 1px solid #e5e7eb;
}
.ai-header .title { font-weight: 700; }
.ai-header .spacer { flex: 1; }
.ai-header .ghost {
    border: 0; background: none; cursor: pointer; font-size: 1.1rem;
}

.ai-body {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 0.75rem;
    padding: 0.75rem;
    overflow: hidden;
}
.messages {
    overflow: auto;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.5rem;
}
.message { margin-bottom: 0.5rem; }
.message .label { font-size: 0.8rem; color: #6b7280; margin-bottom: 0.1rem; }
.message.user .content { background: #eef2ff; }
.message.assistant .content { background: #f1f5f9; }
.message .content {
    white-space: pre-wrap;
    padding: 0.5rem;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, "Apple Color Emoji", "Segoe UI Emoji";
}

/* Inline typing indicator inside assistant bubble */
.typing { display: inline-flex; gap: 6px; align-items: center; height: 1em; }
.typing .dot {
    width: 6px; height: 6px; background: #9ca3af; border-radius: 50%; display: inline-block;
    animation: typing-bounce 1.2s infinite ease-in-out;
}
.typing .dot:nth-child(2) { animation-delay: .2s; }
.typing .dot:nth-child(3) { animation-delay: .4s; }
@keyframes typing-bounce {
    0%, 80%, 100% { opacity: .25; transform: translateY(0); }
    40% { opacity: 1; transform: translateY(-3px); }
}

.extract { border: 1px solid #e5e7eb; border-radius: 6px; padding: 0.5rem; overflow: auto; }
.extract-title { font-weight: 600; margin-bottom: 0.25rem; }
.extract-empty { color: #6b7280; font-size: 0.95rem; }
.apply-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.25rem; }
.apply-hint { margin-top: .25rem; font-size: .8rem; color: #6b7280; }

.ai-input {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.5rem;
    padding: 0.6rem;
    border-top: 1px solid #e5e7eb;
}
.ai-input textarea {
    resize: none;
    font: inherit;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
}
.ai-input .send {
    min-width: 84px;
    border: 1px solid #2563eb;
    background: #2563eb;
    color: #fff;
    border-radius: 6px;
    padding: 0 0.9rem;
    cursor: pointer;
}
.ai-input .send:disabled { opacity: 0.6; cursor: not-allowed; }

.ai-footer {
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
    color: #6b7280;
    border-top: 1px solid #e5e7eb;
}
.ctx-row { margin-top: .4rem; }
.ctx-toggle { display: inline-flex; gap: .4rem; align-items: center; }
.settings { margin-top: .5rem; display: grid; gap: .5rem; }
.settings .row { display: grid; gap: .25rem; }
.settings .row label { font-size: .8rem; color: #4b5563; }
.settings .row input { padding: .4rem .5rem; border: 1px solid #d1d5db; border-radius: 6px; font: inherit; }
.settings .row.actions { display:flex; gap:.5rem; align-items:center; }
.settings .input-with-toggle { position: relative; display: grid; grid-template-columns: 1fr auto; align-items: center; }
.settings .input-with-toggle input { width: 100%; }
.settings .input-with-toggle .eye { margin-left: .4rem; border: 1px solid #d1d5db; background: #f9fafb; border-radius: 6px; padding: .3rem .5rem; cursor: pointer; }
</style>
