<script>
let journals = []

let journalTypes = ['Table', 'FlatPage']

for(var i=0; i<=50; i++) {
    journals.push({
        id: i,
        name: 'Journal ' + i,
        type: journalTypes[Math.floor(Math.random() * journalTypes.length)]
    })
}

let activePage = {}

let sidebarElement = null

function toggleSidebar() {
    let sidebarStyle = getComputedStyle(sidebarElement)
    if(sidebarStyle.display === 'block') {
        sidebarElement.style.display = 'none'
    } else {
        sidebarElement.style.display = 'block'
    }
}

import Table from './Table.svelte'
import FlatPage from './FlatPage.svelte'
</script>

<div>
    <nav class="journal-sidebar-hamburger" on:click={toggleSidebar}>&#9776; Menu</nav>
    <nav class="journal-sidebar" bind:this={sidebarElement} style="display: block">
        {#each journals as journal}
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

.journal-sidebar {
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
}

.journal-sidebar, .journal-page {
    overflow-y: auto;
    height: calc(100vh - 3em);
    margin-top: 3em;
    padding-top: 1.4em;
    padding-bottom: 1.4em;
}

.journal-sidebar[style*="block"] + .journal-page {
    margin-right: 20em;
}

h1.journal-page-title {
    margin-top: 0;
}
</style>
