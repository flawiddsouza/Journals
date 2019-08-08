<script>
let pages = []

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

let notebooks = [
    {
        id: 1,
        name: 'Notebook 1',
        expanded: true,
        sections: [
            {
                id: 1,
                name: 'Notebook 1 Section 1'
            },
            {
                id: 2,
                name: 'Notebook 1 Section 2'
            },
            {
                id: 3,
                name: 'Notebook 1 Section 3'
            },
            {
                id: 4,
                name: 'Notebook 1 Section 4'
            },
            {
                id: 5,
                name: 'Notebook 1 Section 5'
            }
        ]
    },
    {
        id: 2,
        name: 'Notebook 2',
        expanded: true,
        sections: []
    }
]

function addNotebook() {
    let notebookName = prompt('Enter new notebook name')
    if(notebookName) {
        notebooks.push({
            id: Math.random(0, 999999),
            name: notebookName,
            expanded: true,
            sections: []
        })
        notebooks = notebooks
    }
}

function addSectionToNotebook(notebook) {
    let sectionName = prompt('Enter new section name')
    if(sectionName) {
        let newSection = {
            id: Math.random(0, 999999),
            name: sectionName
        }
        notebook.sections.push(newSection)
        activeSection = newSection
        notebooks = notebooks
    }
}

let activePage = {}
let activeSection = {}

$: fetchPages(activeSection)

function fetchPages(activeSection) {
    if(!activeSection.id) {
        return
    }

    pages = []
    activePage = {}

    let pageTypes = ['Table', 'FlatPage']

    for(var i=0; i<=Math.floor(Math.random() * Math.floor(40)); i++) {
        pages.push({
            id: i,
            name: 'Page ' + Math.floor(Math.random() * Math.floor(100)),
            type: pageTypes[Math.floor(Math.random() * pageTypes.length)]
        })
    }
}

import Table from './Table.svelte'
import FlatPage from './FlatPage.svelte'
</script>

<div>
    <nav class="journal-sidebar-hamburger" on:click={toggleSidebars}>&#9776; Menu</nav>
    <nav class="journal-left-sidebar" bind:this={leftSidebarElement} style="display: block">
        {#each notebooks as notebook}
            <div class="journal-sidebar-item-notebook">
                <div class="journal-sidebar-item journal-sidebar-item-notebook-name" class:journal-sidebar-item-notebook-expanded={!notebook.expanded} on:click={() => notebook.expanded = !notebook.expanded}>{ notebook.name }</div>
                {#if notebook.expanded}
                    <div>
                        {#each notebook.sections as section}
                            <div class="journal-sidebar-item" class:journal-sidebar-item-selected={ activeSection.id === section.id } on:click={ () => activeSection = section }>{ section.name }</div>
                        {/each}
                        <div class="journal-sidebar-item" on:click={() => addSectionToNotebook(notebook)}>Add Section +</div>
                    </div>
                {/if}
            </div>
        {/each}
        <div class="journal-sidebar-item" on:click={addNotebook}>Add Notebook +</div>
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
    user-select: none;
}

.journal-sidebar-item:hover {
    background-color: #ffffff7d;
    cursor: pointer;
}

.journal-sidebar-item-selected, .journal-sidebar-item-selected:hover {
    background-color: white;
}

.journal-sidebar-item-notebook:first-of-type {
    border-top: 1px solid #d08700;
}

.journal-sidebar-item-notebook {
    border-bottom: 1px solid #d08700;
}

.journal-sidebar-item-notebook-name:not(.journal-sidebar-item-notebook-expanded) {
    border-bottom: 1px solid #d08700;
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
