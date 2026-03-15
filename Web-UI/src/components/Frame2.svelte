<script>
import Page from './Page.svelte'
import PageNav from './PageNav.svelte'
import BacklinksPanel from './BacklinksPanel.svelte'
import debounce from '../helpers/debounce.js'
import fetchPlus from '../helpers/fetchPlus.js'
import { getTheme, setTheme as persistTheme, initTheme } from '../helpers/theme.js'

let notebooks = []
let activePageId = document.location.pathname.split('/').slice(-1)[0]
let activePage = {}
let pageNotFound = false
let gridTemplateRowsMainDiv = `grid-template-rows: 1fr`
let showBacklinks = false

async function getPageInfo() {
    if (!activePageId) {
        pageNotFound = true
        return
    }

    try {
        activePage = await fetchPlus.get(`/pages/info/${activePageId}`)
        if (
            activePage.locked === false &&
            activePage.type !== 'PageGroup' &&
            activePage.type !== 'Favorites'
        ) {
            gridTemplateRowsMainDiv = `grid-template-rows: auto 1fr`
        } else {
            gridTemplateRowsMainDiv = `grid-template-rows: 1fr`
        }
    } catch {
        pageNotFound = true
    }
}

const updatePageName = debounce(function (e) {
    fetchPlus.put(`/pages/name/${activePage.id}`, {
        pageName: e.target.innerText,
    })
}, 500)

$: if (activePage && activePage.id) {
    let pageTitle = activePage.name
    if (activePage.parent_id) {
        pageTitle += ' | ' + activePage.parent_name
    }
    document.title = pageTitle + ' | ' + ' Journals'
}

getPageInfo()

let theme = getTheme()
initTheme()

function setTheme(value) {
    theme = value
    persistTheme(value)
}
</script>

{#if pageNotFound}
    <div
        style="display: grid; place-items: center; height: 100svh; font-size: 2rem;"
    >
        404 Page Not Found
    </div>
{:else}
    <div style="display: grid; height: 100svh; {gridTemplateRowsMainDiv}">
        {#if activePage.locked === false && activePage.type !== 'PageGroup' && activePage.type !== 'Favorites'}
            <div class="page-header">
                <PageNav bind:activePage bind:showBacklinks></PageNav>
                <div class="page-header-right">
                    <span class="theme-label">Theme:</span>
                    <select value={theme} on:change={(e) => setTheme(e.target.value)}>
                        <option value="golden">Golden</option>
                        <option value="slate">Slate</option>
                        <option value="forest">Forest</option>
                        <option value="midnight">Midnight</option>
                        <option value="rose">Rose</option>
                    </select>
                </div>
            </div>
        {/if}
        <Page
            {notebooks}
            {activePage}
            {updatePageName}
            viewOnly={activePage.parent_view_only}
            className="journal-page-container"
        ></Page>
        {#if showBacklinks}
            <BacklinksPanel
                pageId={activePage.id}
                on:close={() => (showBacklinks = false)}
            ></BacklinksPanel>
        {/if}
    </div>
{/if}

<style>
:global(.journal-page-container) {
    height: 100%;
    overflow-y: auto;
    padding-left: 2rem;
    padding-top: 1.4em;
    background: var(--bg-center);
}

:global(.journal-page-container.PageType-RichText) {
    padding-left: 0;
}

:global(.journal-page-container.PageType-Spreadsheet),
:global(.journal-page-container.PageType-DrawIO),
:global(.journal-page-container.PageType-MiniApp),
:global(.journal-page-container.PageType-Kanban) {
    padding-left: 0;
    padding-top: 0;
}

.page-header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    font-size: 1.2em;
    padding-top: 0.5em;
    padding-bottom: 0.6em;
    border-bottom: 1px solid var(--border-topbar);
    background-color: var(--bg-topbar);
}

.page-header-right {
    position: absolute;
    right: 1rem;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.7rem;
}

.theme-label {
    font-size: 11px;
    color: var(--color-tb-link);
    opacity: 0.7;
}

.page-header-right select {
    appearance: none;
    border: 1px solid var(--border-select);
    background: var(--bg-select);
    border-radius: 5px;
    padding: 3px 20px 3px 7px;
    font-size: 12px;
    color: inherit;
    outline: none;
    cursor: pointer;
    font-family: inherit;
    opacity: 0.8;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
}
</style>
