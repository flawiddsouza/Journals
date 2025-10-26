<script>
export let notebooks = []
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

$: fetchPages(pageId)

import fetchPlus from '../../helpers/fetchPlus.js'
import Page from '../Page.svelte'
import debounce from '../../helpers/debounce.js'
import PageNav from '../PageNav.svelte'
import { dragSort } from '../../actions/dragSort.js'
import { eventStore } from '../../stores.js'
import PageContextMenu from '../PageContextMenu.svelte'

eventStore.subscribe((event) => {
    if (
        event &&
        event.event === 'pageAddedToFavorites' &&
        event.data.favoritesPageId === pageId
    ) {
        fetchPages(pageId)
    }

    if (
        event &&
        event.event === 'pageRemovedFromFavorites' &&
        event.data.favoritesPageId === pageId
    ) {
        fetchPages(pageId)
    }
})

function fetchPages(pageId) {
    if (pageId) {
        Promise.all([
            fetchPlus.get(`/favorites/${pageId}`),
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
                          pageRefs: [],
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

    // For favorites, we store the sort order in the favorites page content, not in the pages themselves
    const pageRefs = pages.map((page) => page.id)

    fetchPlus.put(`/pages/${pageId}`, {
        pageContent: JSON.stringify({
            activePageId: activePage ? activePage.id : null,
            pageRefs: pageRefs,
        }),
    })
}

function selectPage(page) {
    activePage = page

    // Get current page content to preserve pageRefs
    fetchPlus.get(`/pages/content/${pageId}`).then((pageData) => {
        let parsedResponse = pageData.content
            ? JSON.parse(pageData.content)
            : {
                  activePageId: null,
                  pageRefs: [],
              }

        fetchPlus.put(`/pages/${pageId}`, {
            pageContent: JSON.stringify({
                activePageId: page.id,
                pageRefs: parsedResponse.pageRefs || [],
            }),
        })
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

</script>

<div style="display: grid; grid-template-rows: auto auto 1fr; height: 100%">
    {#if pages.length === 0}
        <div>
            There are no pages in this favorites.
            {#if !viewOnly}
                Add pages to favorites from the page context menu.
            {/if}
        </div>
    {/if}
    <div class="favorites-tabs">
        {#each pages as page}
            <a
                href={`/page/${page.id}`}
                on:click|preventDefault={() => selectPage(page)}
                class:active={activePage && activePage.id === page.id}
                use:dragSort={{ item: page, onSort }}
                on:contextmenu={(e) => handleContextMenu(e, page)}
                >{page.parent_name ? `${page.parent_name} > ` : ''}{page.name}</a
            >
        {/each}
    </div>

    {#if activePage && pages.length > 0}
        <div style="margin-bottom: 1rem">
            <PageNav bind:activePage></PageNav>
        </div>
        {#key activePage.id}
            <Page {activePage} {updatePageName} {viewOnly} />
        {/key}
    {/if}

    {#if pageItemContextMenu.page || (activePage !== null && activePage.id !== undefined && activePage.id !== null)}
        <PageContextMenu
            bind:pageItemContextMenu
            {fetchPages}
            bind:pages
            bind:activePage
            {notebooks}
            favoritesPageId={pageId}
        ></PageContextMenu>
    {/if}
</div>

<style>
.favorites-tabs {
    display: flex;
    margin-bottom: 1rem;
}

.favorites-tabs > a {
    display: block;
    text-decoration: none;
    color: inherit;
    padding: 0.3rem;
    border: 1px solid #ccc;
    cursor: pointer;
}

.favorites-tabs > a:not(:last-of-type) {
    border-right: 0;
}

.favorites-tabs > a.active {
    background-color: #fff6e5;
}
</style>
