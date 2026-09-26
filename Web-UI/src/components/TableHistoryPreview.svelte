<script>
// A saved version of a Table, shown as what changed since the version before
// it, with the whole table a click away.
import { diffLines, diffWordsWithSpace } from 'diff'
import Table from './PageTypes/Table.svelte'
import { diffTableContent, parseTableContent, rowsForDisplay } from '../helpers/tableHistoryDiff.js'

export let pageContent = ''
export let pageContentOlder = ''
// False for the oldest version, which has nothing before it.
export let hasOlder = true

// Changed rows are many after an import or a pull, so they come in pages.
const ROWS_PER_PAGE = 200

let view = 'changes'
let rowsShown = ROWS_PER_PAGE
let gapsOpen = new Set()

$: tableNewer = parseTableContent(pageContent)
$: tableOlder = parseTableContent(pageContentOlder)
$: diff = diffTableContent(tableOlder, tableNewer)
$: if (diff) {
    rowsShown = ROWS_PER_PAGE
    gapsOpen = new Set()
}
// A row with a value in a column added or removed shows that column's change,
// though the row itself is compared only on the columns both versions have.
$: gridColumnsChanged = gridColumns.filter((column) => column.side !== 'both')
$: display = rowsForDisplay(diff.rowsAligned, {
    changesShown: rowsShown,
    gapsOpen,
    isChange: (row) =>
        row.type !== 'same' ||
        gridColumnsChanged.some((column) => asText((column.side === 'newer' ? row.after : row.before)?.[column.name])),
})

$: added = diff.rows.filter((row) => row.type === 'add').length
$: changed = diff.rows.filter((row) => row.type === 'change').length
$: removed = diff.rows.filter((row) => row.type === 'remove').length
$: hasColumnChanges =
    diff.columnsAdded.length || diff.columnsRemoved.length || diff.columnsChanged.length || diff.columnsReordered
$: hasChanges = diff.rows.length || hasColumnChanges || diff.settings.length || diff.settingsOther.length

// The stored columns as the page has them now, then the ones whose stored
// values it lost. A computed column holds no value to compare, so one that
// stays computed is only listed above. side says which version's values a
// column shows, and note is what the header says happened to it.
const isComputed = (column) => column?.type === 'Computed'
$: gridColumns = [
    ...tableNewer.columns.filter((column) => !isComputed(column)).map((column) => {
        if (diff.rowColumns.includes(column.name)) return { ...column, side: 'both', note: '' }
        const columnOlder = tableOlder.columns.find((c) => c.name === column.name)
        return { ...column, side: 'newer', note: columnOlder ? 'was computed' : 'new' }
    }),
    ...tableOlder.columns
        .filter((column) => !isComputed(column) && !diff.rowColumns.includes(column.name))
        .map((column) => ({
            ...column,
            side: 'older',
            note: diff.columnsRemoved.includes(column.name) ? 'removed' : 'now computed',
        })),
]
$: columnLabel = (name) => {
    const column = tableNewer.columns.find((c) => c.name === name) ?? tableOlder.columns.find((c) => c.name === name)
    return column?.label || name
}

const parser = new DOMParser()
const asText = (value) =>
    value === undefined || value === null || value === ''
        ? ''
        : (parser.parseFromString(String(value), 'text/html').body.textContent ?? '').trim()

// A cell's edit word by word, or null when no word survived it, in which case
// the old and new values read better whole.
function cellWords(before, after) {
    if (!before || !after) return null
    const parts = diffWordsWithSpace(before, after)
    return parts.some((part) => !part.added && !part.removed && part.value.trim()) ? parts : null
}

// What one cell shows. A cell nobody edited keeps the HTML the page shows; an
// edited one is compared as text, and one whose text survived had only its
// formatting changed.
function cellOf(row, column) {
    const html = (source) => source?.[column.name] ?? ''
    if (row.type === 'add') return { kind: 'plain', html: column.side === 'older' ? '' : html(row.after) }
    if (row.type === 'remove') return { kind: 'plain', html: column.side === 'newer' ? '' : html(row.before) }
    if (column.side === 'newer') return { kind: 'plain', html: html(row.after) }
    if (column.side === 'older') return { kind: 'plain', html: html(row.before) }
    const before = html(row.before)
    const after = html(row.after)
    if (before === after) return { kind: 'plain', html: after }
    const textBefore = asText(before)
    const textAfter = asText(after)
    if (textBefore === textAfter) return { kind: 'formatting', html: after }
    return { kind: 'edit', before: textBefore, after: textAfter, words: cellWords(textBefore, textAfter) }
}

// A column option left blank means what the column form offers first
// (Table.svelte), so it reads as that rather than as nothing.
const FIELD_BLANK = { Type: 'Input', Wrap: 'Yes', Align: 'Left', Autocomplete: 'No', Filter: 'No', Expression: '(none)' }
const fieldText = (columnName, label, value) => value || (label === 'Label' ? columnName : FIELD_BLANK[label] ?? '(none)')

function openGap(index) {
    gapsOpen.add(index)
    gapsOpen = gapsOpen
}

// Without a newline at the end, an edited last line would show its old and
// new text run together on one line.
function settingLines(setting) {
    const withNewline = (text) => (text && !text.endsWith('\n') ? text + '\n' : text)
    const parts = diffLines(withNewline(String(setting.before)), withNewline(String(setting.after)))
    const last = parts.at(-1)
    if (last) parts[parts.length - 1] = { ...last, value: last.value.replace(/\n$/, '') }
    return parts
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

$: summary = [
    added && plural(added, 'row added', 'rows added'),
    changed && plural(changed, 'row changed', 'rows changed'),
    removed && plural(removed, 'row removed', 'rows removed'),
    hasColumnChanges && 'columns changed',
    (diff.settings.length || diff.settingsOther.length) && 'settings changed',
].filter(Boolean)
</script>

<div class="table-history-preview">
    {#if hasOlder}
        <div class="table-history-views" role="group" aria-label="Show">
            <button type="button" class="btn-sm" aria-pressed={view === 'changes'} on:click={() => (view = 'changes')}>Changes</button>
            <button type="button" class="btn-sm" aria-pressed={view === 'table'} on:click={() => (view = 'table')}>Whole table</button>
        </div>
    {:else}
        <p class="table-history-meta">This is the oldest saved version, so there is nothing to compare it with.</p>
    {/if}

    {#if !hasOlder || view === 'table'}
        {#key pageContent}
            <Table pageContentOverride={pageContent} />
        {/key}
    {:else if !hasChanges}
        <p class="table-history-meta">Same as the version before it.</p>
    {:else}
        <p class="table-history-meta">Compared with the version before it: {summary.join(', ')}.</p>

        {#if hasColumnChanges}
            <h3 class="table-history-title">Columns</h3>
            <ul class="table-history-list">
                {#each diff.columnsAdded as name}
                    <li><span class="table-history-added">Added</span> {columnLabel(name)}</li>
                {/each}
                {#each diff.columnsRemoved as name}
                    <li><span class="table-history-removed">Removed</span> {columnLabel(name)}</li>
                {/each}
                {#each diff.columnsChanged as column}
                    <li>
                        <span class="table-history-name">{columnLabel(column.name)}</span>
                        {#each column.fields as field}
                            <div class="table-history-field">
                                <span class="table-history-name">{field.label}</span>
                                <del>{fieldText(column.name, field.label, field.before)}</del>
                                <span class="table-history-arrow" aria-hidden="true">→</span>
                                <ins>{fieldText(column.name, field.label, field.after)}</ins>
                            </div>
                        {/each}
                    </li>
                {/each}
                {#if diff.columnsReordered}
                    <li>Columns reordered: {tableNewer.columns.map((c) => c.label || c.name).join(', ')}</li>
                {/if}
            </ul>
        {/if}

        {#if diff.rows.length || gridColumnsChanged.length}
            <h3 class="table-history-title">Rows</h3>
            <div class="table-history-scroll">
                <table class="table-history-grid">
                    <thead>
                        <tr>
                            <th class="table-history-number" aria-label="Row"></th>
                            {#each gridColumns as column}
                                <th class="table-history-column-{column.side}">
                                    {column.label || column.name}
                                    {#if column.note}<span class="table-history-note">{column.note}</span>{/if}
                                </th>
                            {/each}
                        </tr>
                    </thead>
                    <tbody>
                        {#each display.items as item (item.gap !== undefined ? `gap${item.gap}` : item.index)}
                            {#if item.gap !== undefined}
                                <tr class="table-history-gap">
                                    <td colspan={gridColumns.length + 1}>
                                        <button type="button" on:click={() => openGap(item.gap)}>
                                            {plural(item.count, 'unchanged row', 'unchanged rows')}
                                        </button>
                                    </td>
                                </tr>
                            {:else}
                                {@const row = item.row}
                                <tr class="table-history-row-{row.type}">
                                    <td class="table-history-number">
                                        {row.type === 'remove' ? `was ${row.rowNumber}` : row.rowNumber}
                                    </td>
                                    {#each gridColumns as column}
                                        {@const cell = cellOf(row, column)}
                                        <td
                                            class="table-history-column-{column.side} table-history-cell-{cell.kind}"
                                            style={column.align ? `text-align: ${column.align.toLowerCase()}` : ''}
                                        >
                                            {#if cell.kind === 'edit'}
                                                {#if cell.words}
                                                    {#each cell.words as part}{#if part.removed}<del>{part.value}</del>{:else if part.added}<ins>{part.value}</ins>{:else}<span>{part.value}</span>{/if}{/each}
                                                {:else}
                                                    {#if cell.before}<del>{cell.before}</del>{/if}
                                                    {#if cell.before && cell.after}<span class="table-history-arrow" aria-hidden="true">→</span>{/if}
                                                    {#if cell.after}<ins>{cell.after}</ins>{/if}
                                                {/if}
                                            {:else}
                                                {@html cell.html}
                                                {#if cell.kind === 'formatting'}<span class="table-history-note">formatting</span>{/if}
                                            {/if}
                                        </td>
                                    {/each}
                                </tr>
                            {/if}
                        {/each}
                    </tbody>
                </table>
            </div>
            {#if display.changesHidden}
                <button type="button" class="btn-sm table-history-more" on:click={() => (rowsShown += ROWS_PER_PAGE)}>
                    Show {Math.min(ROWS_PER_PAGE, display.changesHidden)} more of {display.changesHidden} rows with changes
                </button>
            {/if}
        {/if}

        {#if diff.settings.length || diff.settingsOther.length}
            <h3 class="table-history-title">Settings</h3>
            {#each diff.settings as setting}
                <div class="table-history-setting">
                    <span class="table-history-name">{setting.label}</span>
                    <pre class="table-history-code">{#each settingLines(setting) as part}{#if part.removed}<del>{part.value}</del>{:else if part.added}<ins>{part.value}</ins>{:else}<span>{part.value}</span>{/if}{/each}</pre>
                </div>
            {/each}
            {#if diff.settingsOther.length}
                <p>Also changed: {diff.settingsOther.join(', ')}.</p>
            {/if}
        {/if}
    {/if}
</div>

<style>
.table-history-preview {
    --history-added: rgba(46, 160, 67, 0.2);
    --history-removed: rgba(220, 53, 69, 0.16);
    --history-changed: rgba(210, 153, 34, 0.8);
    word-break: break-word;
}

.table-history-views {
    display: flex;
    gap: 0.4em;
    margin-bottom: 0.8em;
}

.table-history-views button[aria-pressed='false'] {
    background: transparent;
    color: inherit;
    border: 1px solid var(--border-select);
}

.table-history-meta {
    margin: 0 0 0.8em;
}

.table-history-title {
    font-size: 1em;
    margin: 1.2em 0 0.4em;
}

.table-history-list {
    list-style: none;
    margin: 0;
    padding: 0;
}

.table-history-list li {
    padding: 0.4em 0;
    border-bottom: 1px solid var(--border-select);
}

.table-history-added,
.table-history-removed {
    font-size: 0.85em;
    font-weight: 600;
}

.table-history-added {
    color: rgb(46, 160, 67);
}

.table-history-removed {
    color: var(--color-danger);
}

.table-history-name {
    font-weight: 600;
}

.table-history-field {
    margin: 0.2em 0 0 1em;
    font-size: 0.9em;
    white-space: pre-wrap;
}

.table-history-field > .table-history-name {
    margin-right: 0.5em;
}

/* The grid is drawn like the Table page's own (Table.svelte, table td). */
.table-history-scroll {
    overflow-x: auto;
}

.table-history-grid {
    border-collapse: collapse;
}

.table-history-grid th,
.table-history-grid td {
    border: 1px solid var(--border-table);
    min-width: 3em;
    padding: 2px 5px;
    vertical-align: top;
    text-align: left;
}

.table-history-grid .table-history-number {
    min-width: 0;
    text-align: right;
    font-size: 0.85em;
    opacity: 0.6;
    white-space: nowrap;
}

.table-history-row-same > td.table-history-column-both,
.table-history-row-same > .table-history-number {
    opacity: 0.55;
}

.table-history-row-add > td,
.table-history-grid .table-history-column-newer {
    background: var(--history-added);
}

.table-history-row-remove > td,
.table-history-grid .table-history-column-older {
    background: var(--history-removed);
}

.table-history-row-remove > td:not(.table-history-number),
.table-history-grid td.table-history-column-older {
    text-decoration: line-through;
}

.table-history-row-add > .table-history-number {
    box-shadow: inset 3px 0 rgba(46, 160, 67, 0.8);
}

.table-history-row-remove > .table-history-number {
    box-shadow: inset 3px 0 rgba(220, 53, 69, 0.8);
}

.table-history-row-change > .table-history-number {
    box-shadow: inset 3px 0 var(--history-changed);
}

.table-history-note {
    margin-left: 0.4em;
    font-size: 0.75em;
    font-weight: normal;
    opacity: 0.75;
    white-space: nowrap;
}

.table-history-cell-formatting {
    outline: 2px solid var(--history-changed);
    outline-offset: -2px;
}

.table-history-gap > td {
    padding: 0;
}

.table-history-gap button {
    width: 100%;
    padding: 2px 5px;
    border: 0;
    background: transparent;
    color: inherit;
    opacity: 0.7;
    font-size: 0.85em;
    text-align: left;
    cursor: pointer;
}

.table-history-gap button:hover {
    background: var(--bg-tb-hover);
}

.table-history-setting {
    margin-bottom: 0.8em;
}

.table-history-code {
    margin: 0.3em 0 0;
    padding: 0.5em;
    border: 1px solid var(--border-select);
    border-radius: 5px;
    white-space: pre-wrap;
    font-size: 0.85em;
    max-height: 40vh;
    overflow: auto;
}

.table-history-preview del {
    background: rgba(220, 53, 69, 0.18);
    color: inherit;
}

.table-history-preview ins {
    background: rgba(46, 160, 67, 0.28);
    color: inherit;
    text-decoration: none;
}

.table-history-arrow {
    opacity: 0.6;
}

.table-history-more {
    margin-top: 0.6em;
}
</style>
