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
    page: null
}
let showAddPageModal = false

$: fetchPages(pageId)

import fetchPlus from '../../helpers/fetchPlus.js'
import Page from '../Page.svelte'
import debounce from '../../helpers/debounce.js'
import PageNav from '../PageNav.svelte'
import { dragSort } from '../../actions/dragSort.js'
import { eventStore } from '../../stores.js'
import PageContextMenu from '../PageContextMenu.svelte'
import AddPageModal from '../Modals/AddPageModal.svelte'

eventStore.subscribe(event => {
    if(event && event.event === 'pageAddedToPageGroup' && event.data.pageGroupId === pageId) {
        fetchPlus.get(`/page-group/${pageId}`).then(response => {
            pages = response
            selectPage(pages[pages.length - 1]) // set last page as active page as it has been just added
        })
    }

    if(event && event.event === 'pageRemovedFromPageGroup' && event.data.pageGroupId === pageId) {
        fetchPages(pageId)
    }
})

function fetchPages(pageId) {
    if(pageId) {
        Promise.all([
            fetchPlus.get(`/page-group/${pageId}`),
            fetchPlus.get(`/pages/content/${pageId}`)
        ]).then(([pagesData, pageData]) => {
            pages = pagesData

            if(pages.length) {
                if(activePageId) {
                    selectPage(pages.find(page => page.id === activePageId))
                    return
                }

                let parsedResponse = pageData.content ? JSON.parse(pageData.content) : {
                    activePageId: null
                }

                if(parsedResponse.activePageId) {
                    activePage = pages.find(page => page.id === parsedResponse.activePageId)
                } else {
                    activePage = pages[0]
                }
            }
        })
    }
}

const updatePageName = debounce(function(e) {
    fetchPlus.put(`/pages/name/${activePage.id}`, {
        pageName: e.target.innerText
    })
    const page = pages.find(page => page.id === activePage.id)
    page.name = e.target.innerText
    pages = pages
}, 500)

function onSort(draggedPage, targetPage) {
    const draggedIndex = pages.findIndex(page => page.id === draggedPage.id)
    const targetIndex = pages.findIndex(page => page.id === targetPage.id)

    // Remove the dragged item from the array
    pages.splice(draggedIndex, 1)

    // Insert the dragged item at the new position
    pages.splice(targetIndex, 0, draggedPage)

    // Update the pages array
    pages = [...pages]

    const pageIdsWithSortOrder = pages.map((page, index) => {
        return {
            pageId: String(page.id),
            sortOrder: index + 1
        }
    })

    fetchPlus.post('/pages/sort-order/update', pageIdsWithSortOrder)
}

function selectPage(page) {
    activePage = page
    fetchPlus.put(`/pages/${pageId}`, {
        pageContent: JSON.stringify({
            activePageId: page.id
        })
    })
}

function handleContextMenu(event, page) {
    event.preventDefault()
    pageItemContextMenu = {
        page,
        left: event.clientX,
        top: event.clientY
    }
}

window.addEventListener('click', e => {
    if(!e.target.closest('.context-menu')) {
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
                <button on:click={handleShowAddPageModal} style="margin-left: 0.5rem;">Add Page +</button>
            {/if}
        </div>
    {/if}
    <div class="page-group-tabs">
        {#each pages as page}
            <a
                href="{`/page/${page.id}`}"
                on:click|preventDefault={() => selectPage(page)}
                class:active={ activePage && activePage.id === page.id }
                use:dragSort={{ item: page, onSort }}
                on:contextmenu={e => handleContextMenu(e, page)}
            >{page.name}</a>
        {/each}
        {#if pages.length > 0 && !viewOnly}
            <button on:click={handleShowAddPageModal} style="margin-left: 0.5rem;">+</button>
        {/if}
    </div>

    {#if activePage && pages.length > 0}
        <div style="margin-bottom: 1rem">
            <PageNav bind:activePage={activePage}></PageNav>
        </div>
        {#key activePage.id}
            <Page activePage={activePage} updatePageName={updatePageName} viewOnly={viewOnly} />
        {/key}
    {/if}

    {#if pageItemContextMenu.page || (activePage !== null && activePage.id !== undefined && activePage.id !== null)}
        <PageContextMenu
            bind:pageItemContextMenu={pageItemContextMenu}
            {fetchPages}
            bind:pages={pages}
            bind:activePage={activePage}
            {notebooks}
            pageGroupId={pageId}
        ></PageContextMenu>
    {/if}

    {#if showAddPageModal}
        <AddPageModal
            sectionId="{pageGroupPage.section_id}"
            notebookId="{pageGroupPage.notebook_id}"
            pages="{pages}"
            pageGroupId="{pageId}"
            setPages={setPages}
            setActivePage={setActivePage}
            activePage={activePage}
            onClose={() => showAddPageModal = false}
        />
    {/if}
</div>

<style>
.page-group-tabs {
    display: flex;
    margin-bottom: 1rem;
}

.page-group-tabs > a {
    display: block;
    text-decoration: none;
    color: inherit;
    padding: 0.3rem;
    border: 1px solid #ccc;
    cursor: pointer;
}

.page-group-tabs > a:not(:last-of-type) {
    border-right: 0;
}

.page-group-tabs > a.active {
    background-color: #fff6e5;
}
</style>
