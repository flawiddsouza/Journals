<script>
let pages = []
let pagesFilter = ''

$: filteredPages = pagesFilter !== '' ? pages.filter(page => page.name.toLowerCase().includes(pagesFilter.toLowerCase())): pages

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
let firstLoad = true

$: if(activePage && activePage.id) {
    localStorage.setItem('activePage', JSON.stringify(activePage))
    firstLoad = false
} else {
    if(!firstLoad) {
        localStorage.removeItem('activePage')
    }
    firstLoad = false
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
        notebook_id: activeSection.notebook_id,
        view_only: false
    })

    pages = pages

    activePage = {
        id: response.insertedRowId,
        name: pageName,
        type: pageType,
        section_id: activeSection.id,
        notebook_id: activeSection.notebook_id,
        view_only: false
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

let showMovePageModal = false
let showMovePageModalData = null
let showMovePageModalSelectedNotebook = null
let showMovePageModalSelectedSectionId = null

function pageMakeViewOnly() {
    fetchPlus.put(`/pages/view-only/${activePage.id}`, {
        viewOnly: true
    })

    pageItemContextMenu.page.view_only = true

    if(activePage.id === pageItemContextMenu.page.id) {
        activePage.view_only = true
    }

    pageItemContextMenu.page = null
}

function pageEnableEdits() {
    fetchPlus.put(`/pages/view-only/${activePage.id}`, {
        viewOnly: false
    })

    pageItemContextMenu.page.view_only = false

    if(activePage.id === pageItemContextMenu.page.id) {
        activePage.view_only = false
    }

    pageItemContextMenu.page = null
}

function startMovePage() {
    showMovePageModalData = JSON.parse(JSON.stringify(pageItemContextMenu.page))
    showMovePageModalSelectedNotebook = {
        sections: []
    }
    showMovePageModalSelectedSectionId = null
    showMovePageModal = true
    pageItemContextMenu.page = null
}

function movePage() {
    fetchPlus.put(`/move-page/${showMovePageModalData.id}`, {
        sectionId: showMovePageModalSelectedSectionId
    })

    pages = pages.filter(page => page.id !== showMovePageModalData.id)

    if(activePage.id === showMovePageModalData.id) {
        activePage = {}
    }

    showMovePageModal = false
}

function deletePage() {
    if(confirm('Are you sure you want to delete this page?')) {
        fetchPlus.delete(`/pages/${pageItemContextMenu.page.id}`)
        pages = pages.filter(page => page.id !== pageItemContextMenu.page.id)

        if(activePage.id === pageItemContextMenu.page.id) {
            activePage = {}
        }
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

let showMoveSectionModal = false
let showMoveSectionModalData = null
let showMoveSectionModalSelectedNotebookId = null

function startMoveSection() {
    showMoveSectionModalSelectedNotebookId = null
    showMoveSectionModalData = JSON.parse(JSON.stringify(sectionItemContextMenu.section))
    showMoveSectionModal = true
}

function moveSection() {
    fetchPlus.put(`/move-section/${showMoveSectionModalData.id}`, {
        notebookId: showMoveSectionModalSelectedNotebookId
    })

    let sourceNotebook = notebooks.find(notebook => notebook.id === showMoveSectionModalData.notebook_id)
    sourceNotebook.sections = sourceNotebook.sections.filter(section => section.id !== showMoveSectionModalData.id)

    let targetNotebook = notebooks.find(notebook => notebook.id === showMoveSectionModalSelectedNotebookId)
    let sectionToInsert = JSON.parse(JSON.stringify(showMoveSectionModalData))
    sectionToInsert.notebook_id = showMoveSectionModalSelectedNotebookId
    targetNotebook.sections.push(sectionToInsert)

    notebooks = notebooks

    if(activeSection.id === showMoveSectionModalData.id) {
        activeSection = {}
    }

    // set activePage to {} if it belongs to the deleted section
    if(activePage.section_id === showMoveSectionModalData.id) {
        activePage = {}
    }

    showMoveSectionModal = false
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

        if(activeSection.id === sectionItemContextMenu.section.id) {
            activeSection = {}
        }

        // set activePage to {} if it belongs to the deleted section
        if(activePage.section_id === sectionItemContextMenu.section.id) {
            activePage = {}
        }
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


let showConfigureSectionSortOrderModal = false
let showConfigureSectionSortOrderModalData = null

function startConfigureSectionSortOrder() {
    showConfigureSectionSortOrderModalData = JSON.parse(JSON.stringify(notebookItemContextMenu.notebook))
    showConfigureSectionSortOrderModal = true
}

function configureSectionSortOrder() {
    fetchPlus.post('/sections/sort-order/update', showConfigureSectionSortOrderModalData.sections.map(item => ({
        sectionId: item.id,
        sortOrder: Number(item.sort_order)
    })))

    let targetNotebook = notebooks.find(notebook => notebook.id === showConfigureSectionSortOrderModalData.id)
    targetNotebook.sections = showConfigureSectionSortOrderModalData.sections
    targetNotebook.sections = targetNotebook.sections.sort((a, b) => a.sort_order - b.sort_order)
    notebooks = notebooks

    showConfigureSectionSortOrderModal = false
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

        // set activeSection to {} if it belongs to the deleted notebook
        if(activeSection.notebook_id === notebookItemContextMenu.notebook.id) {
            activeSection = {}
        }
        // set activePage to {} if it belongs to the deleted notebook
        if(activePage.notebook_id === notebookItemContextMenu.notebook.id) {
            activePage = {}
        }
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
        pageName: e.target.innerText
    })
    let page = pages.find(page => page.id === activePage.id)
    page.name = e.target.innerText
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
let showPageStylesModal = false

let pageHistory = []
let pageUploads = []
let pageStyles = {}

let showPageHistoryItemViewModal = false
let pageHistoryItemViewPageContent = null

$: if(showPageHistoryModal && activePage) {
    fetchPlus.get(`/page-history/${activePage.id}`).then(response => {
        pageHistory = response
    })
}

function fetchPageUploads(page) {
    fetchPlus.get(`/page-uploads/${page.id}`).then(response => {
        pageUploads = response
    })
}

$: if(showPageUploadsModal && activePage) {
    fetchPageUploads(activePage)
}

function viewPageHistoryItem(pageHistoryItemId) {
    showPageHistoryItemViewModal = true
    fetchPlus.get(`/page-history/content/${pageHistoryItemId}`).then(response => {
        pageHistoryItemViewPageContent = response.content
    })
}

function restorePageHistoryItem(pageHistoryItemId) {
    if(confirm('Are you sure you want to restore the page to this state?')) {
        fetchPlus.post(`/page-history/restore/${pageHistoryItemId}`, {}).then(() => {
            document.location.reload()
        })
    }
}

import { baseURL } from '../../config.js'

function viewImage(pageUploadsItem) {
    window.open(`${baseURL}/${pageUploadsItem.file_path}`)
}

function deleteImage(pageUploadsItemId) {
    if(confirm('Are you sure you want to delete this image?')) {
        fetchPlus.delete(`/page-uploads/delete/${pageUploadsItemId}`).then(() => {
            fetchPageUploads(activePage)
        })
    }
}

function startShowPageStylesModal() {
    showPageStylesModal = true
    pageStyles.fontSize = activePage.font_size || '14'
    pageStyles.fontSizeUnit = activePage.font_size_unit || 'px'
    pageStyles.font = activePage.font || 'Ubuntu'
}

function resetPageStylesToDefault() {
    pageStyles.fontSize = '14'
    pageStyles.fontSizeUnit = 'px'
    pageStyles.font = 'Ubuntu'
}

function savePageStyles() {
    fetchPlus.put(`/pages/styles/${activePage.id}`, pageStyles)
    activePage.font_size = pageStyles.fontSize
    activePage.font_size_unit = pageStyles.fontSizeUnit
    activePage.font = pageStyles.font
}

let activeElement = null

function makeDraggableContainer(element, sidebarItemClass) {
    function dragover(e) {
        if(pagesFilter !== '') { // disable drag sort order functionality when pages are filtered
            return
        }

        e.preventDefault()
        if(e.target.classList.contains(sidebarItemClass)) {
            if(e.target === activeElement.previousElementSibling) { // if item is before drag element
                e.target.insertAdjacentElement('beforebegin', activeElement)
            } else { // if item is after drag element
                e.target.insertAdjacentElement('afterend', activeElement)
            }
        }
        activeElement.classList.add('ghost')
    }

    function updateSortOrder() {
        if(pagesFilter !== '') { // disable drag sort order functionality when pages are filtered
            return
        }

        let pageIdsInOrder = Array.from(activeElement.parentElement.querySelectorAll('[draggable="true"')).map(item => item.dataset.pageId)
        let pageIdsWithSortOrder = pageIdsInOrder.map((pageId, index) => {
            return {
                pageId,
                sortOrder: index + 1
            }
        })
        fetchPlus.post('/pages/sort-order/update', pageIdsWithSortOrder)
        activeElement.classList.remove('ghost')
        activeElement = null
    }

    function drop(e) {
        e.preventDefault()
        updateSortOrder()
    }

    function dragend(e) {
        if(activeElement) {
            updateSortOrder()
        }
    }

    element.addEventListener('dragover', dragover)
    element.addEventListener('drop', drop)
    element.addEventListener('dragend', dragend)
}

function makeDraggableItem(element) {
    element.draggable = true

    function dragstart(e) {
        if(pagesFilter !== '') { // disable drag sort order functionality when pages are filtered
            return
        }

        activeElement = e.target

        // hide drag image by setting it to transparent image - https://stackoverflow.com/a/49535378/4932305
        var img = new Image()
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs='
        event.dataTransfer.setDragImage(img, 0, 0)
    }

    element.addEventListener('dragstart', e => dragstart(e))
}

import Table from './Table.svelte'
import FlatPage from './FlatPage.svelte'
import Spreadsheet from './PageTypes/Spreadsheet.svelte'
import Modal from './Modal.svelte'
import { format } from 'date-fns'
</script>

<div>
    <nav class="journal-sidebar-hamburger" on:click={toggleSidebars}>
        <div class="pos-r">
            <div class="pos-a" style="margin-left: 14em">
                Page [ <a href="#view-page-history" on:click|preventDefault|stopPropagation={() => activePage.id ? showPageHistoryModal = true : null}>History</a> | <a href="#view-page-uploads" on:click|preventDefault|stopPropagation={() => activePage.id ? showPageUploadsModal = true : null}>Uploads</a> {#if activePage.type !== 'Spreadsheet'} | <a href="#view-page-styles" on:click|preventDefault|stopPropagation={startShowPageStylesModal}>Styles</a> {/if} ]
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
                            <div class="journal-sidebar-item" class:journal-sidebar-item-selected={ activeSection.id === section.id } on:click={
                                () => {
                                    activeSection = section
                                    pagesFilter = '' // reset pages filter on section change
                                }
                            } on:contextmenu|preventDefault={(e) => handleSectionItemContextMenu(e, section, notebook)}>{ section.name }</div>
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
            {#if activePage.view_only }
                <h1 class="journal-page-title" style="margin-bottom: 0">{activePage.name}</h1>
            {:else}
                <h1 class="journal-page-title" contenteditable on:keydown={makeContentEditableSingleLine} spellcheck="false" on:input={updatePageName} style="margin-bottom: 0">
                    {activePage.name}
                </h1>
            {/if}
            <time style="font-size: 10px; color: darkgrey;">{format(activePage.created_at + 'Z', 'DD-MM-YYYY hh:mm A')}</time>
            <div class="journal-page-entries">
                {#if activePage.type === 'Table'}
                    <Table
                        bind:pageId={activePage.id}
                        style="font-size: {activePage.font_size || '14'}{activePage.font_size_unit || 'px'}; font-family: {activePage.font || 'Ubuntu'}"
                        bind:viewOnly={activePage.view_only}
                    ></Table>
                {/if}
                {#if activePage.type === 'FlatPage'}
                    <FlatPage
                        bind:pageId={activePage.id}
                        style="font-size: {activePage.font_size || '14'}{activePage.font_size_unit || 'px'}; font-family: {activePage.font || 'Ubuntu'}"
                        bind:viewOnly={activePage.view_only}
                    ></FlatPage>
                {/if}
                {#if activePage.type === 'Spreadsheet'}
                    <Spreadsheet
                        bind:pageId={activePage.id}
                        bind:viewOnly={activePage.view_only}
                    ></Spreadsheet>
                {/if}
            </div>
        {/if}
    </main>
    <nav class="journal-right-sidebar" bind:this={rightSidebarElement} style="display: block" use:makeDraggableContainer={'page-sidebar-item'}>
        {#if activeSection.id !== undefined && activeSection.id !== null}
            <div class="w-100p" style="height: 1.6em">
                <input type="search" placeholder="Filter..." class="pos-f" style="top: 50px; width: 20.9em; margin-left: 1px;" bind:value="{pagesFilter}">
            </div>
            {#each filteredPages as page}
                <div class="journal-sidebar-item page-sidebar-item" class:journal-sidebar-item-selected={ activePage.id === page.id } on:click={ () => activePage = page } on:contextmenu|preventDefault={(e) => handlePageItemContextMenu(e, page)} data-page-id={page.id} use:makeDraggableItem>{ page.name }</div>
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
                        <option value="Spreadsheet">Spreadsheet</option>
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
                            <td>{format(pageHistoryItem.created_at + 'Z', 'DD-MM-YYYY hh:mm A')}</td>
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
                            <td>{format(pageUploadsItem.created_at + 'Z', 'DD-MM-YYYY hh:mm A')}</td>
                            <!-- show view if image, show download if file -->
                            <td><button on:click={() => viewImage(pageUploadsItem)}>View</button></td>
                            <td><button on:click={() => deleteImage(pageUploadsItem.id)}>Delete</button></td>
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
                {#if activePage.type === 'Spreadsheet'}
                    <Spreadsheet bind:pageContentOverride={pageHistoryItemViewPageContent}></Spreadsheet>
                {/if}
            </div>
        </Modal>
    {/if}
    {#if showPageStylesModal}
        <Modal on:close-modal={() => showPageStylesModal = false}>
            <h2 class="heading">Page Styles</h2>
            <form on:submit|preventDefault={savePageStyles}>
                <div>
                    <label>
                        <div>Font</div>
                        <div>
                            <select class="w-100p" bind:value={pageStyles.font} required>
                                <option>Ubuntu</option>
                                <option>Courier Prime</option>
                                <option>Roboto Mono</option>
                                <option>Roboto Slab</option>
                                <option>Roboto</option>
                            </select>
                        </div>
                    </label>
                </div>
                <div class="mt-1em">
                    <label>
                        <div>Font Size</div>
                        <div>
                            <input type="text" pattern="[0-9]+" bind:value="{pageStyles.fontSize}" required>
                            <select bind:value="{pageStyles.fontSizeUnit}" required>
                                <option>px</option>
                                <option>em</option>
                                <option>rem</option>
                                <option>%</option>
                            </select>
                        </div>
                    </label>
                </div>
                <div class="mt-1em">
                    <button class="w-100p">Save Styles</button>
                </div>
            </form>
            <div class="mt-1em" style="text-align: center">
                <a href="#page-styles-reset-to-default" on:click|preventDefault|stopPropagation={resetPageStylesToDefault}>Reset to default</a>
            </div>
        </Modal>
    {/if}

    {#if showMovePageModal}
        <Modal on:close-modal={() => showMovePageModal = false}>
            <h2 class="heading">Move Page</h2>
            <form on:submit|preventDefault={movePage}>
                <div>
                    Selected Page:
                    <div style="font-weight: bold">{ showMovePageModalData.name }</div>
                </div>
                <div class="mt-1em">
                    <label>
                        Select Target Notebook<br>
                        <!-- svelte-ignore a11y-no-onchange -->
                        <select class="w-100p" required bind:value={showMovePageModalSelectedNotebook} on:change={() => showMovePageModalSelectedSectionId = null}>
                            <option></option>
                            {#each notebooks as notebook}
                                <option value={notebook}>{ notebook.name }</option>
                            {/each}
                        </select>
                    </label>
                </div>
                <div class="mt-1em">
                    <label>
                        Select Target Section<br>
                        <select class="w-100p" required bind:value={showMovePageModalSelectedSectionId}>
                            <option></option>
                            {#each showMovePageModalSelectedNotebook.sections.filter(item => item.id !== showMovePageModalData.section_id) as section}
                                <option value={section.id} selected={showMovePageModalSelectedSectionId === section.id}>{ section.name }</option>
                            {/each}
                        </select>
                    </label>
                </div>
                <button class="mt-1em w-100p">Move Page</button>
            </form>
        </Modal>
    {/if}
    {#if showMoveSectionModal}
        <Modal on:close-modal={() => showMoveSectionModal = false}>
            <h2 class="heading">Move Section</h2>
            <form on:submit|preventDefault={moveSection}>
                <div>
                    Selected Section:
                    <div style="font-weight: bold">{ showMoveSectionModalData.name }</div>
                </div>
                <div class="mt-1em">
                    <label>
                        Select Target Notebook<br>
                        <!-- svelte-ignore a11y-no-onchange -->
                        <select class="w-100p" required bind:value={showMoveSectionModalSelectedNotebookId}>
                            <option></option>
                            {#each notebooks.filter(item => item.id !== showMoveSectionModalData.notebook_id) as notebook}
                                <option value={notebook.id}>{ notebook.name }</option>
                            {/each}
                        </select>
                    </label>
                </div>
                <button class="mt-1em w-100p">Move Section</button>
            </form>
        </Modal>
    {/if}
    {#if showConfigureSectionSortOrderModal}
        <Modal on:close-modal={() => showConfigureSectionSortOrderModal = false}>
            <h2 class="heading">Configure Section Sort Order</h2>
            <form on:submit|preventDefault={configureSectionSortOrder}>
                <div>
                    Selected Notebook:
                    <div style="font-weight: bold">{ showConfigureSectionSortOrderModalData.name }</div>
                </div>
                <div class="mt-1em">
                    <table class="w-100p table">
                        {#each showConfigureSectionSortOrderModalData.sections as section}
                            <tr>
                                <td style="width: 1px">
                                    <input type="text" pattern= "[0-9]+" bind:value={ section.sort_order } style="width: 4em; text-align: center" required>
                                </td>
                                <td>{ section.name }</td>
                            </tr>
                        {/each}
                    </table>
                </div>
                <button class="mt-1em w-100p">Update Section Sort Order</button>
            </form>
        </Modal>
    {/if}

    {#if pageItemContextMenu.page}
        <div class="context-menu" style="left: {pageItemContextMenu.left}px; top: {pageItemContextMenu.top}px">
            {#if pageItemContextMenu.page.view_only === false}
                <div on:click={pageMakeViewOnly}>Make view only</div>
            {:else}
                <div on:click={pageEnableEdits}>Enable Edits</div>
            {/if}
            <div on:click={startMovePage}>Move page</div>
            <div on:click={deletePage}>Delete page</div>
        </div>
    {/if}
    {#if sectionItemContextMenu.section}
        <div class="context-menu" style="left: {sectionItemContextMenu.left}px; top: {sectionItemContextMenu.top}px">
            <div on:click={startMoveSection}>Move section</div>
            <div on:click={renameSection}>Rename section</div>
            <div on:click={deleteSection}>Delete section</div>
        </div>
    {/if}
    {#if notebookItemContextMenu.notebook}
        <div class="context-menu" style="left: {notebookItemContextMenu.left}px; top: {notebookItemContextMenu.top}px">
            <div on:click={startConfigureSectionSortOrder}>Configure section sort order</div>
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

:global(.journal-sidebar-item.ghost) {
    background-color: #f7f7f7 !important;
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

.journal-page-entries {
    margin-top: 0.7em;
    margin-right: 1em;
}

.journal-left-sidebar, .journal-right-sidebar, .journal-page {
    overflow-y: auto;
    height: calc(100vh - 3em);
    margin-top: 3em;
    padding-top: 1.4em;
    padding-bottom: 1.4em;
}

.journal-page {
    margin-left: 2em;
    padding-bottom: 5.4em;
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
    padding: 4px 0;
    cursor: pointer;
    box-shadow: 6px 8px 7px -11px black;
    border: 1px solid #cccccc;
}

.context-menu > div {
    padding: 4px 13px;
    border-bottom: 1px solid #cccccc;
}

.context-menu > div:last-of-type {
    border-bottom: 0;
}

.context-menu > div:hover {
    background-color: lightgrey;
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

.pos-f {
    position: fixed;
}

.oy-a {
    overflow-y: auto;
}

table.table {
    border-collapse: collapse;
}

table.table th, table.table td {
    border: 1px solid black;
}
</style>
