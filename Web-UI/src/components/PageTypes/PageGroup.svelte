<script>
export let pageId = null
export let viewOnly = false

let pages = []
let activePage = null

$: fetchPages(pageId)

import fetchPlus from '../../helpers/fetchPlus.js'
import Page from '../Page.svelte'
import debounce from '../../helpers/debounce.js'
import PageNav from '../PageNav.svelte'
import { dragSort } from '../../actions/dragSort.js'

function fetchPages(pageId) {
    if(pageId) {
        fetchPlus.get(`/page-group/${pageId}`).then(response => {
            pages = response
            if(pages.length) {
                activePage = pages[0]
            }
        })
    }
}

const updatePageName = debounce(function(e) {
    fetchPlus.put(`/pages/name/${activePage.id}`, {
        pageName: e.target.innerText
    })
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
</script>

<div>
    {#if pages.length === 0}
        There are no pages in this page group.
    {/if}
    <div class="page-group-tabs">
        {#each pages as page}
            <a
                href="{`/page/${page.id}`}"
                on:click|preventDefault={() => activePage = page}
                class:active={ activePage && activePage.id === page.id }
                use:dragSort={{ item: page, onSort }}
            >{page.name}</a>
        {/each}
    </div>
    {#if activePage}
        <div style="margin-bottom: 1rem">
            <PageNav activePage={activePage}></PageNav>
        </div>
        <Page activePage={activePage} updatePageName={updatePageName} />
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

.page-group-tabs > a.active {
    background-color: #fff6e5;
}
</style>
