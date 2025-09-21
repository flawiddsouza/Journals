<script>
export let kv = {}
export let readOnly = false

import { createEventDispatcher } from 'svelte'
import Toast from './Toast.svelte'

const dispatch = createEventDispatcher()

// Data viewer helpers/state
let dataFilter = ''
let expanded = {}
let copyFeedback = ''
let copyIsError = false

function valueType(v) {
    if (v === null) return 'null'
    const t = typeof v
    if (t !== 'object') return t
    if (Array.isArray(v)) return 'array'
    return 'object'
}

function previewValue(v) {
    const t = valueType(v)
    switch (t) {
        case 'string':
            return v.length > 60 ? v.slice(0, 57) + '…' : v
        case 'number':
        case 'boolean':
        case 'null':
            return String(v)
        case 'array':
            return `Array(${v.length})`
        case 'object':
            return 'Object'
        case 'undefined':
            return 'undefined'
        default:
            return t
    }
}

function toggleExpand(key) {
    expanded[key] = !expanded[key]
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard?.writeText(text)
        copyIsError = false
        copyFeedback = 'Copied to clipboard!'
        setTimeout(() => (copyFeedback = ''), 2000)
    } catch (_) {
        copyIsError = true
        copyFeedback = 'Failed to copy'
        setTimeout(() => (copyFeedback = ''), 2000)
    }
}

function downloadJSON(filename, dataObj) {
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], {
        type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}

function handleClearData() {
    if (readOnly) return
    if (!confirm("Clear this Mini App's data?")) return
    dispatch('clearData')
}

$: kvEntries = Object.entries(kv).sort((a, b) => a[0].localeCompare(b[0]))
$: filteredEntries = dataFilter.trim()
    ? kvEntries.filter(([k, v]) =>
          k.toLowerCase().includes(dataFilter.toLowerCase()),
      )
    : kvEntries
</script>

<div class="data-viewer" role="region" aria-label="Stored data viewer">
    <div class="data-header">
        <div class="data-title">Stored Data</div>
        <div class="data-actions">
            <input
                type="search"
                placeholder="Filter by key"
                bind:value={dataFilter}
                aria-label="Filter stored keys"
            />
            <button
                on:click={() => copyToClipboard(JSON.stringify(kv, null, 2))}
                title="Copy all as JSON">Copy all</button
            >
            <button
                on:click={() => downloadJSON('miniapp-data.json', kv)}
                title="Download JSON">Download</button
            >
            {#if !readOnly}
                <button on:click={handleClearData} class="clear-btn"
                    >Clear Data</button
                >
            {/if}
        </div>
    </div>

    <Toast
        message={copyFeedback}
        variant={copyIsError ? 'error' : 'success'}
        position="top"
        align="center"
    />

    {#if kvEntries.length === 0}
        <div class="data-empty">No data stored yet.</div>
    {:else if filteredEntries.length === 0}
        <div class="data-empty">No keys match the filter.</div>
    {:else}
        <div class="data-list">
            {#each filteredEntries as [key, value]}
                <div class="data-item">
                    <div class="data-key">
                        <code>{key}</code>
                        <span class="data-type">({valueType(value)})</span>
                    </div>
                    <div class="data-content">
                        <div class="data-preview">
                            <span class="preview-text"
                                >{previewValue(value)}</span
                            >
                            {#if valueType(value) === 'object' || valueType(value) === 'array'}
                                <button
                                    class="expand-btn"
                                    on:click={() => toggleExpand(key)}
                                >
                                    {expanded[key] ? 'Collapse' : 'Expand'}
                                </button>
                            {/if}
                        </div>
                        {#if expanded[key]}
                            <pre class="json-full"><code
                                    >{JSON.stringify(value, null, 2)}</code
                                ></pre>
                        {/if}
                    </div>
                    <div class="data-actions">
                        <button
                            on:click={() =>
                                copyToClipboard(JSON.stringify(value, null, 2))}
                            title="Copy value">Copy</button
                        >
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
.data-viewer {
    border: 1px solid #d0d7de;
    border-radius: 8px;
    background: #f8f9fa;
    color: #24292f;
    font-size: 0.9rem;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    position: relative; /* allow floating toast inside */
}

.data-header {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #d0d7de;
    background: #ffffff;
    border-radius: 8px 8px 0 0;
    flex-shrink: 0;
}

.data-title {
    font-weight: 600;
    font-size: 1rem;
    color: #1f2937;
}

.data-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
}

.data-actions input[type='search'] {
    padding: 0.375rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #ffffff;
    font-size: 0.875rem;
    min-width: 150px;
}

.data-actions button {
    padding: 0.375rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #ffffff;
    color: #374151;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
}

.data-actions button:hover {
    background: #f1f5f9;
    border-color: #9ca3af;
}

.clear-btn {
    background: #dc2626 !important;
    color: #ffffff !important;
    border-color: #dc2626 !important;
}

.clear-btn:hover {
    background: #b91c1c !important;
    border-color: #b91c1c !important;
}

.data-empty {
    padding: 2rem 1rem;
    color: #6b7280;
    text-align: center;
    font-style: italic;
    flex-shrink: 0;
}

.data-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.data-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.data-key {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
}

.data-key code {
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
    background: #f1f5f9;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    color: #1e293b;
    font-size: 0.875rem;
}

.data-type {
    color: #6b7280;
    font-size: 0.75rem;
    font-weight: 400;
}

.data-content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.data-preview {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
}

.preview-text {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
    background: #f8fafc;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
    font-size: 0.875rem;
}

.expand-btn {
    padding: 0.25rem 0.5rem;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    background: #ffffff;
    color: #475569;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
}

.expand-btn:hover {
    background: #f1f5f9;
    border-color: #94a3b8;
}

.json-full {
    margin: 0;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 0.75rem;
    max-height: 20vh;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    font-size: 0.8rem;
    line-height: 1.4;
}

.json-full code {
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
    color: #1e293b;
}

.data-actions {
    display: flex;
    gap: 0.25rem;
    align-self: flex-start;
}

.data-actions button {
    padding: 0.25rem 0.5rem;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    background: #ffffff;
    color: #475569;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
}

.data-actions button:hover {
    background: #f1f5f9;
    border-color: #94a3b8;
}
</style>
