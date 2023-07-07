<script>
import Page from './Page.svelte'
import PageNav from './PageNav.svelte'
import debounce from '../helpers/debounce.js'
import fetchPlus from '../helpers/fetchPlus.js'

let activePageId = document.location.pathname.split('/').slice(-1)[0]
let activePage = {}
let pageNotFound = false

async function getPageInfo() {
    if(!activePageId) {
        pageNotFound = true
        return
    }

    try {
        activePage = await fetchPlus.get(`/pages/info/${activePageId}`)
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
    document.title = activePage.name + ' | ' + ' Journals'
}

getPageInfo()
</script>

{#if pageNotFound}
    <div style="display: grid; place-items: center; height: 100vh; font-size: 2rem;">404 Page Not Found</div>
{:else}
    <div style="display: grid; grid-template-rows: auto 1fr; height: 100vh;">
        <div class="page-header">
            <div style="margin-left: 2em">
                {#if activePage.locked === false && activePage.type !== 'PageGroup'}
                    <PageNav bind:activePage={activePage}></PageNav>
                {/if}
            </div>
        </div>
        <Page activePage={activePage} updatePageName={updatePageName} className="journal-page-container"></Page>
    </div>
{/if}

<style>
:global(.journal-page-container) {
    height: 100%;
    overflow-y: auto;
    padding-left: 2rem;
    padding-top: 1.4em;
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
