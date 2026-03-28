<script>
import { createEventDispatcher } from 'svelte'
import { dndzone } from 'svelte-dnd-action'
import TableStatsChart from './TableStatsChart.svelte'
import TableStatsEditModal from '../Modals/TableStatsEditModal.svelte'

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
            w.id === editingWidget.id ? { ...w, title, type, colSpan, align, expression } : w
        )
    } else {
        updated = [
            ...displayWidgets,
            { id: crypto.randomUUID(), title, type, colSpan, align, expression },
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
                                    labels={ev.result?.labels ?? []}
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
}
.add-widget-btn {
    width: 220px;
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
</style>
