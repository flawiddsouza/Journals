<script>
import { createEventDispatcher, onMount, tick } from 'svelte'
import { createPatch } from 'diff'
import Modal from './Modal.svelte'

export let open = false
export let initialContext = ''
// Optional: pass current editor code so AI can propose edits
export let codeContext = { html: '', css: '', js: '', modules: [] }
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
    apiKey: '',
}
let config = { ...defaultConfig }

// Derived readiness flag
let isConfigured = false
$: isConfigured = Boolean(
    (config.apiUrl || '').trim() &&
        (config.model || '').trim() &&
        (config.apiKey || '').trim(),
)

function loadConfig() {
    const stored = {
        apiUrl: localStorage.getItem('journals.ai.apiUrl'),
        model: localStorage.getItem('journals.ai.model'),
        apiKey: localStorage.getItem('journals.ai.apiKey'),
    }
    // Preserve empty strings if explicitly saved; only fall back when null
    config = {
        apiUrl: stored.apiUrl ?? defaultConfig.apiUrl,
        model: stored.model ?? defaultConfig.model,
        apiKey: stored.apiKey ?? defaultConfig.apiKey,
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
    localStorage.setItem(
        'journals.ai.includeContext',
        includeContext ? 'true' : 'false',
    )
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
let messagesContainer

function scrollToBottom() {
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
}

function scrollToLatestDiff() {
    if (!messagesContainer) return

    // Find the latest message with diffs
    const latestMessageWithDiffs = [
        ...messagesContainer.querySelectorAll('.message'),
    ]
        .reverse()
        .find((msg) => msg.querySelector('.diff-preview'))

    if (!latestMessageWithDiffs) return

    const diffPreview = latestMessageWithDiffs.querySelector('.diff-preview')
    if (!diffPreview) return

    // Prefer the diff header (heading), fall back to first .diff-line, then diffPreview top
    const diffHeader = diffPreview.querySelector('.diff-header')
    const firstDiffLine = diffPreview.querySelector('.diff-line')
    const targetEl = diffHeader || firstDiffLine || diffPreview

    // Helper to compute and apply scrollTop
    const applyScroll = () => {
        const containerRect = messagesContainer.getBoundingClientRect()
        const targetRect = targetEl.getBoundingClientRect()
        const desiredScrollTop =
            messagesContainer.scrollTop + (targetRect.top - containerRect.top)
        const maxScroll =
            messagesContainer.scrollHeight - messagesContainer.clientHeight
        messagesContainer.scrollTop = Math.max(
            0,
            Math.min(desiredScrollTop, maxScroll),
        )
    }

    // Apply immediately
    applyScroll()

    // Retry shortly after to handle any late DOM updates or layout recalculations
    setTimeout(applyScroll, 50)
    setTimeout(applyScroll, 200)
}

function close() {
    // If a request is in-flight, stop it before closing
    if (busy) stop()
    dispatch('close')
}

function focusInput() {
    const el = panelEl?.querySelector('textarea')
    if (el) el.focus()
}

onMount(() => {
    loadConfig()
    if (!(config.apiUrl && config.model && config.apiKey)) {
        showSettings = true
    }
    if (open) {
        setTimeout(() => {
            if (messages.length > 0) scrollToBottom()
            focusInput()
        }, 0)
    }
})

$: if (open) {
    tick().then(() => {
        if (messages.length > 0) scrollToBottom()
        focusInput()
    })
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

        // Build OpenAI-style messages from local chat state with strong recency rules
        const buildChat = () => {
            const chat = []
            if (initialContext)
                chat.push({ role: 'system', content: initialContext })

            // Split history and the latest user turn
            const msgs = messages
            const lastIsUser =
                msgs.length > 0 && msgs[msgs.length - 1]?.role === 'user'
            const lastUser = lastIsUser ? msgs[msgs.length - 1] : null
            const history = lastUser ? msgs.slice(0, -1) : msgs.slice()

            // So the model doesn't anchor on stale assistant code, strip code fences from prior assistant turns
            const stripCode = (t) =>
                (t || '').replace(/```[\s\S]*?```/g, '[code omitted]')
            for (const m of history) {
                if (m.role === 'user') {
                    chat.push({ role: 'user', content: m.content })
                } else if (m.role === 'assistant') {
                    chat.push({
                        role: 'assistant',
                        content: stripCode(m.content),
                    })
                }
                // (Intentionally omit local system/checkpoint messages from API payload)
            }

            // Inject the authoritative, current code snapshot RIGHT BEFORE the latest user prompt
            if (
                includeContext &&
                codeContext &&
                (codeContext.html ||
                    codeContext.css ||
                    codeContext.js ||
                    (Array.isArray(codeContext.modules) &&
                        codeContext.modules.length))
            ) {
                const parts = []
                if (codeContext.html)
                    parts.push('```html\n' + codeContext.html + '\n```')
                if (codeContext.css)
                    parts.push('```css\n' + codeContext.css + '\n```')
                if (codeContext.js)
                    parts.push('```javascript\n' + codeContext.js + '\n```')
                if (
                    Array.isArray(codeContext.modules) &&
                    codeContext.modules.length
                ) {
                    const upsert = codeContext.modules.map((m) => ({
                        name: m.name,
                        code: m.code,
                    }))
                    const json = JSON.stringify({ upsert }, null, 2)
                    parts.push('```modules\n' + json + '\n```')
                }
                chat.push({
                    role: 'system',
                    content:
                        'SOURCE OF TRUTH — Use ONLY the following as the current app code. Ignore any earlier code shown in this conversation. Return only the blocks that need changes, with full contents.\n\n' +
                        parts.join('\n\n'),
                })
            }

            if (lastUser) chat.push({ role: 'user', content: lastUser.content })
            return chat
        }

        const chat = buildChat()

        // Prepare a new assistant message we can stream into (so typing indicator can show immediately),
        // but do not include this placeholder in the API payload above.
        const assistantIndex = messages.length
        messages = [...messages, { role: 'assistant', content: '' }]

        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        }
        // Add recommended headers for OpenRouter in browser contexts
        if (endpoint.includes('openrouter.ai')) {
            headers['HTTP-Referer'] = location.origin
            headers['X-Title'] = 'Journals'
        }

        const body = JSON.stringify({
            model,
            messages: chat,
            stream: true,
        })

        // Wire up abort to allow stopping streaming requests
        currentAbort = new AbortController()
        const res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body,
            signal: currentAbort.signal,
        })
        if (!res.ok) {
            const errText = await res.text().catch(() => `${res.status}`)
            // Replace placeholder with error message
            const updated = [...messages]
            updated[assistantIndex] = {
                role: 'assistant',
                content: `Error: AI request failed (${res.status}): ${errText}`,
            }
            messages = updated
            busy = false
            currentAbort = null
            currentReader = null
            return
        }

        const ct = res.headers.get('content-type') || ''
        const isStream =
            !!res.body &&
            (ct.includes('text/event-stream') ||
                ct.includes('application/x-ndjson') ||
                ct.includes('application/event-stream') ||
                ct.includes('text/plain'))

        if (!isStream || !res.body) {
            // Fallback: parse JSON completion
            const data = await res.json()
            const content =
                data?.choices?.[0]?.message?.content ||
                data?.choices?.[0]?.text ||
                ''
            const updated = [...messages]
            updated[assistantIndex] = { role: 'assistant', content }
            // Compute diffs if code blocks present
            const extracted = extractCodeBlocks(content)
            if (
                extracted.html ||
                extracted.css ||
                extracted.js ||
                extracted.modules
            ) {
                const modulesDiffText = (() => {
                    if (!extracted.modules) return ''
                    try {
                        const mod = JSON.parse(extracted.modules)
                        const upserts = Array.isArray(mod.upsert)
                            ? mod.upsert
                            : []
                        if (!upserts.length) return ''
                        const currentIndex = new Map(
                            (codeContext.modules || []).map((m) => [
                                m.name,
                                m.code,
                            ]),
                        )
                        const patches = upserts
                            .filter((x) => x && typeof x.name === 'string')
                            .map((x) => ({
                                name: String(x.name).trim(),
                                code: String(x.code ?? ''),
                            }))
                            .filter(
                                (x) =>
                                    x.name &&
                                    !x.name.includes('/') &&
                                    x.name.toLowerCase().endsWith('.js'),
                            )
                            .map((x) =>
                                createPatch(
                                    x.name,
                                    currentIndex.get(x.name) || '',
                                    x.code,
                                ),
                            )
                        return patches.join('\n\n')
                    } catch {
                        return ''
                    }
                })()
                updated[assistantIndex].diffs = {
                    html: extracted.html
                        ? createPatch(
                              'HTML',
                              codeContext.html || '',
                              extracted.html,
                          )
                        : '',
                    css: extracted.css
                        ? createPatch(
                              'CSS',
                              codeContext.css || '',
                              extracted.css,
                          )
                        : '',
                    js: extracted.js
                        ? createPatch('JS', codeContext.js || '', extracted.js)
                        : '',
                    modules: modulesDiffText,
                }
                updated[assistantIndex].applied = {
                    html: false,
                    css: false,
                    js: false,
                    modules: false,
                }
                // Scroll to bottom after diffs are rendered
                tick().then(scrollToLatestDiff)
            }
            messages = updated
            busy = false
            return
        }

        const reader = res.body.getReader()
        currentReader = reader
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
                    const delta =
                        json?.choices?.[0]?.delta?.content ??
                        json?.choices?.[0]?.message?.content ??
                        ''
                    if (delta) {
                        const updated = [...messages]
                        updated[assistantIndex] = {
                            ...updated[assistantIndex],
                            content: updated[assistantIndex].content + delta,
                        }
                        messages = updated
                    }
                } catch (_) {
                    // Ignore JSON parse errors on partial lines
                }
            }
        }

        // After streaming, compute diffs if code blocks present
        const updated = [...messages]
        const finalContent = updated[assistantIndex].content
        const extracted = extractCodeBlocks(finalContent)
        if (
            extracted.html ||
            extracted.css ||
            extracted.js ||
            extracted.modules
        ) {
            const modulesDiffText = (() => {
                if (!extracted.modules) return ''
                try {
                    const mod = JSON.parse(extracted.modules)
                    const upserts = Array.isArray(mod.upsert) ? mod.upsert : []
                    if (!upserts.length) return ''
                    const currentIndex = new Map(
                        (codeContext.modules || []).map((m) => [
                            m.name,
                            m.code,
                        ]),
                    )
                    const patches = upserts
                        .filter((x) => x && typeof x.name === 'string')
                        .map((x) => ({
                            name: String(x.name).trim(),
                            code: String(x.code ?? ''),
                        }))
                        .filter(
                            (x) =>
                                x.name &&
                                !x.name.includes('/') &&
                                x.name.toLowerCase().endsWith('.js'),
                        )
                        .map((x) =>
                            createPatch(
                                x.name,
                                currentIndex.get(x.name) || '',
                                x.code,
                            ),
                        )
                    return patches.join('\n\n')
                } catch {
                    return ''
                }
            })()
            updated[assistantIndex].diffs = {
                html: extracted.html
                    ? createPatch(
                          'HTML',
                          codeContext.html || '',
                          extracted.html,
                      )
                    : '',
                css: extracted.css
                    ? createPatch('CSS', codeContext.css || '', extracted.css)
                    : '',
                js: extracted.js
                    ? createPatch('JS', codeContext.js || '', extracted.js)
                    : '',
                modules: modulesDiffText,
            }
            updated[assistantIndex].applied = {
                html: false,
                css: false,
                js: false,
                modules: false,
            }
            // Scroll to bottom after diffs are rendered
            tick().then(scrollToLatestDiff)
        }
        messages = updated

        busy = false
        currentAbort = null
        currentReader = null
    } catch (err) {
        // Special-case aborts: mark as stopped instead of error
        if (
            err &&
            (err.name === 'AbortError' || /abort/i.test(err.message || ''))
        ) {
            const idx =
                messages.length > 0 &&
                messages[messages.length - 1]?.role === 'assistant' &&
                messages[messages.length - 1]?.content !== undefined
                    ? messages.length - 1
                    : -1
            if (idx >= 0) {
                const updated = [...messages]
                updated[idx] = {
                    ...updated[idx],
                    content: (updated[idx].content || '') + '\n\n[stopped]',
                }
                messages = updated
            }
            busy = false
            currentAbort = null
            if (currentReader) {
                try {
                    await currentReader.cancel()
                } catch {}
            }
            currentReader = null
            return
        }
        // If a placeholder assistant exists, try to replace it; else append
        const idx =
            messages.length > 0 &&
            messages[messages.length - 1]?.role === 'assistant' &&
            messages[messages.length - 1]?.content === ''
                ? messages.length - 1
                : -1
        if (idx >= 0) {
            const updated = [...messages]
            updated[idx] = {
                ...updated[idx],
                content: `Error: ${err?.message || err}`,
            }
            messages = updated
        } else {
            messages = [
                ...messages,
                { role: 'assistant', content: `Error: ${err?.message || err}` },
            ]
        }
        busy = false
        currentAbort = null
        if (currentReader) {
            try {
                await currentReader.cancel()
            } catch {}
        }
        currentReader = null
    }
}

// Extract first set of html/css/js/modules blocks from a message content
function extractCodeBlocks(text) {
    const re = /```(\w+)?\n([\s\S]*?)```/g
    let m
    const out = {
        html: undefined,
        css: undefined,
        js: undefined,
        modules: undefined,
        blocks: [],
    }
    while ((m = re.exec(text))) {
        const lang = (m[1] || '').toLowerCase()
        const code = m[2]
        out.blocks.push({ lang, code })
        if ((lang === 'html' || lang === 'htm') && out.html === undefined)
            out.html = code
        else if (lang === 'css' && out.css === undefined) out.css = code
        else if (
            (lang === 'js' ||
                lang === 'javascript' ||
                lang === 'ts' ||
                lang === 'typescript') &&
            out.js === undefined
        )
            out.js = code
        else if (lang === 'modules' && out.modules === undefined)
            out.modules = code
    }
    return out
}

function parseDiff(diffText) {
    if (!diffText) return []
    const lines = diffText.split('\n')
    // Hide createPatch headers like "Index: CSS", separator lines, and file markers
    const isHeaderLine = (line) =>
        /^(Index:\s|={3,}$|---\s|\+\+\+\s)/.test(line)
    return lines
        .filter((line) => !isHeaderLine(line))
        .map((line) => {
            if (line.startsWith('+')) return { type: 'add', text: line }
            if (line.startsWith('-')) return { type: 'del', text: line }
            if (line.startsWith('@@')) return { type: 'hunk', text: line }
            return { type: 'context', text: line }
        })
}

// Extract module names from a message's modules code block
function getModuleNamesFromMessage(m) {
    try {
        const extracted = extractCodeBlocks(m?.content || '')
        if (!extracted.modules) return []
        const mod = JSON.parse(extracted.modules)
        const upserts = Array.isArray(mod.upsert) ? mod.upsert : []
        return upserts
            .map((x) => (x && typeof x.name === 'string' ? x.name : null))
            .filter(Boolean)
    } catch {
        return []
    }
}

function applySelection(
    m,
    sel = { html: true, css: true, js: true, modules: true },
) {
    const extracted = extractCodeBlocks(m.content)
    const delta = {}
    if (sel.html && extracted.html) delta.html = extracted.html
    if (sel.css && extracted.css) delta.css = extracted.css
    if (sel.js && extracted.js) delta.js = extracted.js
    if (sel.modules && extracted.modules) {
        try {
            const mod = JSON.parse(extracted.modules)
            if (mod && Array.isArray(mod.upsert) && mod.upsert.length) {
                const sanitized = mod.upsert
                    .filter((it) => it && typeof it.name === 'string')
                    .map((it) => ({
                        name: String(it.name).trim(),
                        code: String(it.code ?? ''),
                    }))
                    .filter(
                        (it) =>
                            it.name &&
                            !it.name.includes('/') &&
                            it.name.toLowerCase().endsWith('.js'),
                    )
                if (sanitized.length) delta.modulesUpsert = sanitized
            }
        } catch {}
    }
    if (Object.keys(delta).length === 0) return

    // Directly apply without confirmation
    const changed = Object.keys(delta)
    const prev = {}
    const next = {}
    for (const k of changed) {
        if (k === 'modulesUpsert') {
            // Capture previous code for each module being changed, so revert can restore them
            const currentIndex = new Map(
                (codeContext.modules || []).map((m) => [m.name, m.code]),
            )
            prev[k] = (delta.modulesUpsert || []).map((it) => ({
                name: it.name,
                code: currentIndex.get(it.name) || '',
            }))
            next[k] = delta[k]
        } else {
            prev[k] = codeContext?.[k] ?? ''
            next[k] = delta[k]
        }
    }

    const checkpoint = {
        id: Date.now() + Math.random(),
        changed,
        prev,
        next,
        createdAt: new Date().toISOString(),
        reverted: false,
        diffs: {
            html: sel.html ? m.diffs.html : '',
            css: sel.css ? m.diffs.css : '',
            js: sel.js ? m.diffs.js : '',
        },
    }

    // Mark applied in the message
    if (!m.applied)
        m.applied = { html: false, css: false, js: false, modules: false }
    const isApplyAll = sel.html && sel.css && sel.js && sel.modules
    if (isApplyAll) {
        // For Apply All, mark all as applied
        m.applied.html = !!extracted.html
        m.applied.css = !!extracted.css
        m.applied.js = !!extracted.js
        m.applied.modules = !!extracted.modules
    } else {
        // For specific applies
        if (delta.html) m.applied.html = true
        if (delta.css) m.applied.css = true
        if (delta.js) m.applied.js = true
        if (delta.modulesUpsert) m.applied.modules = true
    }

    // Find the index and reassign to trigger reactivity
    const index = messages.indexOf(m)
    if (index !== -1) {
        messages[index] = { ...messages[index] }
    }

    messages = [
        ...messages,
        {
            role: 'system',
            type: 'checkpoint',
            content: `Applied changes to: ${changed.join(', ') || '—'}`,
            checkpoint,
        },
    ]

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

function revertCheckpoint(checkpoint) {
    if (!checkpoint || checkpoint.reverted) return
    const revertDelta = {}
    for (const blockName of checkpoint.changed) {
        if (blockName === 'modulesUpsert') {
            // Build upserts to restore previous module contents
            const prevMods = Array.isArray(checkpoint.prev?.modulesUpsert)
                ? checkpoint.prev.modulesUpsert
                : []
            if (prevMods.length)
                revertDelta.modulesUpsert = prevMods.map((m) => ({
                    name: m.name,
                    code: m.code,
                }))
        } else {
            revertDelta[blockName] = checkpoint.prev?.[blockName] ?? ''
        }
    }
    // Mark as reverted locally
    checkpoint.reverted = true
    // Dispatch revert to parent
    dispatch('apply', revertDelta)
    // Find the assistant message before this checkpoint and reset applied state
    const checkpointIndex = messages.findIndex(
        (msg) => msg.checkpoint === checkpoint,
    )
    if (checkpointIndex > 0) {
        const assistantMsg = messages[checkpointIndex - 1]
        if (assistantMsg.role === 'assistant' && assistantMsg.applied) {
            for (const block of checkpoint.changed) {
                assistantMsg.applied[block] = false
            }
            // Reassign to trigger reactivity
            messages[checkpointIndex - 1] = { ...messages[checkpointIndex - 1] }
        }
    }
    // Log a small system message
    messages = [
        ...messages,
        {
            role: 'system',
            type: 'revert',
            content: `Reverted checkpoint (${checkpoint.changed.join(', ')}). The next request will include the current code snapshot as the only source of truth; ignore earlier assistant code.`,
        },
    ]
}

function clearChat() {
    messages = []
}

// --- Stop/Cancel generation support ---
let currentAbort = null
let currentReader = null
function stop() {
    try {
        currentAbort?.abort()
    } catch {}
    try {
        currentReader?.cancel()
    } catch {}
}

// Ensure the modal only closes when a click both starts AND ends on the overlay background
let overlayMouseDown = false
function onOverlayMouseDown(e) {
    // Only mark true if the initial press is directly on the overlay (not a child)
    overlayMouseDown = e.target === e.currentTarget
}
function onOverlayClick(e) {
    // Close only if the click target is the overlay itself and the press started on it
    if (e.target !== e.currentTarget) return
    if (!overlayMouseDown) return
    close()
}

function processContent(content, hasDiffs) {
    if (!hasDiffs) return content
    // Replace code blocks with a note
    return content.replace(/```[\s\S]*?```/g, '[code omitted - see diff below]')
}
</script>

{#if open}
    <div
        class="ai-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="AI Assistant"
        on:mousedown={onOverlayMouseDown}
        on:click={onOverlayClick}
    >
        <div class="ai-panel" bind:this={panelEl} on:click|stopPropagation>
            <div class="ai-header">
                <div class="title">AI Assistant</div>
                <div class="spacer"></div>
                <button class="ghost" on:click={close} aria-label="Close"
                    >✕</button
                >
            </div>
            <div class="ai-body">
                <div
                    class="messages"
                    aria-live="polite"
                    bind:this={messagesContainer}
                >
                    {#if initialContext}
                        <div class="message system">
                            <div class="label">Prompt</div>
                            <div class="content">
                                <textarea
                                    class="system-prompt"
                                    bind:value={initialContext}
                                    readonly
                                ></textarea>
                            </div>
                        </div>
                    {/if}
                    {#each messages as m, i}
                        <div class="message {m.role} {m.type || ''}">
                            {#if m.type === 'checkpoint'}
                                <div class="label">Checkpoint</div>
                            {:else if m.type === 'revert'}
                                <div class="label">System</div>
                            {:else if m.role === 'user'}
                                <div class="label">You</div>
                            {:else}
                                <div class="label">Assistant</div>
                            {/if}
                            <div class="content">
                                {#if m.type === 'checkpoint'}
                                    <div class="checkpoint-row">
                                        <div>
                                            {m.content}
                                            {#if m.checkpoint?.createdAt}
                                                <span class="muted">
                                                    · {new Date(
                                                        m.checkpoint.createdAt,
                                                    ).toLocaleTimeString()}</span
                                                >
                                            {/if}
                                        </div>
                                        <div class="checkpoint-actions">
                                            <button
                                                on:click={() =>
                                                    revertCheckpoint(
                                                        m.checkpoint,
                                                    )}
                                                disabled={m.checkpoint
                                                    ?.reverted}
                                            >
                                                {m.checkpoint?.reverted
                                                    ? 'Reverted'
                                                    : 'Revert'}
                                            </button>
                                        </div>
                                    </div>
                                {:else if m.role === 'assistant' && (!m.content || m.content.trim() === '') && busy && i === messages.length - 1}
                                    <span
                                        class="typing"
                                        aria-label="Assistant is typing"
                                        role="status"
                                    >
                                        <span class="dot"></span><span
                                            class="dot"
                                        ></span><span class="dot"></span>
                                    </span>
                                {:else}
                                    {processContent(m.content, !!m.diffs)}
                                {/if}
                            </div>
                            {#if m.diffs}
                                <div class="diff-preview">
                                    {#if m.diffs.html}
                                        <div class="diff-section">
                                            <div class="diff-header">
                                                <h5>HTML Changes</h5>
                                                <button
                                                    on:click={() =>
                                                        applySelection(m, {
                                                            html: true,
                                                            css: false,
                                                            js: false,
                                                        })}
                                                    disabled={m.applied?.html}
                                                    >Apply</button
                                                >
                                            </div>
                                            <div class="diff-view">
                                                {#each parseDiff(m.diffs.html) as line}
                                                    <div
                                                        class="diff-line {line.type}"
                                                    >
                                                        {line.text}
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    {/if}
                                    {#if m.diffs.css}
                                        <div class="diff-section">
                                            <div class="diff-header">
                                                <h5>CSS Changes</h5>
                                                <button
                                                    on:click={() =>
                                                        applySelection(m, {
                                                            html: false,
                                                            css: true,
                                                            js: false,
                                                        })}
                                                    disabled={m.applied?.css}
                                                    >Apply</button
                                                >
                                            </div>
                                            <div class="diff-view">
                                                {#each parseDiff(m.diffs.css) as line}
                                                    <div
                                                        class="diff-line {line.type}"
                                                    >
                                                        {line.text}
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    {/if}
                                    {#if m.diffs.js}
                                        <div class="diff-section">
                                            <div class="diff-header">
                                                <h5>JS Changes</h5>
                                                <button
                                                    on:click={() =>
                                                        applySelection(m, {
                                                            html: false,
                                                            css: false,
                                                            js: true,
                                                        })}
                                                    disabled={m.applied?.js}
                                                    >Apply</button
                                                >
                                            </div>
                                            <div class="diff-view">
                                                {#each parseDiff(m.diffs.js) as line}
                                                    <div
                                                        class="diff-line {line.type}"
                                                    >
                                                        {line.text}
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    {/if}
                                    {#if m.diffs.modules}
                                        <div class="diff-section">
                                            <div class="diff-header">
                                                {#if getModuleNamesFromMessage(m).length}
                                                    <h5>
                                                        Modules: {getModuleNamesFromMessage(
                                                            m,
                                                        ).join(', ')}
                                                    </h5>
                                                {:else}
                                                    <h5>Module Upserts</h5>
                                                {/if}
                                                <button
                                                    on:click={() =>
                                                        applySelection(m, {
                                                            html: false,
                                                            css: false,
                                                            js: false,
                                                            modules: true,
                                                        })}
                                                    disabled={m.applied
                                                        ?.modules}>Apply</button
                                                >
                                            </div>
                                            <div class="diff-view">
                                                {#each parseDiff(m.diffs.modules) as line}
                                                    <div
                                                        class="diff-line {line.type}"
                                                    >
                                                        {line.text}
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    {/if}
                                    <div class="apply-actions">
                                        <button
                                            on:click={() =>
                                                applySelection(m, {
                                                    html: true,
                                                    css: true,
                                                    js: true,
                                                    modules: true,
                                                })}
                                            disabled={(m.applied?.html ||
                                                !m.diffs.html) &&
                                                (m.applied?.css ||
                                                    !m.diffs.css) &&
                                                (m.applied?.js ||
                                                    !m.diffs.js) &&
                                                (m.applied?.modules ||
                                                    !m.diffs.modules)}
                                            >Apply All</button
                                        >
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
            <div class="ai-input">
                <textarea
                    rows="3"
                    bind:value={input}
                    placeholder="Describe the app or change you want… (Enter to send)"
                    on:keydown={keydown}
                ></textarea>
                <button
                    class="send"
                    on:click={busy ? stop : send}
                    disabled={!busy && (!input.trim() || !isConfigured)}
                    >{busy ? 'Stop' : 'Send'}</button
                >
            </div>
            <div class="ai-footer">
                <div
                    style="display:flex; gap:.5rem; align-items:center; justify-content:space-between;"
                >
                    <span
                        >Configure AI{#if !isConfigured}<span
                                style="margin-left:.4rem; color:#b91c1c;"
                                >(required)</span
                            >{/if}</span
                    >
                    <div style="display:flex; gap:.5rem; align-items:center;">
                        <button
                            class="ghost"
                            on:click={clearChat}
                            title="Clear chat history">Clear Chat</button
                        >
                        <button
                            class="ghost"
                            on:click={() => {
                                showSettings = !showSettings
                            }}
                            aria-expanded={showSettings}
                            >{showSettings ? 'Hide' : 'Show'} Settings</button
                        >
                    </div>
                </div>
                {#if codeContext && (codeContext.html || codeContext.css || codeContext.js)}
                    <div class="ctx-row">
                        <label class="ctx-toggle"
                            ><input
                                type="checkbox"
                                bind:checked={includeContext}
                                on:change={saveIncludeContext}
                            /> Include current HTML/CSS/JS as context</label
                        >
                    </div>
                {/if}
                {#if showSettings}
                    <div class="settings">
                        <div class="row">
                            <label for="ai-api-url">API URL</label>
                            <input
                                id="ai-api-url"
                                type="text"
                                bind:value={config.apiUrl}
                                placeholder="https://openrouter.ai/api/v1/chat/completions"
                            />
                        </div>
                        <div class="row">
                            <label for="ai-model">Model</label>
                            <input
                                id="ai-model"
                                type="text"
                                bind:value={config.model}
                                placeholder="x-ai/grok-code-fast-1"
                            />
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
                                    aria-label={showApiKey
                                        ? 'Hide API key'
                                        : 'Show API key'}
                                    aria-pressed={showApiKey}
                                    title={showApiKey ? 'Hide' : 'Show'}
                                    >{showApiKey ? '🙈' : '👁'}</button
                                >
                            </div>
                        </div>
                        <div class="row actions">
                            <button
                                on:click={() => {
                                    saveConfig()
                                }}>Save</button
                            >
                            <button
                                class="ghost"
                                on:click={() => {
                                    clearConfig()
                                }}>Reset</button
                            >
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
    background: rgba(0, 0, 0, 0.35);
    display: grid;
    place-items: center;
    z-index: 2;
}
.ai-panel {
    width: min(980px, 96vw);
    height: min(640px, 90vh);
    background: #fff;
    border: 1px solid #d0d7de;
    border-radius: 8px;
    display: grid;
    grid-template-rows: auto 1fr auto auto;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}
.ai-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.8rem;
    border-bottom: 1px solid #e5e7eb;
}
.ai-header .title {
    font-weight: 700;
}
.ai-header .spacer {
    flex: 1;
}
.ai-header .ghost {
    border: 0;
    background: none;
    cursor: pointer;
    font-size: 1.1rem;
}

.ai-body {
    display: grid;
    grid-template-columns: 1fr;
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
.message {
    margin-bottom: 0.5rem;
}
.message .label {
    font-size: 0.8rem;
    color: #6b7280;
    margin-bottom: 0.1rem;
}
.message.user .content {
    background: #eef2ff;
}
.message.assistant .content {
    background: #f1f5f9;
}
.message .content {
    white-space: pre-wrap;
    padding: 0.5rem;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    font-family:
        ui-sans-serif,
        system-ui,
        -apple-system,
        Segoe UI,
        Roboto,
        Ubuntu,
        Cantarell,
        Noto Sans,
        Helvetica Neue,
        Arial,
        'Apple Color Emoji',
        'Segoe UI Emoji';
}
.message.checkpoint .content {
    background: #fff7ed;
    border-color: #fdba74;
}
.message.revert .content {
    background: #fef2f2;
    border-color: #fecaca;
}
.checkpoint-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
}
.checkpoint-actions button {
    border: 1px solid #d1d5db;
    background: #fff;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    cursor: pointer;
}
.checkpoint-actions button[disabled] {
    opacity: 0.6;
    cursor: default;
}
.muted {
    color: #6b7280;
    font-size: 0.8rem;
}

.system-prompt {
    width: 100%;
    height: 10rem;
    height: 10rem;
    resize: none;
    overflow: auto;
    font: inherit;
    line-height: 1.2;
    color: #111827;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.4rem 0.5rem;
}

/* Inline typing indicator inside assistant bubble */
.typing {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    height: 1em;
}
.typing .dot {
    width: 6px;
    height: 6px;
    background: #9ca3af;
    border-radius: 50%;
    display: inline-block;
    animation: typing-bounce 1.2s infinite ease-in-out;
}
.typing .dot:nth-child(2) {
    animation-delay: 0.2s;
}
.typing .dot:nth-child(3) {
    animation-delay: 0.4s;
}
@keyframes typing-bounce {
    0%,
    80%,
    100% {
        opacity: 0.25;
        transform: translateY(0);
    }
    40% {
        opacity: 1;
        transform: translateY(-3px);
    }
}

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
.ai-input .send:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.ai-footer {
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
    color: #6b7280;
    border-top: 1px solid #e5e7eb;
}
.ctx-row {
    margin-top: 0.4rem;
}
.ctx-toggle {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
}
.settings {
    margin-top: 0.5rem;
    display: grid;
    gap: 0.5rem;
}
.settings .row {
    display: grid;
    gap: 0.25rem;
}
.settings .row label {
    font-size: 0.8rem;
    color: #4b5563;
}
.settings .row input {
    padding: 0.4rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font: inherit;
}
.settings .row.actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
}
.settings .input-with-toggle {
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
}
.settings .input-with-toggle input {
    width: 100%;
}
.settings .input-with-toggle .eye {
    margin-left: 0.4rem;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    border-radius: 6px;
    padding: 0.3rem 0.5rem;
    cursor: pointer;
}

.diff-view {
    font-family: monospace;
    font-size: 0.8rem;
    background: #f4f4f4;
    padding: 0.5rem;
    border-radius: 4px;
    white-space: pre-wrap;
}
.diff-line {
    margin: 0;
}
.diff-line.add {
    color: green;
}
.diff-line.del {
    color: red;
}
.diff-line.hunk {
    color: blue;
    font-weight: bold;
}
.diff-line.context {
    color: black;
}

.diff-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
    padding: 0.25rem 0;
}
.diff-header h5 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: #374151;
}

.diff-header button {
    border: 1px solid #d1d5db;
    background: #fff;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
}
.apply-actions {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
}
.apply-actions button {
    border: 1px solid #d1d5db;
    background: #fff;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
}
</style>
