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

fetchPlus.get('/notebooks').then(response => {
    notebooks = response
})

async function addNotebook() {
    let notebookName = prompt('Enter new notebook name')
    if(notebookName) {
        const response = await fetchPlus.post('/notebooks', { notebookName })

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
        const response = await fetchPlus.post('/sections', { notebookId: notebook.id, sectionName })

        let newSection = {
            id: response.insertedRowId,
            name: sectionName,
            notebook_id: notebook.id
        }

        notebook.sections.push(newSection)
        notebooks = notebooks

        activeSection = newSection
    }
}

let savedActiveSection = localStorage.getItem('activeSection')
let activeSection = savedActiveSection ? JSON.parse(savedActiveSection) : {}

$: fetchPages(activeSection)

$: if(activeSection) {
    localStorage.setItem('activeSection', JSON.stringify(activeSection))
}

let activePage = {}

$: if(activePage && activePage.id) {
    localStorage.setItem('activePage', JSON.stringify(activePage))
}

async function fetchPages(activeSection) {
    if(!activeSection.id) {
        return
    }

    pages = []

    pages = await fetchPlus.get(`/pages/${activeSection.id}`)

    let savedActivePage = localStorage.getItem('activePage')
    savedActivePage = savedActivePage ? JSON.parse(savedActivePage) : {}

    if(savedActivePage) {
        let page = pages.find(page => page.id === savedActivePage.id)
        if(page === undefined) {
            localStorage.removeItem('activePage')
            activePage = {}
        } else {
            activePage = savedActivePage
        }
    }
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

    const response = await fetchPlus.post('/pages', {
        sectionId: activeSection.id,
        pageName,
        pageType
    })

    pages.push({
        id: response.insertedRowId,
        name: pageName,
        type: pageType,
        section_id: activeSection.id,
        notebook_id: activeSection.notebook_id
    })

    pages = pages

    activePage = {
        id: response.insertedRowId,
        name: pageName,
        type: pageType,
        section_id: activeSection.id,
        notebook_id: activeSection.notebook_id
    }

    addPage = {
        name: '',
        type: 'FlatPage'
    }
}

let pageItemContextMenu = {
    left: 0,
    top: 0,
    page: null
}

function handlePageItemContextMenu(e, page) {
    pageItemContextMenu.left = e.pageX
    pageItemContextMenu.top = e.pageY
    pageItemContextMenu.page = page
}

function deletePage() {
    if(confirm('Are you sure you want to delete this page?')) {
        fetchPlus.delete(`/pages/${pageItemContextMenu.page.id}`)
        pages = pages.filter(page => page.id !== pageItemContextMenu.page.id)
    }
    if(activePage.id === pageItemContextMenu.page.id) {
        activePage = {}
    }
    pageItemContextMenu.page = null
}

let sectionItemContextMenu = {
    left: 0,
    top: 0,
    section: null,
    notebook: null
}

function handleSectionItemContextMenu(e, section, notebook) {
    sectionItemContextMenu.left = e.pageX
    sectionItemContextMenu.top = e.pageY
    sectionItemContextMenu.section = section
    sectionItemContextMenu.notebook = notebook
}

function renameSection() {
    let newSectionName = prompt('Enter new section name', sectionItemContextMenu.section.name)
    if(newSectionName) {
        fetchPlus.put(`/sections/name/${sectionItemContextMenu.section.id}`, {
            sectionName: newSectionName
        })
        sectionItemContextMenu.section.name = newSectionName
        notebooks = notebooks
    }
    sectionItemContextMenu.section = null
    sectionItemContextMenu.notebook = null
}

function deleteSection() {
    if(confirm('Are you sure you want to delete this section?')) {
        fetchPlus.delete(`/sections/${sectionItemContextMenu.section.id}`)
        sectionItemContextMenu.notebook.sections = sectionItemContextMenu.notebook.sections.filter(section => section.id !== sectionItemContextMenu.section.id)
        notebooks = notebooks
    }
    if(activeSection.id === sectionItemContextMenu.section.id) {
        activeSection = {}
    }
    // set activePage to {} if it belongs to the deleted section
    if(activePage.section_id === sectionItemContextMenu.section.id) {
        activePage = {}
    }
    sectionItemContextMenu.section = null
    sectionItemContextMenu.notebook = null
}

let notebookItemContextMenu = {
    left: 0,
    top: 0,
    notebook: null
}

function handleNotebookItemContextMenu(e, notebook) {
    notebookItemContextMenu.left = e.pageX
    notebookItemContextMenu.top = e.pageY
    notebookItemContextMenu.notebook = notebook
}

function renameNotebook() {
    let newNotebookName = prompt('Enter new notebook name', notebookItemContextMenu.notebook.name)
    if(newNotebookName) {
        fetchPlus.put(`/notebooks/name/${notebookItemContextMenu.notebook.id}`, {
            notebookName: newNotebookName
        })
        notebookItemContextMenu.notebook.name = newNotebookName
        notebooks = notebooks
    }
    notebookItemContextMenu.notebook = null
}

function deleteNotebook() {
    if(confirm('Are you sure you want to delete this notebook?')) {
        fetchPlus.delete(`/notebooks/${notebookItemContextMenu.notebook.id}`)
        notebooks = notebooks.filter(notebook => notebook.id !== notebookItemContextMenu.notebook.id)
    }
    // set activeSection to {} if it belongs to the deleted notebook
    if(activeSection.notebook_id === notebookItemContextMenu.notebook.id) {
        activeSection = {}
    }
    // set activePage to {} if it belongs to the deleted notebook
    if(activePage.notebook_id === notebookItemContextMenu.notebook.id) {
        activePage = {}
    }
    notebookItemContextMenu.notebook = null
}

window.addEventListener('click', e => {
    if(!e.target.closest('.context-menu')) {
        pageItemContextMenu.page = null
        sectionItemContextMenu.section = null
        sectionItemContextMenu.notebook = null
        notebookItemContextMenu.notebook = null
    }
})

function focus(element) {
    element.focus()
}

function makeContentEditableSingleLine(e) {
    if(e.key.toLowerCase() === 'enter')  {
        e.preventDefault()
    }
}

import debounce from '../helpers/debounce.js'

const updatePageName = debounce(function(e) {
    fetchPlus.put(`/pages/name/${activePage.id}`, {
        pageName: e.target.innerHTML
    })
    let page = pages.find(page => page.id === activePage.id)
    page.name = e.target.innerHTML
    localStorage.setItem('activePage', JSON.stringify(page))
    pages = pages
}, 500)

function logout() {
    if(confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('username')
        localStorage.removeItem('password')
        localStorage.removeItem('token')
        location.reload()
    }
}

function toggleNotebookExpanded(notebook) {
    notebook.expanded = !notebook.expanded
    notebooks = notebooks
    fetchPlus.put(`/notebooks/expanded/${notebook.id}`, {
        notebookExpanded: notebook.expanded ? 1 : 0
    })
}

let showChangePasswordModal = false

let changePasswordObj = {
    currentPassword: '',
    newPassword: '',
    error: ''
}

function changePassword() {
    fetchPlus.post('/change-password', {
        currentPassword: changePasswordObj.currentPassword,
        newPassword: changePasswordObj.newPassword
    }).then(response => {
        if(response.hasOwnProperty('error')) {
            changePasswordObj.error = response.error
        } else {
            localStorage.setItem('password', changePasswordObj.newPassword)
            showChangePasswordModal = false
            changePasswordObj.error = ''
            alert('Password changed successfully!')
        }
        changePasswordObj.currentPassword = ''
        changePasswordObj.newPassword = ''
    })
}

let showPageHistoryModal = false
let showPageUploadsModal = false
let showPageHistoryItemViewModal = false
let pageHistory = []
let pageUploads = []
let pageHistoryItemViewPageContent = null

$: if(showPageHistoryModal && activePage) {
    fetchPlus.get(`/page-history/${activePage.id}`).then(response => {
        pageHistory = response
    })
}

$: if(showPageUploadsModal && activePage) {
    fetchPlus.get(`/page-uploads/${activePage.id}`).then(response => {
        pageUploads = response
    })
}

function viewPageHistoryItem(pageHistoryItemId) {
    showPageHistoryItemViewModal = true
    fetchPlus.get(`/page-history/content/${pageHistoryItemId}`).then(response => {
        pageHistoryItemViewPageContent = response.content
    })
}

function restorePageHistoryItem(pageHistoryItemId) {
    if(confirm('Are you sure you want to restore the page to this state?')) {
        fetchPlus.post(`/page-history/restore/${pageHistoryItemId}`).then(() => {
            document.location.reload()
        })
    }
}

import Table from './Table.svelte'
import FlatPage from './FlatPage.svelte'
import Modal from './Modal.svelte'
import { format } from 'date-fns'
</script>

<div>
    <nav class="journal-sidebar-hamburger" on:click={toggleSidebars}>
        <div class="pos-r">
            <div class="pos-a" style="margin-left: 14em">
                Page [ <a href="#view-page-history" on:click|preventDefault|stopPropagation={() => activePage.id ? showPageHistoryModal = true : null}>History</a> | <a href="#view-page-uploads" on:click|preventDefault|stopPropagation={() => activePage.id ? showPageUploadsModal = true : null}>Uploads</a> ]
            </div>
            <a href="#change-password" on:click|preventDefault|stopPropagation={() => showChangePasswordModal = true} class="mr-1em">Change Password</a>
            <a href="#logout" on:click|preventDefault|stopPropagation={logout} class="mr-1em">Logout</a>
            &#9776; Menu
        </div>
    </nav>
    <nav class="journal-left-sidebar" bind:this={leftSidebarElement} style="display: block">
        {#each notebooks as notebook}
            <div class="journal-sidebar-item-notebook">
                <div class="journal-sidebar-item journal-sidebar-item-notebook-name" class:journal-sidebar-item-notebook-expanded={!notebook.expanded} on:click={e => toggleNotebookExpanded(notebook)} on:contextmenu|preventDefault={(e) => handleNotebookItemContextMenu(e, notebook)}>
                    { notebook.name }
                    <div class="f-r">
                        {#if notebook.expanded}
                            -
                        {:else}
                            +
                        {/if}
                    </div>
                </div>
                {#if notebook.expanded}
                    <div>
                        {#each notebook.sections as section}
                            <div class="journal-sidebar-item" class:journal-sidebar-item-selected={ activeSection.id === section.id } on:click={ () => activeSection = section } on:contextmenu|preventDefault={(e) => handleSectionItemContextMenu(e, section, notebook)}>{ section.name }</div>
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
            <h1 class="journal-page-title" contenteditable on:keydown={makeContentEditableSingleLine} spellcheck="false" on:input={updatePageName}>{activePage.name}</h1>
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
                <h2 class="heading">Add Page</h2>
                <label>Name<br>
                    <input type="text" bind:value={addPage.name} required class="w-100p" use:focus>
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
    {#if showChangePasswordModal}
        <Modal on:close-modal={() => showChangePasswordModal = false}>
            <form on:submit|preventDefault={changePassword}>
                <h2 class="heading">Change Password</h2>
                <label>Current Password<br>
                    <input type="password" bind:value={changePasswordObj.currentPassword} required class="w-100p" use:focus>
                </label>
                <label class="d-b mt-0_5em">New Password<br>
                    <input type="password" bind:value={changePasswordObj.newPassword} required class="w-100p">
                </label>
                <button class="w-100p mt-1em">Update Password</button>
            </form>
            <div class="mt-1em red">
                {#if changePasswordObj.error}
                    Error: {changePasswordObj.error}
                {/if}
            </div>
        </Modal>
    {/if}
    {#if showPageHistoryModal}
        <Modal on:close-modal={() => showPageHistoryModal = false}>
            <h2 class="heading">Page History</h2>
            <div class="oy-a" style="max-height: 80vh">
                <table>
                    {#each pageHistory as pageHistoryItem}
                        <tr>
                            <td>{format(pageHistoryItem.created_at, 'DD-MM-YYYY hh:mm A')}</td>
                            <td><button on:click={() => viewPageHistoryItem(pageHistoryItem.id)}>View</button></td>
                            <td><button on:click={() => restorePageHistoryItem(pageHistoryItem.id)}>Restore</button></td>
                        </tr>
                    {:else}
                        <div>No History Found</div>
                    {/each}
                </table>
            </div>
        </Modal>
    {/if}
    {#if showPageUploadsModal}
        <Modal on:close-modal={() => showPageUploadsModal = false}>
            <h2 class="heading">Page Uploads</h2>
            <div class="oy-a" style="max-height: 80vh">
                <table>
                    {#each pageUploads as pageUploadsItem}
                        <tr>
                            <td>{format(pageUploadsItem.created_at, 'DD-MM-YYYY hh:mm A')}</td>
                            <!-- show view if image, show download if file -->
                            <td><button>View</button></td>
                            <td><button>Delete</button></td>
                        </tr>
                    {:else}
                        <div>No Uploads Found</div>
                    {/each}
                </table>
            </div>
        </Modal>
    {/if}
    {#if showPageHistoryItemViewModal}
        <Modal on:close-modal={() => showPageHistoryItemViewModal = false}>
            <div class="oy-a" style="max-height: 80vh">
                {#if activePage.type === 'Table'}
                    <Table bind:pageContentOverride={pageHistoryItemViewPageContent}></Table>
                {/if}
                {#if activePage.type === 'FlatPage'}
                    <FlatPage bind:pageContentOverride={pageHistoryItemViewPageContent}></FlatPage>
                {/if}
            </div>
        </Modal>
    {/if}
    {#if pageItemContextMenu.page}
        <div class="context-menu" style="left: {pageItemContextMenu.left}px; top: {pageItemContextMenu.top}px">
            <div on:click={deletePage}>Delete page</div>
        </div>
    {/if}
    {#if sectionItemContextMenu.section}
        <div class="context-menu" style="left: {sectionItemContextMenu.left}px; top: {sectionItemContextMenu.top}px">
            <div on:click={renameSection}>Rename section</div>
            <div on:click={deleteSection}>Delete section</div>
        </div>
    {/if}
    {#if notebookItemContextMenu.notebook}
        <div class="context-menu" style="left: {notebookItemContextMenu.left}px; top: {notebookItemContextMenu.top}px">
            <div on:click={renameNotebook}>Rename notebook</div>
            <div on:click={deleteNotebook}>Delete notebook</div>
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

.journal-sidebar-item-notebook-name {
    background-color: #ffc14d4f;
    padding-top: 0.4em;
    padding-bottom: 0.4em;
}

.journal-sidebar-item-notebook-name:hover {
    background-color: #ffc14d;
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
    outline: 0;
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

h2.heading {
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

.mr-1em {
    margin-right: 1em;
}

.red {
    color: red;
}

.f-r {
    float: right;
}

.pos-r {
    position: relative;
}

.pos-a {
    position: absolute;
}

.oy-a {
    overflow-y: auto;
}
</style>
