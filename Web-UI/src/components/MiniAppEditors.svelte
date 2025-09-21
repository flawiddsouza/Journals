<script>
import { createEventDispatcher } from 'svelte'
import 'code-mirror-custom-element'

export let files = { html: '', css: '', js: '' }
export let modules = [] // [{ name, code }]
export let readOnly = false
export let activeTab = 'html' // 'html' | 'css' | 'js' | 'modules'
export let htmlKey = 0
export let cssKey = 0
export let jsKey = 0
export let modulesKey = 0
export let selectedModuleIndex = -1

const dispatch = createEventDispatcher()

// Tabs keyboard support (Left/Right arrows)
const tabOrder = ['html', 'css', 'js', 'modules']
function onTabKeydown(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const idx = tabOrder.indexOf(activeTab)
        const next =
            e.key === 'ArrowRight'
                ? (idx + 1) % tabOrder.length
                : (idx - 1 + tabOrder.length) % tabOrder.length
        dispatch('tabChange', tabOrder[next])
        // move focus to the newly selected tab
        const btn = document.getElementById('tab-' + tabOrder[next])
        if (btn) btn.focus()
        e.preventDefault()
    }
}

// Natural sort support for filenames (e.g., file2 before file10)
const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
})

// Keep a derived, sorted list for display while preserving original indices
$: displayModules = modules
    .map((m, i) => ({ m, i }))
    .sort((a, b) => collator.compare(a.m.name, b.m.name))

function addModule() {
    if (readOnly) return
    // Ask user for a filename instead of auto-incrementing
    let name = prompt('New module filename (e.g., utils.js)')
    if (name == null) return // cancelled
    name = name.trim()
    if (!name) return

    // Ensure .js extension
    if (!name.toLowerCase().endsWith('.js')) {
        name = name + '.js'
    }

    // Prevent duplicates locally; parent can still enforce final rules
    if (modules.some((m) => m.name === name)) {
        alert(`A module named "${name}" already exists.`)
        return
    }

    dispatch('moduleAdd', { name })
    // selection will be managed by parent if needed; keep local index as-is
}
function renameModule(index) {
    if (readOnly) return
    dispatch('moduleRename', { index })
}
function deleteModule(index) {
    if (readOnly) return
    dispatch('moduleDelete', { index })
}
function onModuleSelect(index) {
    // Inform parent; selection is controlled via prop
    dispatch('moduleSelect', { index })
}
function handleModuleInput(e) {
    if (readOnly) return
    if (selectedModuleIndex < 0 || selectedModuleIndex >= modules.length) return
    dispatch('moduleInput', {
        index: selectedModuleIndex,
        code: e.target.value,
    })
}

function handleEditorInput(kind, e) {
    if (readOnly) return
    dispatch('fileInput', { kind, value: e.target.value })
}
</script>

<div class="editors">
    <div
        class="tabs"
        role="tablist"
        aria-label="Mini App editors"
        tabindex="0"
        on:keydown={onTabKeydown}
    >
        <button
            id="tab-html"
            class="tab"
            role="tab"
            aria-selected={activeTab === 'html'}
            aria-controls="panel-html"
            tabindex={activeTab === 'html' ? 0 : -1}
            on:click={() => dispatch('tabChange', 'html')}>HTML</button
        >
        <button
            id="tab-css"
            class="tab"
            role="tab"
            aria-selected={activeTab === 'css'}
            aria-controls="panel-css"
            tabindex={activeTab === 'css' ? 0 : -1}
            on:click={() => dispatch('tabChange', 'css')}>CSS</button
        >
        <button
            id="tab-js"
            class="tab"
            role="tab"
            aria-selected={activeTab === 'js'}
            aria-controls="panel-js"
            tabindex={activeTab === 'js' ? 0 : -1}
            on:click={() => dispatch('tabChange', 'js')}>JS</button
        >
        <button
            id="tab-modules"
            class="tab"
            role="tab"
            aria-selected={activeTab === 'modules'}
            aria-controls="panel-modules"
            tabindex={activeTab === 'modules' ? 0 : -1}
            on:click={() => dispatch('tabChange', 'modules')}>Modules</button
        >
    </div>
    <div class="tab-panels">
        {#if activeTab === 'html'}
            <div
                role="tabpanel"
                id="panel-html"
                aria-labelledby="tab-html"
                class="editor-panel"
            >
                {#key htmlKey}
                    <code-mirror
                        language="html"
                        value={files.html}
                        on:input={(e) => handleEditorInput('html', e)}
                        style="border:1px solid #aaa"
                    ></code-mirror>
                {/key}
            </div>
        {:else if activeTab === 'css'}
            <div
                role="tabpanel"
                id="panel-css"
                aria-labelledby="tab-css"
                class="editor-panel"
            >
                {#key cssKey}
                    <code-mirror
                        language="css"
                        value={files.css}
                        on:input={(e) => handleEditorInput('css', e)}
                        style="border:1px solid #aaa"
                    ></code-mirror>
                {/key}
            </div>
        {:else if activeTab === 'js'}
            <div
                role="tabpanel"
                id="panel-js"
                aria-labelledby="tab-js"
                class="editor-panel"
            >
                {#key jsKey}
                    <code-mirror
                        language="javascript"
                        value={files.js}
                        on:input={(e) => handleEditorInput('js', e)}
                        style="border:1px solid #aaa"
                    ></code-mirror>
                {/key}
            </div>
        {:else if activeTab === 'modules'}
            <div
                role="tabpanel"
                id="panel-modules"
                aria-labelledby="tab-modules"
                class="editor-panel"
            >
                <div class="modules-pane">
                    <div class="modules-list">
                        <div class="modules-header">
                            <div>Files</div>
                            <button on:click={addModule} disabled={readOnly}
                                >Add</button
                            >
                        </div>
                        <ul>
                            {#each displayModules as item}
                                <li
                                    class:selected={item.i ===
                                        selectedModuleIndex}
                                >
                                    <button
                                        class="filebtn"
                                        on:click={() => onModuleSelect(item.i)}
                                        title={item.m.name}
                                        >{item.m.name}</button
                                    >
                                    <div class="actions">
                                        <button
                                            class="sm"
                                            on:click={() =>
                                                renameModule(item.i)}
                                            disabled={readOnly}>Rename</button
                                        >
                                        <button
                                            class="sm"
                                            on:click={() =>
                                                deleteModule(item.i)}
                                            disabled={readOnly}>Delete</button
                                        >
                                    </div>
                                </li>
                            {:else}
                                <li class="empty">
                                    No modules. Click Add and enter a filename
                                </li>
                            {/each}
                        </ul>
                    </div>
                    <div class="modules-editor">
                        {#if selectedModuleIndex >= 0 && modules[selectedModuleIndex]}
                            <div class="hint">
                                Import with: <code
                                    >import ... from '{modules[
                                        selectedModuleIndex
                                    ].name.startsWith('./')
                                        ? modules[selectedModuleIndex].name
                                        : './' +
                                          modules[selectedModuleIndex]
                                              .name}'</code
                                >
                            </div>
                            {#key `${modulesKey}:${selectedModuleIndex}`}
                                <code-mirror
                                    language="javascript"
                                    value={modules[selectedModuleIndex].code}
                                    on:input={handleModuleInput}
                                    style="border:1px solid #aaa"
                                ></code-mirror>
                            {/key}
                        {:else}
                            <div class="hint">Select a module to edit</div>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
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

.tab[aria-selected='true'] {
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

.modules-pane {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 0.5rem;
    height: 100%;
}

.modules-list {
    display: flex;
    flex-direction: column;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
}

.modules-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid #e5e7eb;
    background: #f8fafc;
}

.modules-list ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
}

.modules-list li {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.4rem;
    border-bottom: 1px solid #f1f5f9;
}

.modules-list li.selected {
    background: #eef2ff;
}

.modules-list li .filebtn {
    text-align: left;
    background: none;
    border: none;
    padding: 0.25rem 0.25rem;
    cursor: pointer;
}

.modules-list li .actions {
    display: inline-flex;
    gap: 0.25rem;
}

.modules-list li .actions .sm {
    border: 1px solid #d1d5db;
    background: #fff;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
}

.modules-list li.empty {
    color: #6b7280;
    font-size: 0.9rem;
}

.modules-editor {
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.modules-editor .hint {
    font-size: 0.8rem;
    color: #6b7280;
    margin-top: 0.5rem;
    margin-bottom: 0.25rem;
}
</style>
