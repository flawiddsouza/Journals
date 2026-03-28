<script>
import { createEventDispatcher, onDestroy } from 'svelte'
import { focus } from '../../actions/focus.js'
import Modal from '../Modal.svelte'
import AIChatPanel from '../AIChatPanel.svelte'
import Portal from '../Portal.svelte'
import 'code-mirror-custom-element'

// null = create mode; a widget object = edit mode
export let widget = null
// Function returning the current enriched items array, for live preview
export let getEnrichedItems = () => []

const dispatch = createEventDispatcher()

const EXAMPLES = {
    stat: `return items.length`,
    bar:  `const groups = {}\nitems.forEach(r => {\n  groups[r.Column] = (groups[r.Column] || 0) + 1\n})\nreturn { labels: Object.keys(groups), values: Object.values(groups) }`,
    line: `const groups = {}\nitems.forEach(r => {\n  groups[r.Column] = (groups[r.Column] || 0) + 1\n})\nreturn { labels: Object.keys(groups), values: Object.values(groups) }`,
    pie:  `const groups = {}\nitems.forEach(r => {\n  groups[r.Column] = (groups[r.Column] || 0) + 1\n})\nreturn { labels: Object.keys(groups), values: Object.values(groups) }`,
}

let title = widget?.title ?? ''
let type = widget?.type ?? 'stat'
let colSpan = widget?.colSpan ?? 2
let align = widget?.align ?? 'left'
let expression = widget?.expression ?? EXAMPLES[widget?.type ?? 'stat']

let previewResult = null
let previewError = null

// Debounce preview to avoid re-evaluating on every keystroke
let previewTimer
$: {
    expression  // reactive dependency
    previewResult = null
    previewError = null
    clearTimeout(previewTimer)
    if (expression.trim()) {
        previewTimer = setTimeout(() => {
            try {
                const fn = new Function('items', expression)
                previewResult = fn(getEnrichedItems())
            } catch (e) {
                previewError = e.message
            }
        }, 400)
    }
}

function handleSave() {
    dispatch('save', { title, type, colSpan: Number(colSpan), align, expression })
}

function handleCancel() {
    dispatch('cancel')
}

onDestroy(() => clearTimeout(previewTimer))

const exampleValues = new Set(Object.values(EXAMPLES))

let editorKey = 0

function selectType(value) {
    const isExample = expression === '' || exampleValues.has(expression)
    type = value
    if (isExample) {
        expression = EXAMPLES[value]
        editorKey++
    }
}

// AI panel
let aiOpen = false
let aiInitialContext = ''
let aiCodeContext = { html: '', css: '', js: '', modules: [] }

const SAMPLE_ROWS_LIMIT = 3

function sampleRowsForAI() {
    const items = getEnrichedItems()
    if (!Array.isArray(items) || items.length === 0) return []
    const sample = items.slice(0, SAMPLE_ROWS_LIMIT)
    return sample.map(row => {
        const obj = {}
        for (const [k, v] of Object.entries(row)) {
            const text = String(v ?? '').replace(/<[^>]*>/g, '').trim()
            obj[k] = text.length > 120 ? text.slice(0, 117) + '…' : text
        }
        return obj
    })
}

function openAI() {
    const sample = sampleRowsForAI()
    const items = getEnrichedItems()
    const colNames = items.length > 0 ? Object.keys(items[0]) : []
    const schema = `\nSchema:\n- Columns: ${JSON.stringify(colNames)}\n- Example rows (sanitized): ${JSON.stringify(sample, null, 2)}`

    const returnShape = type === 'stat'
        ? 'Return a single scalar value (number or string).'
        : "Return { labels: string[], values: number[] } where labels and values have the same length."

    const base = `You are assisting with writing a JavaScript expression for a table stats widget.\nOutput rules:\n- Reply with a single fenced code block labeled exactly: javascript\n- Provide the FULL replacement expression body. Do not send diffs.\n- Do not include html, css, or modules blocks.\n- Use single quotes for strings.\n- Do not use semicolons.\n- Format code with readable multi-line style and 4-space indentation.\n- Keep any explanation to 1-2 short lines after the code.`

    const ctx = `Widget type: ${type}\n${returnShape}\n\nThe expression body receives \`items\` — an array of enriched row objects.\nCell values may contain HTML markup; strip it with: String(v ?? '').replace(/<[^>]*>/g, '').trim()\nDo not include a function declaration — write the function body only. The body is executed as a regular function, so the last line must use an explicit \`return\` statement.`

    aiInitialContext = `${base}\n\n${ctx}${schema}`
    aiCodeContext = { html: '', css: '', js: expression, modules: [] }
    aiOpen = true
}

function handleAIApply(event) {
    const js = ((event.detail || {}).js ?? '').toString()
    if (!js.trim()) return
    expression = js
    editorKey++
}

const TYPE_OPTIONS = [
    { value: 'stat', icon: '🔢', label: 'Stat' },
    { value: 'bar',  icon: '📊', label: 'Bar' },
    { value: 'line', icon: '📈', label: 'Line' },
    { value: 'pie',  icon: '🥧', label: 'Pie' },
]

const WIDTH_OPTIONS = [
    { value: 2, label: '1/3' },
    { value: 3, label: '1/2' },
    { value: 4, label: '2/3' },
    { value: 6, label: 'Full' },
]
</script>

<Modal width="520px" backdrop={!aiOpen} on:close-modal={handleCancel}>
    <div class="modal-header">
        <div class="modal-title">{widget ? 'Edit Widget' : 'Add Widget'}</div>
        <button class="modal-close" type="button" on:click={handleCancel}>×</button>
    </div>
    <form on:submit|preventDefault={handleSave}>
        <div class="modal-body">
            <div class="form-row">
                <label class="form-label" for="widget-title">Title</label>
                <input id="widget-title" class="text-input" type="text" bind:value={title} required use:focus />
            </div>

            <div class="form-row">
                <div class="form-label">Type</div>
                <div class="type-grid">
                    {#each TYPE_OPTIONS as opt}
                        <button
                            type="button"
                            class="type-opt"
                            class:active={type === opt.value}
                            on:click={() => selectType(opt.value)}
                        >
                            <span class="type-icon">{opt.icon}</span>
                            {opt.label}
                        </button>
                    {/each}
                </div>
            </div>

            <div class="form-row">
                <div class="form-label">Width</div>
                <div class="width-grid">
                    {#each WIDTH_OPTIONS as opt}
                        <button
                            type="button"
                            class="width-opt"
                            class:active={colSpan === opt.value}
                            on:click={() => (colSpan = opt.value)}
                        >
                            {opt.label}
                        </button>
                    {/each}
                </div>
            </div>

            {#if type === 'stat'}
            <div class="form-row">
                <div class="form-label">Align</div>
                <div class="width-grid">
                    {#each ['left', 'center', 'right'] as opt}
                        <button
                            type="button"
                            class="width-opt"
                            class:active={align === opt}
                            on:click={() => (align = opt)}
                        >{opt[0].toUpperCase() + opt.slice(1)}</button>
                    {/each}
                </div>
            </div>
            {/if}

            <div class="form-row">
                <div class="expr-label-row">
                    <div class="form-label">Expression</div>
                    <button type="button" class="btn-ask-ai" on:click={openAI}>Ask AI</button>
                </div>
                {#key editorKey}
                <code-mirror
                    value={expression}
                    on:input={(e) => (expression = e.target.value)}
                    class="expr-editor"
                ></code-mirror>
                {/key}
                <div class="expr-hint">Return <code>{'{ labels, values }'}</code> for charts · any scalar for stat cards · <code>items</code> contains all rows</div>
            </div>

            <div class="preview" class:preview-error={previewError} class:preview-ok={!previewError && previewResult !== null} style:visibility={previewError || previewResult !== null ? 'visible' : 'hidden'}>
                {#if previewError}{previewError}{:else if previewResult !== null}Preview: {(JSON.stringify(previewResult) ?? String(previewResult)).slice(0, 120)}{:else}&nbsp;{/if}
            </div>
        </div>

        <div class="modal-footer">
            <button class="btn-ghost" type="button" on:click={handleCancel}>Cancel</button>
            <button class="btn" type="submit">Save</button>
        </div>
    </form>
</Modal>

<Portal>
    <AIChatPanel
        open={aiOpen}
        on:close={() => (aiOpen = false)}
        initialContext={aiInitialContext}
        codeContext={aiCodeContext}
        on:apply={handleAIApply}
        includeContext={true}
    />
</Portal>

<style>
.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: -14px -14px 0;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-topbar);
    background: var(--bg-select);
    border-radius: 7px 7px 0 0;
}

.modal-title {
    font-size: 14px;
    font-weight: 600;
}

.modal-close {
    background: none;
    border: none;
    font-size: 20px;
    color: var(--color-utility);
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    font-family: inherit;
}
.modal-close:hover { color: var(--color-section); }

.modal-body {
    padding: 16px 0 4px;
}

.modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin: 0 -14px -14px;
    padding: 10px 16px;
    border-top: 1px solid var(--border-topbar);
}

.form-row {
    margin-bottom: 14px;
}

.form-label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-utility);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
}

.expr-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
}

.expr-label-row .form-label {
    margin-bottom: 0;
}

.btn-ask-ai {
    background: none;
    border: 1px solid var(--border-table);
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 11px;
    font-family: inherit;
    color: var(--color-utility);
    cursor: pointer;
}
.btn-ask-ai:hover {
    background: var(--bg-select);
    color: var(--color-section);
}

.text-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--bg-select);
    border: 1px solid var(--border-select);
    border-radius: 5px;
    padding: 6px 8px;
    font-family: inherit;
    font-size: 13px;
    color: var(--color-section);
    outline: none;
}
.text-input:focus { border-color: var(--color-tb-link); }

.type-grid {
    display: flex;
    gap: 8px;
}

.type-opt {
    flex: 1;
    padding: 8px 4px;
    border: 1px solid var(--border-table);
    border-radius: 5px;
    background: var(--bg-select);
    text-align: center;
    cursor: pointer;
    font-size: 12px;
    color: var(--color-section);
    font-family: inherit;
}
.type-opt:hover { background: var(--bg-tb-hover); }
.type-opt.active {
    border-color: var(--color-pa-btn);
    background: var(--color-pa-btn);
    color: #fff;
}

.type-icon {
    display: block;
    font-size: 16px;
    margin-bottom: 2px;
}

.width-grid {
    display: flex;
    gap: 8px;
}

.width-opt {
    flex: 1;
    padding: 6px 4px;
    border: 1px solid var(--border-table);
    border-radius: 5px;
    background: var(--bg-select);
    text-align: center;
    cursor: pointer;
    font-size: 12px;
    color: var(--color-utility);
    font-family: inherit;
}
.width-opt:hover { background: var(--bg-tb-hover); }
.width-opt.active {
    border-color: var(--color-pa-btn);
    background: var(--color-pa-btn);
    color: #fff;
}

.expr-editor {
    display: block;
    border: 1px solid var(--border-table);
    border-radius: 5px;
    overflow: hidden;
}

.expr-hint {
    font-size: 11px;
    color: var(--color-utility);
    margin-top: 4px;
}
.expr-hint code {
    border: 1px solid var(--border-table);
    padding: 1px 3px;
    border-radius: 3px;
}

.preview {
    margin-bottom: 4px;
    font-size: 12px;
    padding: 6px 8px;
    border-radius: 4px;
    word-break: break-all;
}
.preview-error {
    background: rgba(200, 50, 50, 0.1);
    color: #c83232;
}
.preview-ok {
    background: rgba(50, 150, 50, 0.1);
    color: #326832;
}

.btn {
    background: var(--color-pa-btn);
    color: #fff;
    border: none;
    border-radius: 5px;
    padding: 0.4em 1.2em;
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
}
.btn:hover { opacity: 0.85; }

.btn-ghost {
    background: none;
    color: var(--color-utility);
    border: 1px solid var(--border-topbar);
    border-radius: 5px;
    padding: 0.4em 1.2em;
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
}
.btn-ghost:hover { background: var(--bg-utility-hover); }
</style>
