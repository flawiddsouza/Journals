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

async function handleAddPage() {
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

<Modal on:close-modal={onClose}>
    <form on:submit|preventDefault={handleAddPage}>
        <h2 class="heading">Add Page</h2>
        <label
            >Name<br />
            <input
                type="text"
                bind:value={addPageSettings.name}
                required
                class="w-100p"
                use:focus
                on:keydown={handleAddPageInput}
            />
        </label>
        <label class="d-b mt-0_5em"
            >Type<br />
            <select bind:value={addPageSettings.type} required class="w-100p">
                <option value="FlatPage">Flat Page</option>
                <option value="FlatPageV2">Flat Page v2</option>
                <option value="RichText">Rich Text</option>
                <option value="Table">Table</option>
                <option value="Spreadsheet">Spreadsheet</option>
                <option value="DrawIO">Draw.io</option>
                <option value="Kanban">Kanban</option>
                <option value="MiniApp">Mini App</option>
                {#if !pageGroupId}
                    <option value="PageGroup">Page Group</option>
                {/if}
            </select>
        </label>
        {#if addPageSettings.type !== 'PageGroup' && !pageGroupId}
            <label class="d-b mt-0_5em"
                >Page Group<br />
                <select bind:value={addPageSettings.parentId} class="w-100p">
                    <option value="">No Page Group</option>
                    {#each pages as page (page.id)}
                        {#if page.type === 'PageGroup'}
                            <option value={page.id}>{page.name}</option>
                        {/if}
                    {/each}
                </select>
            </label>
        {/if}
        <button class="w-100p mt-1em">Add</button>
    </form>
</Modal>

<style>
.mt-0_5em {
    margin-top: 0.5em;
}

.d-b {
    display: block;
}
</style>
