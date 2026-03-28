<script>
import { createEventDispatcher } from 'svelte'
import { dndzone } from 'svelte-dnd-action'
import TableStatsChart from './TableStatsChart.svelte'
import TableStatsEditModal from '../Modals/TableStatsEditModal.svelte'
import AIChatPanel from '../AIChatPanel.svelte'
import Portal from '../Portal.svelte'

// The tableComputeEngine instance from Table.svelte
export let engine
// Widget config array — parent owns this; we dispatch update-widgets on change
export let widgets = []
export let editMode = false

const dispatch = createEventDispatcher()

const SPAN_LABELS = { 2: '1/3', 3: '1/2', 4: '2/3', 6: 'Full' }
const SPAN_OPTIONS = [2, 3, 4, 6]

// Local display copy — needed so DND consider events (drag animation) update
// immediately without waiting for the parent to round-trip the prop.
let displayWidgets = []
$: displayWidgets = widgets

let showModal = false
let editingWidget = null  // null = create mode, object = edit mode

function getEnrichedItems() {
    return engine.getEnrichedItems()
}

function decodeEntities(str) {
    const txt = document.createElement('textarea')
    txt.innerHTML = String(str ?? '')
    return txt.value
}

function evalWidget(widget) {
    if (!widget.expression?.trim()) return { result: null, error: 'No expression' }
    try {
        const fn = new Function('items', widget.expression)
        return { result: fn(getEnrichedItems()), error: null }
    } catch (e) {
        return { result: null, error: e.message }
    }
}

function openAddModal() {
    editingWidget = null
    showModal = true
}

function openEditModal(widget) {
    editingWidget = widget
    showModal = true
}

function handleSave(e) {
    const { title, type, colSpan, align, expression } = e.detail
    let updated
    if (editingWidget) {
        updated = displayWidgets.map(w =>
            w.id === editingWidget.id ? { ...w, title, type, colSpan, expression, ...(type === 'stat' && { align }) } : w
        )
    } else {
        updated = [
            ...displayWidgets,
            { id: crypto.randomUUID(), title, type, colSpan, ...(type === 'stat' && { align }), expression },
        ]
    }
    displayWidgets = updated
    showModal = false
    dispatch('update-widgets', updated)
}

function removeWidget(id) {
    if (confirm('Remove this widget?')) {
        const updated = displayWidgets.filter(w => w.id !== id)
        displayWidgets = updated
        dispatch('update-widgets', updated)
    }
}

function setColSpan(id, span) {
    const updated = displayWidgets.map(w => w.id === id ? { ...w, colSpan: span } : w)
    displayWidgets = updated
    dispatch('update-widgets', updated)
}

function handleDndConsider(e) {
    displayWidgets = e.detail.items
}

function handleDndFinalize(e) {
    displayWidgets = e.detail.items
    dispatch('update-widgets', displayWidgets)
}

// ── Page-level AI ──
let aiOpen = false
let aiInitialContext = ''
let pendingWidgets = []
let showWidgetSelect = false
let selectedIndices = new Set()

const SAMPLE_ROWS_LIMIT = 3

function openPageAI() {
    const items = getEnrichedItems()
    const colNames = items.length > 0 ? Object.keys(items[0]) : []
    const sample = items.slice(0, SAMPLE_ROWS_LIMIT).map(row => {
        const obj = {}
        for (const [k, v] of Object.entries(row)) {
            const text = String(v ?? '').replace(/<[^>]*>/g, '').trim()
            obj[k] = text.length > 120 ? text.slice(0, 117) + '…' : text
        }
        return obj
    })

    const existingCtx = displayWidgets.length > 0
        ? `\n\nExisting widgets (avoid duplicates, suggest complementary):\n${JSON.stringify(
            displayWidgets.map(({ id: _id, ...widget }) => widget),
            null, 2
          )}`
        : ''

    const schema = `\nSchema:\n- Columns: ${JSON.stringify(colNames)}\n- Example rows (sanitized): ${JSON.stringify(sample, null, 2)}`

    aiInitialContext = `You are helping create stats widgets for a data table.\n\nOutput rules:\n- Reply with a single fenced code block. The opening fence MUST be exactly \`\`\`widgets (not \`\`\`json, not \`\`\`javascript). Example:\n\`\`\`widgets\n[{ ... }]\n\`\`\`\n- The block must contain a valid JSON array of widget objects.\n- Each widget object shape:\n  { "title": string, "type": "stat"|"bar"|"line"|"pie", "colSpan": 2|3|4|6, "align": "left"|"center"|"right", "expression": string }\n- align is required and must always be present. Use "center" for stat widgets unless the content is text-heavy. Use "left" for chart types.\n- expression receives \`items\` (array of row objects); strip HTML with: String(v ?? '').replace(/<[^>]*>/g, '').trim()\n- stat expressions must return a scalar value; chart expressions must return { labels: string[], values: number[] }\n- Use explicit \`return\` statements. Use single quotes. No semicolons. 4-space indentation.\n- Keep any explanation to 1-2 short lines after the code block.${existingCtx}${schema}`

    aiOpen = true
}

function handlePageAIApply(event) {
    let widgetsJson = (event.detail || {}).widgets
    if (!widgetsJson) return
    // Strip a leading "widgets" label line if the AI put it inside the block
    widgetsJson = widgetsJson.replace(/^\s*widgets\s*\n/, '')
    try {
        const parsed = JSON.parse(widgetsJson)
        if (!Array.isArray(parsed) || parsed.length === 0) return
        pendingWidgets = parsed.filter(w => w && typeof w.title === 'string' && typeof w.expression === 'string')
        if (pendingWidgets.length === 0) return
        selectedIndices = new Set(pendingWidgets.map((_, i) => i))
        showWidgetSelect = true
    } catch {}
}

function toggleIndex(i) {
    if (selectedIndices.has(i)) selectedIndices.delete(i)
    else selectedIndices.add(i)
    selectedIndices = selectedIndices
}

function evalPending(w) {
    if (!w.expression?.trim()) return { result: null, error: 'No expression' }
    try {
        const fn = new Function('items', w.expression)
        const result = fn(getEnrichedItems())
        return { result, error: null }
    } catch (e) {
        return { result: null, error: e.message }
    }
}

function pendingPreview(w) {
    const { result, error } = evalPending(w)
    if (error) return { text: error, isError: true }
    if (w.type === 'stat') return { text: String(result ?? ''), isError: false }
    if (result && Array.isArray(result.labels))
        return { text: `${result.labels.length} data point${result.labels.length !== 1 ? 's' : ''}`, isError: false }
    return { text: '—', isError: false }
}

function addSelectedWidgets() {
    const validTypes = new Set(['stat', 'bar', 'line', 'pie'])
    const validSpans = new Set([2, 3, 4, 6])
    const validAligns = new Set(['left', 'center', 'right'])
    const toAdd = pendingWidgets
        .filter((_, i) => selectedIndices.has(i))
        .map(w => {
            const type = validTypes.has(w.type) ? w.type : 'stat'
            return {
                id: crypto.randomUUID(),
                title: w.title ?? 'Untitled',
                type,
                colSpan: validSpans.has(Number(w.colSpan)) ? Number(w.colSpan) : 2,
                ...(type === 'stat' && { align: validAligns.has(w.align) ? w.align : 'left' }),
                expression: w.expression ?? '',
            }
        })
    if (toAdd.length === 0) return
    const updated = [...displayWidgets, ...toAdd]
    displayWidgets = updated
    dispatch('update-widgets', updated)
    showWidgetSelect = false
    pendingWidgets = []
}
</script>

<div class="stats">
    <div
        class="widget-grid"
        use:dndzone={{ items: displayWidgets, flipDurationMs: 150, dragDisabled: !editMode, dropTargetStyle: {} }}
        on:consider={handleDndConsider}
        on:finalize={handleDndFinalize}
    >
        {#each displayWidgets as widget (widget.id)}
            {@const ev = evalWidget(widget)}
            <div class="widget-wrap" style="--col-span: {widget.colSpan}">
                <div class="widget">
                    <div class="widget-header">
                        {#if editMode}
                            <span class="drag-handle" title="Drag to reorder">⠿</span>
                        {/if}
                        <span class="widget-title" style:text-align={widget.align ?? 'left'}>{widget.title}</span>
                        {#if editMode}
                            <span class="width-selector">
                                {#each SPAN_OPTIONS as span}
                                    <button
                                        type="button"
                                        class="width-opt"
                                        class:active={widget.colSpan === span}
                                        on:click={() => setColSpan(widget.id, span)}
                                    >{SPAN_LABELS[span]}</button>
                                {/each}
                            </span>
                            <div class="edit-controls">
                                <button
                                    type="button"
                                    class="btn-sm"
                                    on:click={() => openEditModal(widget)}
                                >Edit</button>
                                <button
                                    type="button"
                                    class="btn-sm"
                                    on:click={() => removeWidget(widget.id)}
                                >X</button>
                            </div>
                        {/if}
                    </div>
                    <div class="widget-body">
                        {#if ev.error}
                            <div class="widget-error">{ev.error}</div>
                        {:else if widget.type === 'stat'}
                            <div class="stat-value" style:text-align={widget.align ?? 'left'}>{ev.result ?? ''}</div>
                        {:else}
                            <div class="chart-wrap">
                                <TableStatsChart
                                    type={widget.type}
                                    labels={(ev.result?.labels ?? []).map(decodeEntities)}
                                    values={ev.result?.values}
                                    series={ev.result?.series}
                                />
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {/each}
    </div>

    {#if editMode}
        <div class="add-widget-btn-wrap">
            <button type="button" class="add-widget-btn" on:click={openAddModal}>
                + Add Widget
            </button>
            <button type="button" class="add-widget-btn" on:click={openPageAI}>
                ✦ Ask AI
            </button>
        </div>
    {/if}
</div>

{#if showModal}
    <TableStatsEditModal
        widget={editingWidget}
        {getEnrichedItems}
        on:save={handleSave}
        on:cancel={() => (showModal = false)}
    />
{/if}

<Portal>
    <AIChatPanel
        open={aiOpen}
        on:close={() => (aiOpen = false)}
        initialContext={aiInitialContext}
        codeContext={{ html: '', css: '', js: '', modules: [] }}
        on:apply={handlePageAIApply}
        includeContext={false}
    />
</Portal>

{#if showWidgetSelect}
    <div class="widget-select-overlay" role="dialog" aria-modal="true"
        on:mousedown|self={() => (showWidgetSelect = false)}>
        <div class="widget-select-modal">
            <div class="widget-select-header">
                <span>Add AI Widgets</span>
                <button on:click={() => (showWidgetSelect = false)}>✕</button>
            </div>
            <div class="widget-select-body">
                {#each pendingWidgets as w, i}
                    {@const preview = pendingPreview(w)}
                    <label class="widget-select-item">
                        <input type="checkbox"
                            checked={selectedIndices.has(i)}
                            on:change={() => toggleIndex(i)}
                        />
                        <div class="widget-select-info">
                            <span class="widget-select-title">{w.title}</span>
                            <span class="widget-select-type">{w.type.charAt(0).toUpperCase() + w.type.slice(1)} · {
                                w.colSpan === 6 ? 'Full width' :
                                w.colSpan === 4 ? 'Wide' :
                                w.colSpan === 3 ? 'Half width' : 'Narrow'
                            }</span>
                        </div>
                        <span class="widget-select-preview" class:error={preview.isError}>{preview.text}</span>
                    </label>
                {/each}
            </div>
            <div class="widget-select-footer">
                <button class="btn-add-selected"
                    on:click={addSelectedWidgets}
                    disabled={selectedIndices.size === 0}
                >Add {selectedIndices.size} Widget{selectedIndices.size !== 1 ? 's' : ''}</button>
            </div>
        </div>
    </div>
{/if}

<style>
.stats {
    min-height: 200px;
}

/* ── Grid ── */
.widget-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 12px;
}
.widget-wrap {
    min-width: 0;
    grid-column: span var(--col-span, 2);
}

/* ── Responsive ── */
@media (max-width: 900px) {
    .widget-grid { grid-template-columns: repeat(4, 1fr); }
    .widget-wrap { grid-column: span min(var(--col-span, 2), 4); }
}
@media (max-width: 540px) {
    .widget-grid { grid-template-columns: repeat(2, 1fr); }
    .widget-wrap { grid-column: span min(var(--col-span, 2), 2); }
}

/* ── Widget card ── */
.widget {
    background: var(--bg-select);
    border: 1px solid var(--border-topbar);
    border-radius: 6px;
    overflow: hidden;
    height: 100%;
}

.widget-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border-bottom: 1px solid var(--border-topbar);
    background: var(--bg-center);
    min-height: 36px;
}

.widget-title {
    flex: 1;
    font-weight: 500;
    letter-spacing: 0.02em;
    color: var(--color-utility);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.drag-handle {
    font-size: 16px;
    color: var(--color-utility);
    opacity: 0.5;
    cursor: grab;
    flex-shrink: 0;
    margin-right: 2px;
}

.widget-body {
    padding: 12px 14px;
}

/* ── Stat card ── */
.stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--color-section);
    line-height: 1.1;
}

/* ── Chart ── */
.chart-wrap {
    position: relative;
    height: 180px;
}

/* ── Error ── */
.widget-error {
    font-size: 12px;
    color: #c83232;
    word-break: break-word;
}

/* ── Width selector ── */
.width-selector {
    display: flex;
    border: 1px solid var(--border-topbar);
    border-radius: 4px;
    overflow: hidden;
    flex-shrink: 0;
}
.width-opt {
    background: none;
    border: none;
    border-right: 1px solid var(--border-topbar);
    padding: 2px 6px;
    font-size: 11px;
    color: var(--color-utility);
    cursor: pointer;
    font-family: inherit;
}
.width-opt:last-child { border-right: none; }
.width-opt:hover { background: var(--bg-select); }
.width-opt.active {
    background: var(--color-pa-btn);
    color: #fff;
}

/* ── Edit controls ── */
.edit-controls {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
}
.btn-sm {
    background: var(--color-pa-btn);
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
}
.btn-sm:hover { opacity: 0.85; }

/* ── Add widget ── */
.add-widget-btn-wrap {
    margin-top: 12px;
    display: flex;
    gap: 8px;
}
.add-widget-btn {
    width: 160px;
    padding: 8px 16px;
    border: 2px dashed var(--border-topbar);
    border-radius: 6px;
    background: none;
    color: var(--color-utility);
    cursor: pointer;
    font-size: 13px;
    font-family: inherit;
}
.add-widget-btn:hover {
    background: var(--bg-select);
}

/* ── Widget select modal ── */
.widget-select-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
}
.widget-select-modal {
    background: var(--bg-center);
    border: 1px solid var(--border-nb);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    width: 360px;
    max-height: calc(100dvh - 80px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.widget-select-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-topbar);
    font-weight: 600;
    font-size: 14px;
}
.widget-select-header button {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-utility);
    font-size: 14px;
    padding: 0 4px;
}
.widget-select-body {
    overflow-y: auto;
    padding: 8px 0;
    flex: 1;
}
.widget-select-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    cursor: pointer;
}
.widget-select-item:hover {
    background: var(--bg-select);
}
.widget-select-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
}
.widget-select-title {
    font-size: 13px;
    color: var(--color-section);
}
.widget-select-type {
    font-size: 11px;
    color: var(--color-utility);
}
.widget-select-preview {
    margin-left: auto;
    font-size: 12px;
    color: var(--color-utility);
    white-space: nowrap;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
}
.widget-select-preview.error {
    color: #c83232;
}
.widget-select-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--border-topbar);
}
.btn-add-selected {
    width: 100%;
    padding: 8px;
    background: var(--color-pa-btn);
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
}
.btn-add-selected:hover:not(:disabled) {
    opacity: 0.9;
}
.btn-add-selected:disabled {
    opacity: 0.45;
    cursor: default;
}
</style>
