<script>
import fetchPlus from '../../helpers/fetchPlus.js'
import { eventStore } from '../../stores.js'
import Modal from '../Modal.svelte'
import { format } from 'date-fns'

export let sectionId = null
export let notebookId = null
export let pages = []
export let pageGroupId = null
export let activePage = {}
export let setPages
export let setActivePage
export let onClose
export let addPageToTop = false

let addPageSettings = {
    name: '',
    type: 'FlatPage',
}

const pageTypeGroups = [
    {
        name: 'Write',
        types: [
            {
                value: 'FlatPage',
                name: 'Flat Page',
                icon: 'Aa',
                badge: 'Simple',
                description: 'A free-form page for quick notes and journaling.',
            },
            {
                value: 'FlatPageV2',
                name: 'Flat Page v2',
                icon: '¶',
                badge: 'Modern',
                description:
                    'A formatted document with links, images, and lists.',
            },
            {
                value: 'RichText',
                name: 'Rich Text',
                icon: '✦',
                badge: 'Blocks',
                description:
                    'Build notes from movable text, media, and code blocks.',
            },
        ],
    },
    {
        name: 'Organize',
        types: [
            {
                value: 'TaskList',
                name: 'Task List',
                icon: '✓',
                description:
                    'Track nested tasks, progress, and completed items.',
            },
            {
                value: 'Table',
                name: 'Table',
                icon: '▦',
                description:
                    'Store structured records with columns, filters, and totals.',
            },
            {
                value: 'SpreadsheetV2',
                name: 'Spreadsheet',
                icon: '▦',
                description:
                    'Build rich workbooks with formulas, formatting, and multiple sheets.',
            },
            {
                value: 'Kanban',
                name: 'Kanban',
                icon: '▥',
                description: 'Move cards across columns to manage a workflow.',
            },
        ],
    },
    {
        name: 'Create',
        types: [
            {
                value: 'DrawIO',
                name: 'Draw.io',
                icon: '◇',
                description: 'Sketch diagrams, flows, maps, and visual ideas.',
            },
            {
                value: 'Excalidraw',
                name: 'Excalidraw',
                icon: '✎',
                description:
                    'Sketch free-form diagrams on a hand-drawn canvas.',
            },
            {
                value: 'MiniApp',
                name: 'Mini App',
                icon: '</>',
                description:
                    'Build a small interactive tool with HTML, CSS, and JavaScript.',
            },
            {
                value: 'VersatileCalculator',
                name: 'Versatile Calculator',
                icon: 'ƒx',
                description:
                    'Keep readable calculations, conversions, and results together.',
            },
        ],
    },
    {
        name: 'Navigate',
        types: [
            {
                value: 'PageGroup',
                name: 'Page Group',
                icon: '⊞',
                description: 'Collect related pages together under one place.',
            },
            {
                value: 'Favorites',
                name: 'Favorites',
                icon: '☆',
                description:
                    'Create a shortcut page for the items you use most.',
            },
        ],
    },
]

let adding = false

async function handleAddPage() {
    adding = true
    if (pageGroupId) {
        addPageSettings.parentId = pageGroupId
    }

    let pageName = addPageSettings.name
    let pageType = addPageSettings.type
    let pageParentId =
        addPageSettings.type !== 'PageGroup'
            ? Number(addPageSettings.parentId ?? null)
            : null

    const response = await fetchPlus.post('/pages', {
        sectionId,
        pageName,
        pageType,
        pageParentId: pageParentId !== 0 ? pageParentId : null,
    })

    let pageObj = {
        id: response.insertedRowId,
        name: pageName,
        type: pageType,
        section_id: sectionId,
        notebook_id: notebookId,
        view_only: false,
        password_exists: false,
        locked: false,
        created_at: response.createdAt,
        hide_title: [
            'DrawIO',
            'Excalidraw',
            'Spreadsheet',
            'SpreadsheetV2',
            'MiniApp',
            'Kanban',
        ].includes(pageType),
    }

    if (addPageSettings.parentId) {
        if (!pageGroupId && addPageSettings.parentId !== activePage.id) {
            activePage = pages.find(
                (page) => page.id === addPageSettings.parentId,
            )
            activePage.activePageId = pageObj.id
        } else {
            eventStore.set({
                event: 'pageAddedToPageGroup',
                data: {
                    pageGroupId: addPageSettings.parentId,
                },
            })
        }

        clearAddPageSettings()
        return
    }

    if (addPageToTop) {
        pages.unshift(pageObj)
    } else {
        pages.push(pageObj)
    }

    // Set sort order
    let pageIdsWithSortOrder = pages.map((page, index) => {
        return {
            pageId: String(page.id),
            sortOrder: index + 1,
        }
    })

    await fetchPlus.post('/pages/sort-order/update', pageIdsWithSortOrder)

    setPages([...pages])
    setActivePage(pageObj)

    clearAddPageSettings()
}

function clearAddPageSettings() {
    adding = false
    addPageSettings = {
        name: '',
        type: 'FlatPage',
    }
    onClose()
}

function focus(element) {
    element.focus()
}

function handleAddPageInput(e) {
    // insert current date at cursor
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        const el = e.target
        const textToInsert = format(new Date(), 'DD-MMM-YY')
        el.setRangeText(textToInsert, el.selectionStart, el.selectionEnd, 'end')
        el.dispatchEvent(new Event('input')) // trigger the input event, so the data binding gets updated by svelte
    }
}
</script>

<Modal width="min(720px, calc(100vw - 32px))" on:close-modal={onClose}>
    <form class="add-page-form" on:submit|preventDefault={handleAddPage}>
        <header class="modal-header">
            <div>
                <h2>Add a new page</h2>
                <p>Choose the kind of space you want to create.</p>
            </div>
            <button
                class="close-button"
                type="button"
                aria-label="Close"
                on:click={onClose}>×</button
            >
        </header>

        <div class="modal-body">
            <label class="field-label" for="new-page-name">Page name</label>
            <input
                id="new-page-name"
                class="input page-name-input"
                type="text"
                placeholder="What is this page for?"
                bind:value={addPageSettings.name}
                required
                use:focus
                on:keydown={handleAddPageInput}
            />

            <fieldset class="page-type-fieldset">
                <legend class="field-label">Page type</legend>
                <div class="page-type-picker">
                    {#each pageTypeGroups as group}
                        {#if !pageGroupId || group.name !== 'Navigate'}
                            <section
                                class="page-type-group"
                                aria-labelledby={`page-type-${group.name}`}
                            >
                                <h3 id={`page-type-${group.name}`}>
                                    {group.name}
                                </h3>
                                <div class="page-type-grid">
                                    {#each group.types as pageType}
                                        <label
                                            class:page-type-card-selected={addPageSettings.type ===
                                                pageType.value}
                                            class="page-type-card"
                                        >
                                            <input
                                                type="radio"
                                                name="pageType"
                                                value={pageType.value}
                                                bind:group={
                                                    addPageSettings.type
                                                }
                                            />
                                            <span
                                                class="page-type-icon"
                                                aria-hidden="true"
                                                >{pageType.icon}</span
                                            >
                                            <span class="page-type-copy">
                                                <span
                                                    class="page-type-name-row"
                                                >
                                                    <span class="page-type-name"
                                                        >{pageType.name}</span
                                                    >
                                                    {#if pageType.badge}
                                                        <span
                                                            class="page-type-badge"
                                                            >{pageType.badge}</span
                                                        >
                                                    {/if}
                                                </span>
                                                <span
                                                    class="page-type-description"
                                                    >{pageType.description}</span
                                                >
                                            </span>
                                            <span
                                                class="selected-indicator"
                                                aria-hidden="true">✓</span
                                            >
                                        </label>
                                    {/each}
                                </div>
                            </section>
                        {/if}
                    {/each}
                </div>
            </fieldset>

            {#if addPageSettings.type !== 'PageGroup' && addPageSettings.type !== 'Favorites' && !pageGroupId}
                <label class="field-label page-group-label" for="new-page-group"
                    >Add to a page group</label
                >
                <select
                    id="new-page-group"
                    class="input page-group-select"
                    bind:value={addPageSettings.parentId}
                >
                    <option value="">No page group</option>
                    {#each pages as page (page.id)}
                        {#if page.type === 'PageGroup'}
                            <option value={page.id}>{page.name}</option>
                        {/if}
                    {/each}
                </select>
            {/if}
        </div>

        <footer class="modal-footer">
            <button class="cancel-button" type="button" on:click={onClose}
                >Cancel</button
            >
            <button class="btn create-button" disabled={adding}>
                {adding ? 'Creating...' : 'Create page'}
            </button>
        </footer>
    </form>
</Modal>

<style>
.add-page-form {
    width: 100%;
}

.modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    margin: -14px -14px 0;
    padding: 18px 20px 15px;
    border-bottom: 1px solid var(--border-topbar);
    background: color-mix(
        in srgb,
        var(--bg-select) 72%,
        var(--bg-section-active)
    );
    border-radius: 7px 7px 0 0;
}

.modal-header h2 {
    margin: 0;
    font-size: 21px;
    line-height: 1.2;
}

.modal-header p {
    margin: 4px 0 0;
    color: var(--color-utility);
    font-size: 13px;
}

.close-button {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    padding: 0 0 2px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--color-utility);
    font: inherit;
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
}

.close-button:hover {
    border-color: var(--border-select);
    background: var(--bg-utility-hover);
    color: var(--color-section);
}

.modal-body {
    padding: 16px 4px 4px;
}

.field-label {
    display: block;
    margin: 0 0 6px;
    color: var(--color-utility);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.page-name-input,
.page-group-select {
    width: 100%;
}

.page-name-input {
    padding: 9px 10px;
}

.page-name-input::placeholder {
    color: var(--color-utility);
    opacity: 0.65;
}

.page-type-fieldset {
    min-width: 0;
    margin: 16px 0 0;
    padding: 0;
    border: 0;
}

.page-type-fieldset legend {
    width: 100%;
}

.page-type-picker {
    max-height: min(57vh, 500px);
    padding: 1px 8px 4px 1px;
    overflow-y: auto;
    scrollbar-color: var(--border-select) transparent;
    scrollbar-width: thin;
}

.page-type-group + .page-type-group {
    margin-top: 14px;
}

.page-type-group h3 {
    margin: 0 0 6px;
    color: var(--color-utility);
    font-size: 12px;
    font-weight: 600;
}

.page-type-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
}

.page-type-card {
    position: relative;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 18px;
    align-items: center;
    gap: 9px;
    min-height: 67px;
    padding: 9px 10px;
    border: 1px solid var(--border-select);
    border-radius: 7px;
    background: var(--bg-select);
    cursor: pointer;
    transition:
        border-color 120ms ease,
        background 120ms ease,
        box-shadow 120ms ease,
        transform 120ms ease;
}

.page-type-card:hover {
    border-color: var(--color-tb-link);
    background: var(--bg-tb-hover);
    transform: translateY(-1px);
}

.page-type-card:has(input:focus-visible) {
    outline: 2px solid var(--color-tb-link);
    outline-offset: 2px;
}

.page-type-card-selected {
    border-color: var(--color-pa-btn);
    background: color-mix(
        in srgb,
        var(--bg-pa-hover) 82%,
        var(--bg-section-active)
    );
    box-shadow: inset 3px 0 0 var(--color-pa-btn);
}

.page-type-card input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
}

.page-type-icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border-select);
    border-radius: 7px;
    background: var(--bg-section-active);
    color: var(--color-tb-link);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -0.04em;
}

.page-type-card-selected .page-type-icon {
    border-color: var(--color-pa-btn);
    background: var(--color-pa-btn);
    color: white;
}

.page-type-copy,
.page-type-name-row {
    min-width: 0;
}

.page-type-copy {
    display: block;
}

.page-type-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
}

.page-type-name {
    overflow: hidden;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.page-type-badge {
    flex: 0 0 auto;
    padding: 1px 5px;
    border: 1px solid var(--border-select);
    border-radius: 999px;
    color: var(--color-utility);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.page-type-description {
    display: block;
    margin-top: 3px;
    color: var(--color-utility);
    font-size: 11px;
    line-height: 1.3;
}

.selected-indicator {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border-select);
    border-radius: 50%;
    color: transparent;
    font-size: 11px;
    font-weight: 700;
}

.page-type-card-selected .selected-indicator {
    border-color: var(--color-pa-btn);
    background: var(--color-pa-btn);
    color: white;
}

.page-group-label {
    margin-top: 14px;
}

.page-group-select {
    padding: 7px 9px;
}

.modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin: 14px -14px -14px;
    padding: 11px 18px;
    border-top: 1px solid var(--border-topbar);
    background: color-mix(
        in srgb,
        var(--bg-select) 55%,
        var(--bg-section-active)
    );
    border-radius: 0 0 7px 7px;
}

.cancel-button {
    padding: 0.5em 1em;
    border: 1px solid var(--border-select);
    border-radius: 5px;
    background: transparent;
    color: var(--color-utility);
    font: inherit;
    cursor: pointer;
}

.cancel-button:hover {
    background: var(--bg-utility-hover);
    color: var(--color-section);
}

.create-button {
    min-width: 112px;
}

.create-button:disabled {
    cursor: wait;
    opacity: 0.55;
}

@media (max-width: 600px) {
    .modal-header {
        padding-inline: 16px;
    }

    .page-type-picker {
        max-height: 52vh;
    }

    .page-type-grid {
        grid-template-columns: 1fr;
    }

    .page-type-card {
        min-height: 72px;
    }
}
</style>
