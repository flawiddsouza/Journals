<script>
export let notebooks = []
export let pageGroupPage = null
export let pageId = null
export let viewOnly = false
export let activePageId = null

let pages = []
let activePage = null
let pageItemContextMenu = {
    left: 0,
    top: 0,
    page: null,
}
let pageContextMenuHasOpenModal = false
let showAddPageModal = false
let tabsElement = null

$: fetchPages(pageId)

import fetchPlus from '../../helpers/fetchPlus.js'
import Page from '../Page.svelte'
import debounce from '../../helpers/debounce.js'
import PageNav from '../PageNav.svelte'
import BacklinksPanel from '../BacklinksPanel.svelte'
import { dragSort } from '../../actions/dragSort.js'
import { eventStore } from '../../stores.js'
import PageContextMenu from '../PageContextMenu.svelte'
import AddPageModal from '../Modals/AddPageModal.svelte'
import { tick } from 'svelte'

let showBacklinks = false

eventStore.subscribe((event) => {
    if (
        event &&
        event.event === 'pageAddedToPageGroup' &&
        event.data.pageGroupId === pageId
    ) {
        fetchPlus.get(`/page-group/${pageId}`).then((response) => {
            pages = response
            selectPage(pages[pages.length - 1]) // set last page as active page as it has been just added
        })
    }

    if (
        event &&
        event.event === 'pageRemovedFromPageGroup' &&
        event.data.pageGroupId === pageId
    ) {
        fetchPages(pageId)
    }
})

function fetchPages(pageId) {
    if (pageId) {
        Promise.all([
            fetchPlus.get(`/page-group/${pageId}`),
            fetchPlus.get(`/pages/content/${pageId}`),
        ]).then(([pagesData, pageData]) => {
            pages = pagesData

            if (pages.length) {
                if (activePageId) {
                    selectPage(pages.find((page) => page.id === activePageId))
                    return
                }

                let parsedResponse = pageData.content
                    ? JSON.parse(pageData.content)
                    : {
                          activePageId: null,
                      }

                if (parsedResponse.activePageId) {
                    activePage = pages.find(
                        (page) => page.id === parsedResponse.activePageId,
                    )
                } else {
                    activePage = pages[0]
                }
            }
        })
    }
}

const updatePageName = debounce(function (e) {
    fetchPlus.put(`/pages/name/${activePage.id}`, {
        pageName: e.target.innerText,
    })
    const page = pages.find((page) => page.id === activePage.id)
    page.name = e.target.innerText
    pages = pages
}, 500)

function onSort(draggedPage, targetPage) {
    const draggedIndex = pages.findIndex((page) => page.id === draggedPage.id)
    const targetIndex = pages.findIndex((page) => page.id === targetPage.id)

    // Remove the dragged item from the array
    pages.splice(draggedIndex, 1)

    // Insert the dragged item at the new position
    pages.splice(targetIndex, 0, draggedPage)

    // Update the pages array
    pages = [...pages]

    const pageIdsWithSortOrder = pages.map((page, index) => {
        return {
            pageId: String(page.id),
            sortOrder: index + 1,
        }
    })

    fetchPlus.post('/pages/sort-order/update', pageIdsWithSortOrder)
}

// Runs only when the open page changes. Naming tabsElement here would also rerun it
// on every scroll, as Svelte treats setting tabsElement.scrollLeft as a change to it
$: scrollActiveTabIntoView(activePage)

// Sets the row's own scroll position, as scrollIntoView would also scroll the page
async function scrollActiveTabIntoView() {
    await tick()
    const row = tabsElement
    const tab = row?.querySelector('a.active')
    if (!tab) return
    const left = tab.offsetLeft
    const right = left + tab.offsetWidth
    if (left < row.scrollLeft) {
        row.scrollLeft = left
    } else if (right > row.scrollLeft + row.clientWidth) {
        row.scrollLeft = right - row.clientWidth
    }
}

// A mouse wheel only scrolls vertically, so turn it into sideways scrolling
// until the row reaches its end, then let the page scroll as usual
function scrollTabsWithWheel(event) {
    if (event.deltaX !== 0 || event.deltaY === 0) return
    const row = event.currentTarget
    // scrollLeft can be fractional under browser zoom, so allow a pixel either way
    const maxScrollLeft = row.scrollWidth - row.clientWidth - 1
    const atEnd =
        event.deltaY < 0 ? row.scrollLeft <= 1 : row.scrollLeft >= maxScrollLeft
    if (atEnd) return
    event.preventDefault()
    row.scrollLeft += event.deltaY
}

function selectPage(page) {
    activePage = page
    fetchPlus.put(`/pages/${pageId}`, {
        pageContent: JSON.stringify({
            activePageId: page.id,
        }),
    })
}

function handleContextMenu(event, page) {
    event.preventDefault()
    pageItemContextMenu = {
        page,
        left: event.clientX,
        top: event.clientY,
    }
}

window.addEventListener('click', (e) => {
    if (!e.target.closest('.context-menu')) {
        pageItemContextMenu.page = null
    }
})

function setPages(updatedPages) {
    pages = updatedPages
}

function setActivePage(updatedActivePage) {
    activePage = updatedActivePage
}

function handleShowAddPageModal() {
    showAddPageModal = true
}
</script>

<div style="display: grid; grid-template-rows: auto auto 1fr; height: 100%">
    {#if pages.length === 0}
        <div>
            There are no pages in this page group.
            {#if !viewOnly}
                <button
                    on:click={handleShowAddPageModal}
                    style="margin-left: 0.5rem;">Add Page +</button
                >
            {/if}
        </div>
    {/if}
    <div class="page-group-tab-bar">
        <div
            class="page-group-tabs"
            bind:this={tabsElement}
            on:wheel|nonpassive={scrollTabsWithWheel}
        >
            {#each pages as page}
                <a
                    href={`/page/${page.id}`}
                    on:click|preventDefault={() => selectPage(page)}
                    class:active={activePage && activePage.id === page.id}
                    use:dragSort={{ item: page, onSort }}
                    on:contextmenu={(e) => handleContextMenu(e, page)}
                    >{page.name}</a
                >
            {/each}
        </div>
        {#if pages.length > 0 && !viewOnly}
            <button on:click={handleShowAddPageModal} title="Add page">+</button
            >
        {/if}
    </div>

    {#if activePage && pages.length > 0}
        <div style="margin-bottom: 1rem">
            <PageNav bind:activePage bind:showBacklinks compact></PageNav>
        </div>
        {#key activePage.id}
            <Page {activePage} {updatePageName} {viewOnly} />
        {/key}
    {/if}

    {#if pageItemContextMenu.page || pageContextMenuHasOpenModal || (activePage !== null && activePage.id !== undefined && activePage.id !== null)}
        <PageContextMenu
            bind:pageItemContextMenu
            {fetchPages}
            bind:pages
            bind:activePage
            {notebooks}
            pageGroupId={pageId}
            bind:hasOpenModal={pageContextMenuHasOpenModal}
        ></PageContextMenu>
    {/if}

    {#if showAddPageModal}
        <AddPageModal
            sectionId={pageGroupPage.section_id}
            notebookId={pageGroupPage.notebook_id}
            {pages}
            pageGroupId={pageId}
            {setPages}
            {setActivePage}
            {activePage}
            onClose={() => (showAddPageModal = false)}
        />
    {/if}
</div>

{#if showBacklinks && activePage}
    <BacklinksPanel
        pageId={activePage.id}
        on:close={() => (showBacklinks = false)}
    ></BacklinksPanel>
{/if}

<style>
.page-group-tab-bar {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 0.3rem;
    margin-bottom: 1rem;
}

.page-group-tabs {
    position: relative; /* so a tab's offsetLeft is measured from the row */
    display: flex;
    gap: 0.3rem;
    overflow-x: auto;
    scrollbar-width: thin;
    padding-bottom: 0.3rem;
}

.page-group-tabs > a,
.page-group-tab-bar > button {
    flex-shrink: 0;
    font: inherit;
    text-decoration: none;
    color: var(--color-tb-link);
    background: none;
    white-space: nowrap;
    padding: 0.2rem 0.6rem;
    border: 1px solid var(--border-select);
    border-radius: 4px;
    cursor: pointer;
}

.page-group-tabs > a:hover,
.page-group-tab-bar > button:hover {
    background-color: var(--bg-tb-hover);
    color: var(--color-tb-hover);
}

.page-group-tabs > a.active {
    background-color: var(--color-pa-btn);
    border-color: var(--color-pa-btn);
    color: #fff;
}
</style>
