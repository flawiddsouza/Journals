<script>
import Page from './Page.svelte'
import PageNav from './PageNav.svelte'
import debounce from '../helpers/debounce.js'
import fetchPlus from '../helpers/fetchPlus.js'

let notebooks = []
let activePageId = document.location.pathname.split('/').slice(-1)[0]
let activePage = {}
let pageNotFound = false
let gridTemplateRowsMainDiv = `grid-template-rows: 1fr`

async function getPageInfo() {
    if(!activePageId) {
        pageNotFound = true
        return
    }

    try {
        activePage = await fetchPlus.get(`/pages/info/${activePageId}`)
        if(activePage.locked === false && activePage.type !== 'PageGroup') {
            gridTemplateRowsMainDiv = `grid-template-rows: auto 1fr`
        } else {
            gridTemplateRowsMainDiv = `grid-template-rows: 1fr`
        }
    } catch {
        pageNotFound = true
    }
}

const updatePageName = debounce(function(e) {
    fetchPlus.put(`/pages/name/${activePage.id}`, {
        pageName: e.target.innerText
    })
}, 500)

$: if(activePage && activePage.id) {
    let pageTitle = activePage.name
    if(activePage.parent_id) {
        pageTitle += ' | ' + activePage.parent_name
    }
    document.title = pageTitle + ' | ' + ' Journals'
}

getPageInfo()
</script>

{#if pageNotFound}
    <div style="display: grid; place-items: center; height: 100svh; font-size: 2rem;">404 Page Not Found</div>
{:else}
    <div style="display: grid; height: 100svh; {gridTemplateRowsMainDiv}">
        {#if activePage.locked === false && activePage.type !== 'PageGroup'}
            <div class="page-header">
                <div style="margin-left: 2em">
                    <PageNav bind:activePage={activePage}></PageNav>
                </div>
            </div>
        {/if}
        <Page
            {notebooks}
            activePage={activePage}
            updatePageName={updatePageName}
            viewOnly={activePage.parent_view_only}
            className="journal-page-container"
        ></Page>
    </div>
{/if}

<style>
:global(.journal-page-container) {
    height: 100%;
    overflow-y: auto;
    padding-left: 2rem;
    padding-top: 1.4em;
}

:global(.journal-page-container.PageType-RichText) {
    padding-left: 0;
}

.page-header {
    user-select: none;
    font-size: 1.2em;
    padding-top: 0.5em;
    padding-right: 1em;
    padding-bottom: 0.6em;
    border-bottom: 1px solid lightgrey;
    background-color: white;
}
</style>
