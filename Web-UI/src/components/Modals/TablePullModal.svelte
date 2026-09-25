<script>
// Runs a Table's pull script and shows what it would change, so nothing
// reaches the table until the person has seen it and picked what to keep.
import { createEventDispatcher, onMount } from 'svelte'
import Modal from '../Modal.svelte'
import { runPullScript } from '../../helpers/integrations.js'
import { applyRowDiff, diffRows } from '../../helpers/rowDiff.js'

export let columns = []
export let rows = []
export let script = ''

const dispatch = createEventDispatcher()

let state = 'running'
let failure = ''
let allChanges = []
let changes = []
let taken = new Set()

async function pull() {
    state = 'running'
    failure = ''
    try {
        const proposed = await runPullScript(script, rows)
        // The full list, unchanged rows included, is what Apply works from.
        allChanges = diffRows(rows, proposed)
        changes = allChanges.filter((change) => change.type !== 'same')
        taken = new Set(changes)
        state = 'ready'
    } catch (error) {
        console.error('pull script failed', error)
        failure = error?.message || String(error)
        state = 'failed'
    }
}

onMount(() => {
    // A cell keeps focus behind the dialog, and typing would edit it.
    document.activeElement?.blur?.()
    pull()
})

$: added = changes.filter((change) => change.type === 'add')
$: changed = changes.filter((change) => change.type === 'change')
$: removed = changes.filter((change) => change.type === 'remove')

// Columns the table stores, then anything the script wrote that the table
// has no column for, so nothing it would save is out of sight. Rows keep an
// empty value under each computed column, which is not worth showing.
$: shownColumns = (() => {
    const names = columns.filter((column) => column.type !== 'Computed').map((column) => column.name)
    const computedNames = columns.filter((column) => column.type === 'Computed').map((column) => column.name)
    for (const change of changes) {
        for (const row of [change.before, change.after]) {
            for (const [key, value] of Object.entries(row ?? {})) {
                if (names.includes(key)) continue
                if (computedNames.includes(key) && (value === '' || value === null || value === undefined)) continue
                names.push(key)
            }
        }
    }
    return names
})()
$: unknownColumns = shownColumns.filter((name) => !columns.some((column) => column.name === name))

const parser = new DOMParser()
const asText = (value) =>
    value === undefined || value === null || value === ''
        ? ''
        : (parser.parseFromString(String(value), 'text/html').body.textContent ?? '').trim()

const cellValue = (row, name) => row?.[name] ?? ''
const changedColumns = (change) =>
    shownColumns.filter((name) => cellValue(change.before, name) !== cellValue(change.after, name))

function toggle(change) {
    if (taken.has(change)) taken.delete(change)
    else taken.add(change)
    taken = taken
}

function toggleAll(group) {
    const all = group.every((change) => taken.has(change))
    for (const change of group) {
        if (all) taken.delete(change)
        else taken.add(change)
    }
    taken = taken
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

function apply() {
    dispatch('apply', { rows: applyRowDiff(allChanges, taken) })
}
</script>

<Modal width="min(72rem, calc(100vw - 32px))" on:close-modal>
    <h2 class="heading">Pull</h2>

    {#if state === 'running'}
        <p>Running the pull script…</p>
    {:else if state === 'failed'}
        <p class="pull-error" role="alert">The pull script failed: {failure}</p>
        <div class="pull-actions">
            <button type="button" class="btn" on:click={pull}>Try again</button>
            <button type="button" class="btn-sm pull-secondary" on:click={() => dispatch('close-modal')}>Close</button>
        </div>
    {:else if !changes.length}
        <p>Nothing to pull. The table already has everything the script found.</p>
        <div class="pull-actions">
            <button type="button" class="btn" on:click={() => dispatch('close-modal')}>Close</button>
        </div>
    {:else}
        <p class="pull-summary">
            {plural(added.length, 'new row', 'new rows')}, {plural(changed.length, 'changed row', 'changed rows')}, {plural(removed.length, 'removed row', 'removed rows')}.
            Untick anything you don't want.
        </p>
        {#if unknownColumns.length}
            <p class="pull-warning">
                The script sets {unknownColumns.join(', ')}, which the table has no column for. It would be saved but not shown.
            </p>
        {/if}

        {#each [['New rows', added], ['Removed rows', removed]] as [title, group]}
            {#if group.length}
                <h3 class="pull-section-title">{title}</h3>
                <div class="pull-scroll">
                    <table class="pull-table">
                        <thead>
                            <tr>
                                <th class="pull-check">
                                    <input
                                        type="checkbox"
                                        aria-label={`Keep all ${title.toLowerCase()}`}
                                        checked={group.every((change) => taken.has(change))}
                                        on:change={() => toggleAll(group)}
                                    />
                                </th>
                                <th class="pull-row-number">Row</th>
                                {#each shownColumns as name}<th>{name}</th>{/each}
                            </tr>
                        </thead>
                        <tbody>
                            {#each group as change}
                                {@const row = change.after ?? change.before}
                                <tr class:pull-untaken={!taken.has(change)} on:click={() => toggle(change)}>
                                    <td class="pull-check">
                                        <input type="checkbox" checked={taken.has(change)} on:click|stopPropagation on:change={() => toggle(change)} />
                                    </td>
                                    <td class="pull-row-number">{change.type === 'add' ? 'new' : change.index + 1}</td>
                                    {#each shownColumns as name}<td><div class="pull-cell">{asText(row[name])}</div></td>{/each}
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}
        {/each}

        {#if changed.length}
            <h3 class="pull-section-title">
                <label>
                    <input type="checkbox" checked={changed.every((change) => taken.has(change))} on:change={() => toggleAll(changed)} />
                    Changed rows
                </label>
            </h3>
            <ul class="pull-changes">
                {#each changed as change}
                    <li class:pull-untaken={!taken.has(change)}>
                        <label class="pull-change-row">
                            <input type="checkbox" checked={taken.has(change)} on:change={() => toggle(change)} />
                            Row {change.index + 1}
                        </label>
                        {#each changedColumns(change) as name}
                            <div class="pull-change">
                                <span class="pull-change-column">{name}</span>
                                <del>{asText(change.before[name]) || '(empty)'}</del>
                                <ins>{asText(change.after[name]) || '(empty)'}</ins>
                            </div>
                        {/each}
                    </li>
                {/each}
            </ul>
        {/if}

        <div class="pull-actions">
            <button type="button" class="btn" disabled={!taken.size} on:click={apply}>
                Apply {plural(taken.size, 'change', 'changes')}
            </button>
            <button type="button" class="btn-sm pull-secondary" on:click={() => dispatch('close-modal')}>Cancel</button>
        </div>
    {/if}
</Modal>

<style>
.pull-summary {
    margin: 0.5em 0 0.8em;
}

.pull-error,
.pull-warning {
    color: var(--color-danger);
    white-space: pre-wrap;
}

.pull-section-title {
    font-size: 1em;
    margin: 1.2em 0 0.4em;
}

.pull-section-title label,
.pull-change-row {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    cursor: pointer;
}

.pull-scroll {
    max-height: 50vh;
    overflow: auto;
    border: 1px solid var(--border-select);
    border-radius: 5px;
}

.pull-table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.9em;
}

.pull-table th {
    position: sticky;
    top: 0;
    background: var(--bg-select);
    text-align: left;
    white-space: nowrap;
}

.pull-table th,
.pull-table td {
    padding: 0.3em 0.5em;
    border-bottom: 1px solid var(--border-select);
    vertical-align: top;
}

.pull-table tbody tr {
    cursor: pointer;
}

.pull-table tbody tr:hover {
    background: var(--bg-tb-hover);
}

.pull-check,
.pull-row-number {
    width: 1%;
    white-space: nowrap;
}

.pull-cell {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-width: 6em;
}

.pull-untaken {
    opacity: 0.45;
}

.pull-changes {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 40vh;
    overflow: auto;
}

.pull-changes li {
    padding: 0.4em 0;
    border-bottom: 1px solid var(--border-select);
}

.pull-change {
    margin: 0.2em 0 0 1.6em;
    font-size: 0.9em;
}

.pull-change-column {
    font-weight: bold;
    margin-right: 0.5em;
}

.pull-change del {
    color: var(--color-danger);
    margin-right: 0.5em;
}

.pull-change ins {
    text-decoration: none;
    font-weight: 600;
}

.pull-actions {
    display: flex;
    align-items: center;
    gap: 0.8em;
    margin-top: 1em;
}

.pull-actions .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.pull-secondary {
    background: transparent;
    color: inherit;
    border: 1px solid var(--border-select);
}
</style>
