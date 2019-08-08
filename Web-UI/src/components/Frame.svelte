<script>
let pages = []

let pageTypes = ['Table', 'FlatPage']

for(var i=0; i<=50; i++) {
    pages.push({
        id: i,
        name: 'Page ' + i,
        type: pageTypes[Math.floor(Math.random() * pageTypes.length)]
    })
}

let activePage = {}

let leftSidebarElement = null
let rightSidebarElement = null

function toggleSidebar(sidebarElement) {
    let sidebarStyle = getComputedStyle(sidebarElement)
    if(sidebarStyle.display === 'block') {
        sidebarElement.style.display = 'none'
    } else {
        sidebarElement.style.display = 'block'
    }
}

function toggleSidebars() {
    toggleSidebar(leftSidebarElement)
    toggleSidebar(rightSidebarElement)
}

import Table from './Table.svelte'
import FlatPage from './FlatPage.svelte'
</script>

<div>
    <nav class="journal-sidebar-hamburger" on:click={toggleSidebars}>&#9776; Menu</nav>
    <nav class="journal-left-sidebar" bind:this={leftSidebarElement} style="display: block">
        {#each pages as journal}
            <div class="journal-sidebar-item" class:journal-sidebar-item-selected={ activePage.id === journal.id } on:click={ () => activePage = journal }>{ journal.name }</div>
        {/each}
    </nav>
    <main class="journal-page">
        {#if activePage.id !== undefined && activePage.id !== null}
            <h1 class="journal-page-title">{activePage.name}</h1>
            <div class="journal-page-entries">
                    {#if activePage.type === 'Table'}
                        <Table bind:pageId={activePage.id}></Table>
                    {/if}
                    {#if activePage.type === 'FlatPage'}
                        <FlatPage bind:pageId={activePage.id}></FlatPage>
                    {/if}
            </div>
        {/if}
    </main>
    <nav class="journal-right-sidebar" bind:this={rightSidebarElement} style="display: block">
        {#each pages as journal}
            <div class="journal-sidebar-item" class:journal-sidebar-item-selected={ activePage.id === journal.id } on:click={ () => activePage = journal }>{ journal.name }</div>
        {/each}
    </nav>
</div>

<style>
.journal-sidebar-hamburger {
    cursor: pointer;
    font-size: 1.2em;
    padding-top: 0.5em;
    padding-right: 1em;
    padding-bottom: 0.6em;
    position: fixed;
    top: 0;
    right: 0;
    width: 100vw;
    border-bottom: 1px solid lightgrey;
    text-align: right;
    background-color: white;
}

.journal-left-sidebar {
    display: none;
    width: 15em;
    position: fixed;
    top: 0;
    left: 0;
    background-color: wheat;
}

.journal-right-sidebar {
    display: none;
    width: 20em;
    position: fixed;
    top: 0;
    right: 0;
    background-color: wheat;
}

.journal-sidebar-hamburger, .journal-sidebar {
    user-select: none;
}

.journal-sidebar-item {
    padding: 0.3em 0.9em;
}

.journal-sidebar-item:hover {
    background-color: #ffffff7d;
    cursor: pointer;
}

.journal-sidebar-item-selected, .journal-sidebar-item-selected:hover {
    background-color: white;
}

.journal-page {
    margin-left: 2em;
}

.journal-page-entries {
    margin-top: 1em;
    margin-right: 1em;
}

.journal-left-sidebar, .journal-right-sidebar, .journal-page {
    overflow-y: auto;
    height: calc(100vh - 3em);
    margin-top: 3em;
    padding-top: 1.4em;
    padding-bottom: 1.4em;
}

.journal-left-sidebar[style*="block"] + .journal-page {
    margin-left: 17em;
    margin-right: 20em;
}

h1.journal-page-title {
    margin-top: 0;
}
</style>
