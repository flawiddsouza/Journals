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

let notebooks = []

import fetchPlus from '../helpers/fetchPlus.js'

fetchPlus.get('http://localhost:3000/notebooks').then(response => {
    notebooks = response
})

async function addNotebook() {
    let notebookName = prompt('Enter new notebook name')
    if(notebookName) {
        const rawResponse = await fetch('http://localhost:3000/notebooks', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ notebookName })
        })
        const response = await rawResponse.json()

        notebooks.push({
            id: response.insertedRowId,
            name: notebookName,
            expanded: true,
            sections: []
        })

        notebooks = notebooks
    }
}

async function addSectionToNotebook(notebook) {
    let sectionName = prompt('Enter new section name')
    if(sectionName) {
        const rawResponse = await fetch('http://localhost:3000/sections', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ notebookId: notebook.id, sectionName })
        })
        const response = await rawResponse.json()

        let newSection = {
            id: response.insertedRowId,
            name: sectionName
        }

        notebook.sections.push(newSection)
        notebooks = notebooks

        activeSection = newSection
    }
}

let activePage = {}
let activeSection = {}

$: fetchPages(activeSection)

async function fetchPages(activeSection) {
    if(!activeSection.id) {
        return
    }

    pages = []
    activePage = {}

    fetchPlus.get(`http://localhost:3000/pages/${activeSection.id}`).then(response => {
        pages = response
    })
}

let showAddPageModal = false
let addPage = {
    name: '',
    type: 'FlatPage'
}

async function addPageToActiveSection() {
    showAddPageModal = false

    let pageName = addPage.name
    let pageType = addPage.type

    const rawResponse = await fetch('http://localhost:3000/pages', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            sectionId: activeSection.id,
            pageName,
            pageType
        })
    })
    const response = await rawResponse.json()

    pages.push({
        id: response.insertedRowId,
        name: pageName,
        type: pageType
    })

    pages = pages

    addPage = {
        name: '',
        type: 'FlatPage'
    }
}

let contextMenu = {
    left: 0,
    top: 0,
    page: null
}

function handlePageItemContextMenu(e, page) {
    contextMenu.left = e.pageX
    contextMenu.top = e.pageY
    contextMenu.page = page
}

function deletePage() {
    if(confirm('Are you sure you want to delete this page?')) {
        fetchPlus.delete(`http://localhost:3000/pages/${contextMenu.page.id}`)
        pages = pages.filter(page => page.id !== contextMenu.page.id)
    }
    contextMenu.page = null
}

window.addEventListener('click', e => {
    if(!e.target.closest('.context-menu')) {
        contextMenu.page = null
    }
})

import Table from './Table.svelte'
import FlatPage from './FlatPage.svelte'
import Modal from './Modal.svelte'
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
        {#if activeSection.id !== undefined && activeSection.id !== null}
            {#each pages as page}
                <div class="journal-sidebar-item" class:journal-sidebar-item-selected={ activePage.id === page.id } on:click={ () => activePage = page } on:contextmenu|preventDefault={(e) => handlePageItemContextMenu(e, page)}>{ page.name }</div>
            {/each}
            <div class="journal-sidebar-item" on:click={() => showAddPageModal = true}>Add Page +</div>
        {/if}
    </nav>
    {#if showAddPageModal}
        <Modal on:close-modal={() => showAddPageModal = false}>
            <form on:submit|preventDefault={addPageToActiveSection}>
                <h2>Add Page</h2>
                <label>Name<br>
                    <input type="text" bind:value={addPage.name} required class="w-100p">
                </label>
                <label class="d-b mt-0_5em">Type<br>
                    <select bind:value={addPage.type} required class="w-100p">
                        <option value="FlatPage">Flat Page</option>
                        <option value="Table">Table</option>
                    </select>
                </label>
                <button class="w-100p mt-1em">Add</button>
            </form>
        </Modal>
    {/if}
    {#if contextMenu.page}
        <div class="context-menu" style="left: {contextMenu.left}px; top: {contextMenu.top}px">
            <div on:click={deletePage}>Delete page</div>
        </div>
    {/if}
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

.w-100p {
    width: 100%;
}

.mt-0_5em {
    margin-top: 0.5em;
}

.mt-1em {
    margin-top: 1em;
}

.d-b {
    display: block;
}

form > h2 {
    margin: 0;
    margin-bottom: 0.5em;
}

.context-menu {
    position: fixed;
    background-color: white;
    padding: 4px 8px;
    cursor: pointer;
    box-shadow: 1px 1px 4px -1px black;
}
</style>
