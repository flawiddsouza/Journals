<script>
export let pageId = null
export let viewOnly = false

let pages = []
let activePage = null

$: fetchPages(pageId)

import fetchPlus from '../../helpers/fetchPlus.js'
import Page from '../Page.svelte'
import debounce from '../../helpers/debounce.js'

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
            >{page.name}</a>
        {/each}
    </div>
    {#if activePage}
        <Page activePage={activePage} updatePageName={updatePageName} />
    {/if}
</div>

<style>
.page-group-tabs {
    display: flex;
    margin-bottom: 0.5rem;
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
    background-color: wheat;
}
</style>
