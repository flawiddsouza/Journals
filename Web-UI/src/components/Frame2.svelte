<script>
import Page from './Page.svelte'
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

getPageInfo()
</script>

{#if pageNotFound}
    <div style="display: grid; place-items: center; height: 100vh; font-size: 2rem;">404 Page Not Found</div>
{:else}
    <Page activePage={activePage} updatePageName={updatePageName} className="journal-page-container"></Page>
{/if}

<style>
:global(.journal-page-container) {
    height: 100vh;
    overflow-y: auto;
    padding-left: 2rem;
    padding-top: 2rem;
}
</style>
