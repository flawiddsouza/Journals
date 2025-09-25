<script>
export let pageId = null

import fetchPlus from '../helpers/fetchPlus.js'
import { createEventDispatcher } from 'svelte'
import { createPatch } from 'diff'

const dispatch = createEventDispatcher()

let activeTab = 'starred' // starred | all | yours
let sortAll = 'stars' // stars | alpha

let list = []
let loading = false
let error = ''

// Track which templates are starred by the current user for instant UI feedback
let myStars = new Set()

let detail = null // selected template for detail view
let revisions = []
let revDiff = null // { current, previous }
let perFileDiffs = [] // [{ title: string, lines: Array<{ text: string, cls: string }> }]
// Track which revision's diff is open
let revOpen = null // { templateId, revisionNumber }

// Inline edit state for template meta (owner-only)
let editOpen = false
let editName = ''
let editDescription = ''
let editBusy = false
let editError = ''

// Show newest revisions first in the table
$: sortedRevisions = Array.isArray(revisions)
    ? [...revisions].sort(
          (a, b) => (b?.revision_number || 0) - (a?.revision_number || 0),
      )
    : []

// Parse a MiniApp content JSON string into a normalized shape
function parseMiniAppContentStr(str) {
    try {
        const obj = typeof str === 'string' ? JSON.parse(str || 'null') : str
        const files = obj && obj.files ? obj.files : {}
        return {
            files: {
                html: files.html || '',
                css: files.css || '',
                js: files.js || '',
                modules: Array.isArray(files.modules) ? files.modules : [], // [{ name, code }]
            },
        }
    } catch {
        return { files: { html: '', css: '', js: '', modules: [] } }
    }
}

function classifyDiffLine(ln) {
    if (ln.startsWith('+')) return 'added'
    if (ln.startsWith('-')) return 'removed'
    if (ln.startsWith('@@')) return 'hunk'
    if (ln.startsWith('Index') || ln.startsWith('---') || ln.startsWith('+++'))
        return 'file'
    return 'ctx'
}

// Hide createPatch headers like "Index: CSS", separator lines, and file markers
function isHeaderLine(line) {
    return /^(Index:\s|={3,}$|---\s|\+\+\+\s)/.test(line)
}

function buildUnifiedLines(label, prevStr, curStr) {
    const patch = createPatch(label, prevStr || '', curStr || '')
    return patch
        .split('\n')
        .filter((text) => !isHeaderLine(text))
        .filter((text) => text.trim().length > 0)
        .map((text) => ({ text, cls: classifyDiffLine(text) }))
}

function buildPerFileDiffs(previousStr, currentStr) {
    const cur = parseMiniAppContentStr(currentStr)
    const prev = parseMiniAppContentStr(previousStr)

    const sections = []
    // Core files
    {
        const lines = buildUnifiedLines('HTML', prev.files.html, cur.files.html)
        if (lines.length) sections.push({ title: 'HTML', lines })
    }
    {
        const lines = buildUnifiedLines('CSS', prev.files.css, cur.files.css)
        if (lines.length) sections.push({ title: 'CSS', lines })
    }
    {
        const lines = buildUnifiedLines('JS', prev.files.js, cur.files.js)
        if (lines.length) sections.push({ title: 'JS', lines })
    }

    // Modules by name (union)
    const prevMap = new Map(
        prev.files.modules.map((m) => [
            m && m.name ? String(m.name) : '',
            (m && m.code) || '',
        ]),
    )
    const curMap = new Map(
        cur.files.modules.map((m) => [
            m && m.name ? String(m.name) : '',
            (m && m.code) || '',
        ]),
    )
    const names = Array.from(new Set([...prevMap.keys(), ...curMap.keys()]))
        .filter((n) => n && typeof n === 'string')
        .sort((a, b) => a.localeCompare(b))
    for (const name of names) {
        const before = prevMap.has(name) ? prevMap.get(name) : ''
        const after = curMap.has(name) ? curMap.get(name) : ''
        const lines = buildUnifiedLines(`modules/${name}`, before, after)
        if (lines.length)
            sections.push({
                title: `modules/${name}`,
                lines,
            })
    }

    perFileDiffs = sections
}

let publishOpen = false
let publish = { name: '', description: '', isPublic: true }
// Publish modes: create brand new template or add a revision to existing one
let publishMode = 'new' // 'new' | 'existing'
let yourTemplates = []
let selectedTemplateId = null
let publishBusy = false
let publishError = ''

async function loadYourTemplates() {
    try {
        const rows = await fetchPlus.get(
            '/miniapp/templates?tab=yours&sort=alpha',
        )
        yourTemplates = Array.isArray(rows) ? rows : []
        // Preselect first template if none chosen
        if (!selectedTemplateId && yourTemplates.length) {
            selectedTemplateId = yourTemplates[0].id
        }
    } catch (e) {
        yourTemplates = []
    }
}

function closePublishPanel() {
    publishOpen = false
    publish = { name: '', description: '', isPublic: true }
    publishMode = 'new'
    selectedTemplateId = null
    publishBusy = false
    publishError = ''
}

async function loadList() {
    loading = true
    error = ''
    try {
        const params = new URLSearchParams()
        params.set('tab', activeTab)
        // Apply sort to all tabs
        if (sortAll) params.set('sort', sortAll)
        list = await fetchPlus.get(`/miniapp/templates?${params.toString()}`)
        // If we're on the Starred tab, capture the starred ids locally so other tabs
        // can immediately show the correct inverse action without waiting on the API.
        if (activeTab === 'starred' && Array.isArray(list)) {
            myStars = new Set(list.map((i) => i && i.id))
        }
    } catch (e) {
        error = 'Failed to load templates'
    } finally {
        loading = false
    }
}

// Reload list when tab or sort changes, for all tabs
$: if (activeTab && sortAll) loadList()

// Explicitly switch tabs and clear any open template detail/diff/edit state
function switchTab(tab) {
    if (activeTab === tab) return
    activeTab = tab
    // Leave detail view and clear any diff/edit UI state
    detail = null
    revDiff = null
    perFileDiffs = []
    revOpen = null
    editOpen = false
}

async function openDetail(item) {
    try {
        revDiff = null
        revOpen = null
        detail = await fetchPlus.get(`/miniapp/templates/${item.id}`)
        revisions = await fetchPlus.get(
            `/miniapp/templates/${item.id}/revisions`,
        )
        // Reset edit state when opening a new detail
        editOpen = false
        editName = ''
        editDescription = ''
        editBusy = false
        editError = ''
    } catch (e) {
        error = 'Failed to load template details'
    }
}

async function togglePublic(item) {
    const next = !item.is_public
    try {
        await fetchPlus.put(`/miniapp/templates/${item.id}`, { isPublic: next })
        // Immutable local updates to trigger Svelte reactivity
        list = (list || []).map((i) =>
            i && i.id === item.id ? { ...i, is_public: next } : i,
        )
        if (detail && detail.id === item.id) {
            detail = { ...detail, is_public: next }
        }
    } catch (e) {
        // Optionally report error; leaving silent to match existing UI pattern
        // error = 'Failed to update visibility'
    }
}

async function deleteTemplate(item) {
    if (!confirm('Delete this template and all its revisions?')) return
    await fetchPlus.delete(`/miniapp/templates/${item.id}`)
    await loadList()
    if (detail && detail.id === item.id) detail = null
}

async function star(item) {
    try {
        await fetchPlus.post(`/miniapp/templates/${item.id}/star`, {})
        // Optimistic local update so button flips immediately
        myStars.add(item.id)
        myStars = new Set(myStars) // trigger reactivity
        item.stars = (item.stars || 0) + 1
    } finally {
        // Keep list in sync with server (also updates other tabs)
        await loadList()
    }
}

async function unstar(item) {
    try {
        await fetchPlus.delete(`/miniapp/templates/${item.id}/star`)
        // Optimistic local update so button flips immediately
        myStars.delete(item.id)
        myStars = new Set(myStars) // trigger reactivity
        item.stars = Math.max(0, (item.stars || 0) - 1)
        // If we're on the Starred tab, remove immediately from the list
        if (activeTab === 'starred') {
            list = list.filter((i) => i.id !== item.id)
        }
    } finally {
        // Refresh in background to ensure consistency
        await loadList()
    }
}

async function applyToPage(templateId, rev = null) {
    const msg = rev
        ? `Apply this template revision (#${rev}) to the page? This will overwrite your current mini app content.`
        : 'Apply the latest revision of this template to the page? This will overwrite your current mini app content.'
    if (!confirm(msg)) return
    const body = { pageId }
    if (rev) body.revision = rev
    await fetchPlus.post(`/miniapp/templates/${templateId}/apply-to-page`, body)
    // Notify parent to refresh mini app content and link
    dispatch('applied')
}

async function showDiff(templateId, revNumber) {
    // Toggle if the same diff is requested again
    if (
        revOpen &&
        revOpen.templateId === templateId &&
        revOpen.revisionNumber === revNumber
    ) {
        revDiff = null
        perFileDiffs = []
        revOpen = null
        return
    }
    revOpen = { templateId, revisionNumber: revNumber }
    revDiff = await fetchPlus.get(
        `/miniapp/templates/${templateId}/revisions/${revNumber}`,
    )
    const curRaw = revDiff?.current || ''
    const prevRaw = revDiff?.previous || ''
    buildPerFileDiffs(prevRaw, curRaw)
}

function closeDiff() {
    revDiff = null
    perFileDiffs = []
    revOpen = null
}

async function publishFromCurrentPage() {
    publishBusy = true
    publishError = ''
    try {
        if (publishMode === 'existing') {
            if (!selectedTemplateId) {
                alert('Choose a template to update')
                return
            }
            await fetchPlus.post(
                `/miniapp/templates/${selectedTemplateId}/revisions`,
                {
                    pageId,
                },
            )
            // Stay on Yours tab and refresh
            activeTab = 'yours'
            await loadList()
        } else {
            if (!publish.name.trim()) {
                alert('Enter a name')
                return
            }
            const body = {
                name: publish.name,
                description: publish.description,
                isPublic: !!publish.isPublic,
                pageId: pageId,
            }
            await fetchPlus.post('/miniapp/templates', body)
            activeTab = 'yours'
            await loadList()
            publish = { name: '', description: '', isPublic: true }
        }
        publishOpen = false
    } catch (e) {
        publishError = 'Failed to publish. Please try again.'
    } finally {
        publishBusy = false
    }
}

function openEdit() {
    if (!detail) return
    editName = detail.name || ''
    editDescription = detail.description || ''
    editError = ''
    editBusy = false
    editOpen = true
}

function cancelEdit() {
    editOpen = false
    editError = ''
    editBusy = false
}

async function saveEdit() {
    if (!detail) return
    const trimmed = (editName || '').trim()
    if (!trimmed) {
        alert('Enter a name')
        return
    }
    editBusy = true
    editError = ''
    try {
        const payload = { name: trimmed, description: editDescription || '' }
        await fetchPlus.put(`/miniapp/templates/${detail.id}`, payload)
        // Update local state for instant feedback
        detail = {
            ...detail,
            name: payload.name,
            description: payload.description,
        }
        list = (list || []).map((i) =>
            i && i.id === detail.id
                ? { ...i, name: payload.name, description: payload.description }
                : i,
        )
        editOpen = false
    } catch (e) {
        editError = 'Failed to save changes'
    } finally {
        editBusy = false
    }
}
</script>

<div class="templates" role="region" aria-label="Mini App Templates">
    <div class="header">
        <div class="left">
            <div class="templates-title">Mini App Templates</div>
            <div class="tabs" role="tablist" aria-label="Mini App Templates">
                <button
                    role="tab"
                    class:active={activeTab === 'starred'}
                    on:click={() => switchTab('starred')}>Starred</button
                >
                <button
                    role="tab"
                    class:active={activeTab === 'all'}
                    on:click={() => switchTab('all')}>All</button
                >
                <button
                    role="tab"
                    class:active={activeTab === 'yours'}
                    on:click={() => switchTab('yours')}>Yours</button
                >
            </div>
        </div>
        <div class="actions">
            <label
                >Sort:
                <select bind:value={sortAll} aria-label="Sort templates">
                    <option value="stars">Stars</option>
                    <option value="alpha">A → Z</option>
                </select>
            </label>
            <button on:click={() => { publishOpen = !publishOpen; if (publishOpen) activeTab = 'yours'; }}
                >Publish current mini app</button
            >
        </div>
    </div>

    {#if publishOpen}
        <div class="publish">
            <div class="row" style="gap:1rem">
                <label
                    ><input
                        type="radio"
                        name="pubmode"
                        value="new"
                        bind:group={publishMode}
                        on:change={() => {
                            /* no-op */
                        }}
                    /> New template</label
                >
                <label
                    ><input
                        type="radio"
                        name="pubmode"
                        value="existing"
                        bind:group={publishMode}
                        on:change={() => loadYourTemplates()}
                    /> New revision of existing</label
                >
            </div>
            {#if publishMode === 'new'}
                <div class="row">
                    <label for="tmpl-name">Name</label>
                    <input
                        id="tmpl-name"
                        bind:value={publish.name}
                        placeholder="Template name"
                    />
                </div>
                <div class="row">
                    <label for="tmpl-desc">Description</label>
                    <input
                        id="tmpl-desc"
                        bind:value={publish.description}
                        placeholder="Optional"
                    />
                </div>
                <div class="row">
                    <label
                        ><input
                            type="checkbox"
                            bind:checked={publish.isPublic}
                        /> Public</label
                    >
                </div>
            {:else}
                <div class="row">
                    <label for="tmpl-select">Template</label>
                    <select
                        id="tmpl-select"
                        bind:value={selectedTemplateId}
                        on:focus={() =>
                            !yourTemplates.length && loadYourTemplates()}
                    >
                        {#each yourTemplates as t}
                            <option value={t.id}
                                >{t.name} (rev {t.revision_counter})</option
                            >
                        {/each}
                    </select>
                </div>
            {/if}
            {#if publishError}
                <div class="error">{publishError}</div>
            {/if}
            <div class="row">
                <button
                    on:click={publishFromCurrentPage}
                    disabled={publishBusy}
                >
                    {publishBusy
                        ? 'Publishing…'
                        : publishMode === 'new'
                          ? 'Publish'
                          : 'Publish revision'}
                </button>
                <button
                    type="button"
                    on:click={closePublishPanel}
                    disabled={publishBusy}
                >
                    Cancel
                </button>
            </div>
        </div>
    {/if}

    {#if error}
        <div class="error" role="alert">{error}</div>
    {/if}

    <div class="body" aria-busy={loading}>
        {#if detail}
            <div class="detail">
                <div class="detail-header">
                    <h3>{detail.name}</h3>
                    {#if detail.description}
                        <div class="desc">{detail.description}</div>
                    {/if}
                    <div class="muted">
                        Revisions: {detail.revision_counter} · Stars: {detail.stars}
                    </div>
                    <div class="buttons">
                        <button
                            title="Apply latest revision to this page (will overwrite current mini app content)"
                            on:click={() => applyToPage(detail.id, null)}
                            >Use latest</button
                        >
                        {#if activeTab === 'yours'}
                            {#if !editOpen}
                                <button on:click={openEdit}>Edit</button>
                            {/if}
                        {/if}
                        <button on:click={() => (detail = null)}>Back</button>
                    </div>
                </div>
                {#if editOpen}
                    <div class="edit">
                        <div class="row">
                            <label for="edit-name">Name</label>
                            <input
                                id="edit-name"
                                bind:value={editName}
                                placeholder="Template name"
                            />
                        </div>
                        <div class="row">
                            <label for="edit-desc">Description</label>
                            <input
                                id="edit-desc"
                                bind:value={editDescription}
                                placeholder="Optional"
                            />
                        </div>
                        {#if editError}
                            <div class="error">{editError}</div>
                        {/if}
                        <div class="row">
                            <button on:click={saveEdit} disabled={editBusy}>
                                {editBusy ? 'Saving…' : 'Save'}
                            </button>
                            <button
                                type="button"
                                on:click={cancelEdit}
                                disabled={editBusy}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                {/if}
                <div class="revisions">
                    <table>
                        <thead>
                            <tr
                                ><th>Revision</th><th>Created</th><th
                                    >Actions</th
                                ></tr
                            >
                        </thead>
                        <tbody>
                            {#each sortedRevisions as r}
                                <tr>
                                    <td>#{r.revision_number}</td>
                                    <td
                                        >{new Date(
                                            r.created_at + 'Z',
                                        ).toLocaleString()}</td
                                    >
                                    <td class="buttons">
                                        <button
                                            title="Apply this revision to the page (will overwrite current mini app content)"
                                            on:click={() =>
                                                applyToPage(
                                                    detail.id,
                                                    r.revision_number,
                                                )}>Use</button
                                        >
                                        <button
                                            on:click={() =>
                                                showDiff(
                                                    detail.id,
                                                    r.revision_number,
                                                )}
                                            >{revOpen &&
                                            revOpen.templateId === detail.id &&
                                            revOpen.revisionNumber ===
                                                r.revision_number
                                                ? 'Hide diff'
                                                : 'Diff'}</button
                                        >
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                    {#if revDiff}
                        <div class="diff">
                            <div
                                class="diff-toolbar"
                                style="grid-column: 1 / -1; display:flex; justify-content:flex-end; margin-bottom: -0.25rem;"
                            >
                                <button on:click={closeDiff}>Close diff</button>
                            </div>
                            {#each perFileDiffs as d}
                                <div class="diff-section">
                                    <div class="diff-title">{d.title}</div>
                                    <div
                                        class="diff-preview"
                                        aria-label={`Diff for ${d.title}`}
                                    >
                                        {#each d.lines as line}
                                            <div class="diff-line {line.cls}">
                                                {line.text}
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            {/each}
                            {#if perFileDiffs.length === 0}
                                <div class="diff-empty" aria-live="polite">
                                    No changes between these revisions.
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>
            </div>
        {:else}
            <div class="list">
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Description</th>
                            <th>Stars</th>
                            <th>Revisions</th>
                            <th>Visibility</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each list as item}
                            <tr>
                                <td
                                    ><button on:click={() => openDetail(item)}
                                        >{item.name}</button
                                    ></td
                                >
                                <td class="desc">{item.description}</td>
                                <td>{item.stars}</td>
                                <td>{item.revision_counter}</td>
                                <td>{item.is_public ? 'Public' : 'Private'}</td>
                                <td class="buttons">
                                    <button
                                        title="Apply this template's latest revision to the page (will overwrite current mini app content)"
                                        on:click={() =>
                                            applyToPage(item.id, null)}
                                        >Use</button
                                    >
                                    {#if myStars.has(item.id)}
                                        <button on:click={() => unstar(item)}
                                            >Unstar</button
                                        >
                                    {:else}
                                        <button on:click={() => star(item)}
                                            >Star</button
                                        >
                                    {/if}
                                    {#if activeTab === 'yours'}
                                        <button
                                            on:click={() => togglePublic(item)}
                                            >{item.is_public
                                                ? 'Make Private'
                                                : 'Make Public'}</button
                                        >
                                        <button
                                            on:click={() =>
                                                deleteTemplate(item)}
                                            >Delete</button
                                        >
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                        {#if list.length === 0}
                            <tr><td colspan="6">No templates</td></tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        {/if}

        {#if loading}
            <div class="loading-overlay" role="status" aria-live="polite">
                <div class="loading-indicator">Loading…</div>
            </div>
        {/if}
    </div>
</div>

<style>
.templates {
    border: 1px solid #d0d7de;
    border-radius: 8px;
    background: #f8f9fa;
    color: #24292f;
    font-size: 0.9rem;
    display: flex;
    flex-direction: column;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    height: 100%;
    overflow: auto;
}

.body {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: auto;
}

.header {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #d0d7de;
    background: #ffffff;
    border-radius: 8px 8px 0 0;
}

.left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.templates-title {
    font-weight: 600;
    font-size: 1rem;
    color: #1f2937;
}

.tabs {
    display: flex;
    gap: 0.4rem;
}

.tabs button {
    padding: 0.375rem 0.6rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #ffffff;
    color: #374151;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
}

.tabs button:hover {
    background: #f1f5f9;
    border-color: #9ca3af;
}

.tabs button.active {
    background: #0b65c2;
    color: #fff;
    border-color: #0b65c2;
}

.actions {
    display: flex;
    gap: 0.5rem;
}

.actions select {
    padding: 0.375rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #ffffff;
    font-size: 0.875rem;
}

.actions button,
.publish button,
.edit button,
.list button,
.detail .buttons button,
.detail .revisions button {
    padding: 0.375rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #ffffff;
    color: #374151;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
}

.actions button:hover,
.publish button:hover,
.edit button:hover,
.list button:hover,
.detail .buttons button:hover,
.detail .revisions button:hover {
    background: #f1f5f9;
    border-color: #9ca3af;
}

.publish {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.5rem;
    margin: 0.5rem 1rem;
    background: #f8fafc;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: center;
}

.publish .row {
    display: flex;
    gap: 0.6rem;
    align-items: center;
}

.publish input:not([type='checkbox']) {
    padding: 0.375rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #ffffff;
    font-size: 0.875rem;
}

.edit {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.5rem;
    margin: 0.5rem 1rem;
    background: #f8fafc;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.edit .row {
    display: flex;
    gap: 0.6rem;
    align-items: center;
}

.edit input {
    padding: 0.375rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #ffffff;
    font-size: 0.875rem;
}

.loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(1px);
    pointer-events: none;
}

.loading-indicator {
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.95);
    color: #374151;
    font-weight: 500;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
}

.list {
    padding: 0.5rem;
}

.list table,
.detail .revisions table {
    width: 100%;
    border-collapse: collapse;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
}

.list thead th,
.detail .revisions thead th {
    background: #f8fafc;
    color: #374151;
    font-weight: 600;
}

.list th,
.list td,
.detail .revisions th,
.detail .revisions td {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #e5e7eb;
}

.list td.buttons,
.detail .revisions td.buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
}

.list td.buttons button,
.detail .revisions td.buttons button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 8rem;
    flex: 0 0 8rem;
    margin-right: 0;
    white-space: nowrap;
}

.detail {
    padding: 0.5rem 1rem 1rem;
    overflow: auto;
}

.detail .detail-header {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.5rem;
    align-items: center;
}

.detail .detail-header .desc {
    grid-column: 1 / -1;
    color: #4b5563;
}

.detail .muted {
    color: #6b7280;
    font-size: 0.9rem;
}

.detail .buttons {
    display: flex;
    gap: 0.5rem;
}

.diff {
    display: grid;
    grid-template-columns: 1fr; /* stack sections vertically for easier reading */
    gap: 0.5rem;
    margin-top: 0.5rem;
}

.diff-empty {
    grid-column: 1 / -1;
    color: #6b7280;
}

.diff-preview {
    background: white;
    border: 1px solid #e5e7eb;
    padding: 0.5rem;
    font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
        'Liberation Mono', 'Courier New', monospace;
    font-size: 0.9rem;
    white-space: pre-wrap;
}

.diff-section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.diff-title {
    font-weight: 600;
    color: #374151;
}

.diff-line.added {
    background: #e6ffed;
    color: #036400;
}

.diff-line.removed {
    background: #ffeef0;
    color: #cf222e;
}

.diff-line.hunk {
    background: #fff8c5;
    color: #6e5200;
    font-weight: 600;
}

.diff-line.file {
    color: #6b7280;
}

.buttons button {
    margin-right: 0.25rem;
}

.error {
    color: #b91c1c;
    padding: 0.75rem 1rem;
}
</style>
