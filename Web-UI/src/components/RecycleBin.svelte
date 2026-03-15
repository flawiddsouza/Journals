<script>
import { createEventDispatcher } from 'svelte'
import fetchPlus from '../helpers/fetchPlus.js'
import { format } from 'date-fns'
import { focus } from '../actions/focus.js'

const dispatch = createEventDispatcher()

let loading = true
let recycleBinItems = { notebooks: [], sections: [], pages: [] }
let showEmptyConfirm = false
let emptyConfirmText = ''
let restoringKey = null

async function fetchRecycleBin({ silent = false } = {}) {
    if (!silent) loading = true
    recycleBinItems = await fetchPlus.get('/recycle-bin')
    loading = false
}

async function restore(type, id) {
    const key = `${type}-${id}`
    if (restoringKey) return
    restoringKey = key
    await fetchPlus.post(`/recycle-bin/restore/${type}/${id}`, {})
    await fetchRecycleBin({ silent: true })
    dispatch('restored')
    restoringKey = null
}

async function permanentDelete(type, id) {
    if (confirm('Permanently delete this item? This cannot be undone.')) {
        await fetchPlus.delete(`/recycle-bin/permanent/${type}/${id}`)
        await fetchRecycleBin({ silent: true })
    }
}

async function emptyRecycleBin() {
    await fetchPlus.delete('/recycle-bin/permanent/all')
    showEmptyConfirm = false
    emptyConfirmText = ''
    await fetchRecycleBin({ silent: true })
    dispatch('restored')
}

function formatDate(dateStr) {
    return format(dateStr + 'Z', 'DD-MM-YYYY hh:mm A')
}

$: hasItems =
    recycleBinItems.notebooks.length > 0 ||
    recycleBinItems.sections.length > 0 ||
    recycleBinItems.pages.length > 0

// IDs of deleted notebooks, sections, and pages — used to build the hierarchy
$: deletedNotebookIds = new Set(recycleBinItems.notebooks.map((n) => n.id))
$: deletedSectionIds = new Set(recycleBinItems.sections.map((s) => s.id))
$: deletedPageIds = new Set(recycleBinItems.pages.map((p) => p.id))

// Sections whose parent notebook is NOT deleted (orphans at notebook level)
$: orphanSections = recycleBinItems.sections.filter(
    (s) => !deletedNotebookIds.has(s.notebook_id),
)

// Top-level deleted pages whose parent section is alive
$: orphanPages = recycleBinItems.pages.filter(
    (p) =>
        !deletedSectionIds.has(p.section_id) &&
        (p.parent_id == null || !deletedPageIds.has(p.parent_id)),
)

// Orphan pages grouped by notebook → section for hierarchical display
$: orphanPageGroups = (() => {
    const notebooks = {}
    orphanPages.forEach((p) => {
        if (!notebooks[p.section_id])
            notebooks[p.section_id] = {
                notebook_name: p.notebook_name,
                section_name: p.section_name,
                pages: [],
            }
        notebooks[p.section_id].pages.push(p)
    })
    return Object.values(notebooks)
})()

// Orphan sections grouped by notebook for display under live-notebook headers
$: orphanSectionGroups = (() => {
    const groups = {}
    orphanSections.forEach((s) => {
        if (!groups[s.notebook_id])
            groups[s.notebook_id] = { notebook_name: s.notebook_name, sections: [] }
        groups[s.notebook_id].sections.push(s)
    })
    return Object.values(groups)
})()

function getSectionsForNotebook(notebookId) {
    return recycleBinItems.sections.filter((s) => s.notebook_id === notebookId)
}

// Top-level pages for a section: parent_id is null or parent page is not deleted
function getTopLevelPagesForSection(sectionId) {
    return recycleBinItems.pages.filter(
        (p) =>
            p.section_id === sectionId &&
            (p.parent_id == null || !deletedPageIds.has(p.parent_id)),
    )
}

// Child pages of a page group
function getChildPages(parentId) {
    return recycleBinItems.pages.filter((p) => p.parent_id === parentId)
}

fetchRecycleBin()
</script>

<div class="recycle-bin">
    <div class="recycle-bin-header">
        <h2 class="heading">Recycle Bin</h2>
        {#if !loading && hasItems}
            {#if showEmptyConfirm}
                <div class="recycle-bin-empty-confirm">
                    <span>Type <strong>yes</strong> to confirm:</span>
                    <input
                        class="input"
                        type="text"
                        bind:value={emptyConfirmText}
                        placeholder="yes"
                        use:focus
                        on:keydown={(e) => e.key === 'Escape' && (showEmptyConfirm = false, emptyConfirmText = '')}
                    />
                    <button
                        class="recycle-bin-empty-btn"
                        disabled={emptyConfirmText !== 'yes'}
                        on:click={emptyRecycleBin}
                    >Empty Recycle Bin</button>
                    <button class="btn-sm" on:click={() => { showEmptyConfirm = false; emptyConfirmText = '' }}>Cancel</button>
                </div>
            {:else}
                <button class="recycle-bin-empty-btn" on:click={() => showEmptyConfirm = true}>
                    Empty Recycle Bin
                </button>
            {/if}
        {/if}
    </div>

    {#if loading}
        <p class="recycle-bin-empty-msg">Loading...</p>
    {:else if !hasItems}
        <p class="recycle-bin-empty-msg">Recycle bin is empty.</p>
    {:else}

        <!-- ── Deleted notebooks with their children ── -->
        {#each recycleBinItems.notebooks as notebook (notebook.id)}
            <div class="rb-row rb-notebook-row">
                <div class="rb-info">
                    <div class="rb-name-row"><span class="rb-type-tag">Notebook</span><span class="rb-name">{notebook.name}</span></div>
                    <span class="rb-meta">{formatDate(notebook.deleted_at)}</span>
                </div>
                <div class="rb-actions">
                    <button class="btn-sm" disabled={!!restoringKey} on:click={() => restore('notebook', notebook.id)}>{restoringKey === `notebook-${notebook.id}` ? 'Restoring…' : 'Restore'}</button>
                    <button class="btn-danger" on:click={() => permanentDelete('notebook', notebook.id)}>Delete Permanently</button>
                </div>
            </div>

            {#each getSectionsForNotebook(notebook.id) as section (section.id)}
                <div class="rb-row rb-indent-1">
                    <div class="rb-info">
                        <div class="rb-name-row"><span class="rb-type-tag">Section</span><span class="rb-name">{section.name}</span></div>
                        <span class="rb-meta">{formatDate(section.deleted_at)}</span>
                    </div>
                    <div class="rb-actions">
                        <button class="btn-sm" disabled={!!restoringKey} on:click={() => restore('section', section.id)}>{restoringKey === `section-${section.id}` ? 'Restoring…' : 'Restore'}</button>
                        <button class="btn-danger" on:click={() => permanentDelete('section', section.id)}>Delete Permanently</button>
                    </div>
                </div>

                {#each getTopLevelPagesForSection(section.id) as page (page.id)}
                    <div class="rb-row rb-indent-2">
                        <div class="rb-info">
                            <div class="rb-name-row"><span class="rb-type-tag">{page.type}</span><span class="rb-name">{page.name}</span></div>
                            <span class="rb-meta">{formatDate(page.deleted_at)}</span>
                        </div>
                        <div class="rb-actions">
                            <button class="btn-sm" disabled={!!restoringKey} on:click={() => restore('page', page.id)}>{restoringKey === `page-${page.id}` ? 'Restoring…' : 'Restore'}</button>
                            <button class="btn-danger" on:click={() => permanentDelete('page', page.id)}>Delete Permanently</button>
                        </div>
                    </div>
                    {#each getChildPages(page.id) as child (child.id)}
                        <div class="rb-row rb-indent-3">
                            <div class="rb-info">
                                <div class="rb-name-row"><span class="rb-type-tag">{child.type}</span><span class="rb-name">{child.name}</span></div>
                                <span class="rb-meta">{formatDate(child.deleted_at)}</span>
                            </div>
                            <div class="rb-actions">
                                <button class="btn-sm" disabled={!!restoringKey} on:click={() => restore('page', child.id)}>{restoringKey === `page-${child.id}` ? 'Restoring…' : 'Restore'}</button>
                                <button class="btn-danger" on:click={() => permanentDelete('page', child.id)}>Delete Permanently</button>
                            </div>
                        </div>
                    {/each}
                {/each}
            {/each}
        {/each}

        <!-- ── Orphan sections (their notebook is still alive) ── -->
        {#each orphanSectionGroups as group}
            <div class="rb-row rb-notebook-row">
                <div class="rb-info">
                    <div class="rb-name-row"><span class="rb-type-tag">Notebook</span><span class="rb-name">{group.notebook_name}</span></div>
                </div>
            </div>

            {#each group.sections as section (section.id)}
                <div class="rb-row rb-indent-1">
                    <div class="rb-info">
                        <div class="rb-name-row"><span class="rb-type-tag">Section</span><span class="rb-name">{section.name}</span></div>
                        <span class="rb-meta">{formatDate(section.deleted_at)}</span>
                    </div>
                    <div class="rb-actions">
                        <button class="btn-sm" disabled={!!restoringKey} on:click={() => restore('section', section.id)}>{restoringKey === `section-${section.id}` ? 'Restoring…' : 'Restore'}</button>
                        <button class="btn-danger" on:click={() => permanentDelete('section', section.id)}>Delete Permanently</button>
                    </div>
                </div>

                {#each getTopLevelPagesForSection(section.id) as page (page.id)}
                    <div class="rb-row rb-indent-2">
                        <div class="rb-info">
                            <div class="rb-name-row"><span class="rb-type-tag">{page.type}</span><span class="rb-name">{page.name}</span></div>
                            <span class="rb-meta">{formatDate(page.deleted_at)}</span>
                        </div>
                        <div class="rb-actions">
                            <button class="btn-sm" disabled={!!restoringKey} on:click={() => restore('page', page.id)}>{restoringKey === `page-${page.id}` ? 'Restoring…' : 'Restore'}</button>
                            <button class="btn-danger" on:click={() => permanentDelete('page', page.id)}>Delete Permanently</button>
                        </div>
                    </div>
                    {#each getChildPages(page.id) as child (child.id)}
                        <div class="rb-row rb-indent-3">
                            <div class="rb-info">
                                <div class="rb-name-row"><span class="rb-type-tag">{child.type}</span><span class="rb-name">{child.name}</span></div>
                                <span class="rb-meta">{formatDate(child.deleted_at)}</span>
                            </div>
                            <div class="rb-actions">
                                <button class="btn-sm" disabled={!!restoringKey} on:click={() => restore('page', child.id)}>{restoringKey === `page-${child.id}` ? 'Restoring…' : 'Restore'}</button>
                                <button class="btn-danger" on:click={() => permanentDelete('page', child.id)}>Delete Permanently</button>
                            </div>
                        </div>
                    {/each}
                {/each}
            {/each}
        {/each}

        <!-- ── Orphan pages (their section is still alive) ── -->
        {#each orphanPageGroups as group}
            <div class="rb-row rb-notebook-row">
                <div class="rb-info">
                    <div class="rb-name-row"><span class="rb-type-tag">Notebook</span><span class="rb-name">{group.notebook_name}</span></div>
                </div>
            </div>
            <div class="rb-row rb-indent-1">
                <div class="rb-info">
                    <div class="rb-name-row"><span class="rb-type-tag">Section</span><span class="rb-name">{group.section_name}</span></div>
                </div>
            </div>
            {#each group.pages as page (page.id)}
                <div class="rb-row rb-indent-2">
                    <div class="rb-info">
                        <div class="rb-name-row"><span class="rb-type-tag">{page.type}</span><span class="rb-name">{page.name}</span></div>
                        <span class="rb-meta">{formatDate(page.deleted_at)}</span>
                    </div>
                    <div class="rb-actions">
                        <button class="btn-sm" disabled={!!restoringKey} on:click={() => restore('page', page.id)}>{restoringKey === `page-${page.id}` ? 'Restoring…' : 'Restore'}</button>
                        <button class="btn-danger" on:click={() => permanentDelete('page', page.id)}>Delete Permanently</button>
                    </div>
                </div>
                {#each getChildPages(page.id) as child (child.id)}
                    <div class="rb-row rb-indent-3">
                        <div class="rb-info">
                            <div class="rb-name-row"><span class="rb-type-tag">{child.type}</span><span class="rb-name">{child.name}</span></div>
                            <span class="rb-meta">{formatDate(child.deleted_at)}</span>
                        </div>
                        <div class="rb-actions">
                            <button class="btn-sm" disabled={!!restoringKey} on:click={() => restore('page', child.id)}>{restoringKey === `page-${child.id}` ? 'Restoring…' : 'Restore'}</button>
                            <button class="btn-danger" on:click={() => permanentDelete('page', child.id)}>Delete Permanently</button>
                        </div>
                    </div>
                {/each}
            {/each}
        {/each}

    {/if}
</div>

<style>
.recycle-bin {
    padding: 1em;
    overflow-y: auto;
    height: 100%;
}

.recycle-bin-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1em;
}

.recycle-bin-empty-confirm {
    display: flex;
    align-items: center;
    gap: 0.5em;
    font-size: 0.85em;
}

.recycle-bin-empty-confirm input {
    padding: 0.3em 0.5em;
    border: 1px solid #ccc;
    width: 6em;
}

.recycle-bin-empty-btn {
    background: #c00;
    color: white;
    border: none;
    padding: 0.4em 0.8em;
    cursor: pointer;
}

.recycle-bin-empty-btn:disabled {
    background: #e99;
    cursor: not-allowed;
}

.recycle-bin-empty-msg {
    color: #999;
}

.rb-notebook-row {
    margin-top: 1em;
}

.rb-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.4em 0;
    border-bottom: 1px solid #eee;
    gap: 1em;
}

.rb-indent-1 {
    margin-left: 1em;
    padding-left: 0.8em;
    border-left: 2px solid #d0d0d0;
}

.rb-indent-2 {
    margin-left: 2em;
    padding-left: 0.8em;
    border-left: 2px solid #b8b8b8;
}

.rb-indent-3 {
    margin-left: 3em;
    padding-left: 0.8em;
    border-left: 2px solid #a0a0a0;
}

.rb-info {
    display: flex;
    flex-direction: column;
    gap: 0.1em;
    min-width: 0;
}

.rb-name-row {
    display: flex;
    align-items: center;
    gap: 0.4em;
}

.rb-type-tag {
    font-size: 0.7em;
    color: #888;
    background: #f0f0f0;
    padding: 0.1em 0.4em;
    border-radius: 3px;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.rb-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rb-meta {
    font-size: 0.75em;
    color: #aaa;
}

.rb-actions {
    display: flex;
    gap: 0.4em;
    flex-shrink: 0;
}

.btn-danger {
    color: #c00;
}
</style>
