<script>
import { eventStore } from '../stores.js'
import { slugify } from '../helpers/string.js'

let pages = []
let pagesFilter = ''

$: filteredPages = pagesFilter !== '' ? pages.filter(page => page.name.toLowerCase().includes(pagesFilter.toLowerCase())): pages

let leftSidebarElement = null
let rightSidebarElement = null

function toggleSidebar(sidebarElement) {
    let sidebarStyle = getComputedStyle(sidebarElement)
    if(sidebarStyle.display === 'block') {
        sidebarElement.style.display = 'none'
        sidebarElement.parentElement.style.gridTemplateColumns = '1fr'
    } else {
        sidebarElement.style.display = 'block'
        sidebarElement.parentElement.style.gridTemplateColumns = '15em 1fr 20em'
    }
}

function toggleSidebars() {
    toggleSidebar(leftSidebarElement)
    toggleSidebar(rightSidebarElement)
}

let notebooks = []

import fetchPlus from '../helpers/fetchPlus.js'

let profiles = [
    {
        id: null,
        name: 'Default'
    }
]

function clearDocumentLocationHash() {
    history.replaceState(null, null, ' ')
}

function setSelectedProfileFromLocationHash() {
    if(document.location.hash) {
        let localionHashProfile = profiles.find(profile => slugify(profile.name) === document.location.hash.substring(1))
        if(localionHashProfile && selectedProfileId === localionHashProfile.id) {
            return
        }
        if(localionHashProfile) {
            selectedProfileId = localionHashProfile.id
        } else {
            // clear location hash and load notebooks when hash on load is invalid
            clearDocumentLocationHash()
            selectedProfileId = null
            if(firstLoadFetchNotebooks) {
                fetchNotebooks()
            }
        }
    }
}

function fetchProfiles() {
    fetchPlus.get(`/profiles`).then(response => {
        profiles = response
        setSelectedProfileFromLocationHash()
    })
}

fetchProfiles()

// this is triggered when the user clicks on a bookmark of a journals url with location hash in it,
// so the switch to the given profile happens - else nothing happens, only the hash in the url changes
// while the profile remains unchanged
window.onhashchange = setSelectedProfileFromLocationHash

let selectedProfileId = null

let showManageProfilesModal = false

function addProfile() {
    let profileName = prompt('Enter a name for the new profile')
    if(profileName && profileName.trim() !== '') {
        fetchPlus.post('/profiles', { profileName }).then(() => {
            fetchProfiles()
        })
    }
}

function renameProfile(profile) {
    let newProfileName = prompt('Enter the new name for the profile', profile.name)
    if(newProfileName && newProfileName.trim() !== '') {
        fetchPlus.put(`/profiles/name/${profile.id}`, {
            profileName: newProfileName
        }).then(() => {
            if(profile.id === selectedProfileId) {
                document.location.hash = slugify(newProfileName)
            }
            fetchProfiles()
        })
    }
}

function deleteProfile(profileId) {
    if(confirm('Are you sure you want to delete this profile?')) {
        fetchPlus.delete(`/profiles/delete/${profileId}`).then(() => {
            fetchProfiles()
            if(profileId === selectedProfileId) {
                selectedProfileId = null
            }
        })
    }
}

let firstLoadFetchNotebooks = true

function fetchNotebooks(profileId=null) {
    if(profileId) {
        document.location.hash = slugify(profiles.find(profile => profile.id === profileId).name)
    } else {
        if(!firstLoadFetchNotebooks) { // don't reset document.location.hash on first load
            clearDocumentLocationHash()
        } else { // if first load
            if(document.location.hash) { // if hash exists on load, exit method, to prevent double loading of notebooks route
                return
            }
        }
    }
    fetchPlus.get(`/notebooks?profile_id=${profileId}`).then(response => {
        notebooks = response
        if(!firstLoadFetchNotebooks) {
            pages = []
            activeSection = {}
            activePage = {}
        }
        firstLoadFetchNotebooks = false
    })
}

$: fetchNotebooks(selectedProfileId)

async function addNotebook() {
    let notebookName = prompt('Enter new notebook name')
    if(notebookName) {
        const response = await fetchPlus.post('/notebooks', { notebookName, profileId: selectedProfileId })

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

$: if(activeSection) {
    fetchPages()
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

async function fetchPages() {
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
            activePage = page
        }
    }
}

let showAddPageModal = false
let addPageToTop = false

function setPages(updatedPages) {
    pages = updatedPages
}

function setActivePage(updatedActivePage) {
    activePage = updatedActivePage
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

let showMoveNotebookModal = false
let showMoveNotebookModalData = null
let showMoveNotebookModalSelectedProfileId = null

function startMoveNotebook() {
    showMoveNotebookModalSelectedProfileId = ''
    showMoveNotebookModalData = JSON.parse(JSON.stringify(notebookItemContextMenu.notebook))
    showMoveNotebookModalData.profile_id = selectedProfileId
    showMoveNotebookModal = true
}

function moveNotebook() {
    fetchPlus.put(`/move-notebook/${showMoveNotebookModalData.id}`, {
        profileId: showMoveNotebookModalSelectedProfileId
    })

    notebooks = notebooks.filter(notebook => notebook.id !== showMoveNotebookModalData.id)

    if(activeSection.notebook_id === showMoveNotebookModalData.id) {
        activeSection = {}
    }

    if(activePage.notebook_id === showMoveNotebookModalData.id) {
        activePage = {}
    }

    showMoveNotebookModal = false
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

import { logoutAccount } from '../helpers/account.js'

function logout() {
    if(confirm('Are you sure you want to logout?')) {
        logoutAccount()
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

function handlePagesSidebarItemClick(e, page) {
    if(e.ctrlKey) {
        return
    }
    e.preventDefault()
    activePage = page
}

eventStore.subscribe(event => {
    if(event && event.event === 'pageMovedToSection' && event.data.sectionId === activeSection.id) {
        fetchPages()
    }
})

import { switchAccount } from '../helpers/account'
import PageNav from './PageNav.svelte'
import PageContextMenu from './PageContextMenu.svelte'
import Page from './Page.svelte'
import Modal from './Modal.svelte'
import AddPageModal from './Modals/AddPageModal.svelte'
</script>

<div style="display: grid; grid-template-rows: auto 1fr; height: 100%;">
    <nav class="journal-sidebar-hamburger" on:click={toggleSidebars}>
        <div class="pos-r">
            <div class="pos-a" style="margin-left: 1em" on:click|preventDefault|stopPropagation>
                <select style="padding: 0.2em; width: 9em" bind:value={selectedProfileId}>
                    {#each profiles as profile}
                        <option value={profile.id}>{profile.name}</option>
                    {/each}
                </select>
                <a href="#manage-profiles" on:click|preventDefault|stopPropagation={() => showManageProfilesModal = true}>Manage</a>
            </div>
            <div class="pos-a" style="margin-left: 14em">
                {#if activePage.locked === false && activePage.type !== 'PageGroup'}
                    <PageNav bind:activePage={activePage} activeSection={activeSection}></PageNav>
                {/if}
            </div>
            <span class="hide-on-small-screen">
                <a href="#add-account" on:click|preventDefault|stopPropagation={switchAccount} class="mr-1em">Switch Account</a>
                <a href="#change-password" on:click|preventDefault|stopPropagation={() => showChangePasswordModal = true} class="mr-1em">Change Password</a>
            </span>
            <a href="#logout" on:click|preventDefault|stopPropagation={logout} class="mr-1em">Logout</a>
            &#9776; Menu
        </div>
    </nav>
    <div style="display: grid; grid-template-columns: 15em 1fr 20em; overflow: auto;">
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
                                <div
                                    class="journal-sidebar-item"
                                    class:journal-sidebar-item-selected={ activeSection.id === section.id }
                                    on:click={
                                        () => {
                                            activeSection = section
                                            pagesFilter = '' // reset pages filter on section change
                                        }
                                    }
                                    on:keyup={
                                        e => {
                                            if(e.key === 'Enter') {
                                                activeSection = section
                                                pagesFilter = '' // reset pages filter on section change
                                            }
                                        }
                                    }
                                    tabindex="0"
                                    on:contextmenu|preventDefault={(e) => handleSectionItemContextMenu(e, section, notebook)}
                                >{ section.name }</div>
                            {/each}
                            <div class="journal-sidebar-item" on:click={() => addSectionToNotebook(notebook)}>Add Section +</div>
                        </div>
                    {/if}
                </div>
            {/each}
            <div class="journal-sidebar-item" on:click={addNotebook}>Add Notebook +</div>
        </nav>
        {#key activePage.id}
            <Page
                {notebooks}
                activePage={activePage}
                updatePageName={updatePageName}
                className="journal-page-container"
            ></Page>
        {/key}
        <nav class="journal-right-sidebar" bind:this={rightSidebarElement} style="display: block" use:makeDraggableContainer={'page-sidebar-item'}>
            {#if activeSection.id !== undefined && activeSection.id !== null}
                <div class="w-100p" style="height: 1.6em">
                    <input type="search" placeholder="Filter..." class="pos-f" style="top: 50px; width: 20.9em; margin-left: 1px;" bind:value="{pagesFilter}">
                </div>
                {#if filteredPages.length > 0}
                    <div class="journal-sidebar-item" on:click={() => {
                        addPageToTop = true
                        showAddPageModal = true
                    }}>Add Page +</div>
                {/if}
                {#each filteredPages as page (page.id)}
                    <a
                        href="{`/page/${page.id}`}"
                        class="journal-sidebar-item page-sidebar-item"
                        class:journal-sidebar-item-selected={ activePage.id === page.id }
                        on:click={event => handlePagesSidebarItemClick(event, page)}
                        on:keyup={e => e.key === 'Enter' && (activePage = page)}
                        tabindex="0"
                        on:contextmenu|preventDefault={(e) => handlePageItemContextMenu(e, page)}
                        data-page-id={page.id}
                        use:makeDraggableItem
                    >{ page.name }</a>
                {/each}
                <div class="journal-sidebar-item" on:click={() => {
                    addPageToTop = false
                    showAddPageModal = true
                }}>Add Page +</div>
            {/if}
        </nav>
    </div>
    {#if showAddPageModal}
        <AddPageModal
            sectionId="{activeSection.id}"
            notebookId="{activeSection.notebook_id}"
            pages="{pages}"
            setPages={setPages}
            setActivePage={setActivePage}
            activePage={activePage}
            addPageToTop={addPageToTop}
            onClose={() => showAddPageModal = false}
        />
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
    {#if showMoveNotebookModal}
        <Modal on:close-modal={() => showMoveNotebookModal = false}>
            <h2 class="heading">Move Notebook</h2>
            <form on:submit|preventDefault={moveNotebook}>
                <div>
                    Selected Notebook:
                    <div style="font-weight: bold">{ showMoveNotebookModalData.name }</div>
                </div>
                <div class="mt-1em">
                    <label>
                        Select Target Profile<br>
                        <!-- svelte-ignore a11y-no-onchange -->
                        <select class="w-100p" required bind:value={showMoveNotebookModalSelectedProfileId}>
                            <option></option>
                            {#each profiles.filter(item => item.id !== showMoveNotebookModalData.profile_id) as profile}
                                <option value={profile.id}>{ profile.name }</option>
                            {/each}
                        </select>
                    </label>
                </div>
                <button class="mt-1em w-100p">Move Notebook</button>
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
    {#if showManageProfilesModal}
        <Modal on:close-modal={() => showManageProfilesModal = false}>
            <h2 class="heading">Manage Profiles</h2>
            <div>
                <table class="w-100p table">
                    <thead>
                        <th>Profile</th>
                        <th colspan="2">Actions</th>
                    </thead>
                    <tbody>
                        {#each profiles as profile}
                            <tr>
                                <td>{ profile.name }</td>
                                {#if profile.id !== null}
                                    <td><button on:click={() => renameProfile(profile)}>Rename</button></td>
                                    <td><button on:click={() => deleteProfile(profile.id)}>Delete</button></td>
                                {:else}
                                    <td colspan="2"></td>
                                {/if}
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            <div class="mt-1em">
                <button on:click={addProfile}>Add Profile +</button>
            </div>
        </Modal>
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
            <div on:click={startMoveNotebook}>Move notebook</div>
            <div on:click={startConfigureSectionSortOrder}>Configure section sort order</div>
            <div on:click={renameNotebook}>Rename notebook</div>
            <div on:click={deleteNotebook}>Delete notebook</div>
        </div>
    {/if}

    {#if pageItemContextMenu.page || (activePage.id !== undefined && activePage.id !== null)}
        <PageContextMenu
            bind:pageItemContextMenu={pageItemContextMenu}
            {fetchPages}
            bind:pages={pages}
            bind:activePage={activePage}
            {notebooks}
        ></PageContextMenu>
    {/if}
</div>

<style>
.journal-sidebar-hamburger {
    cursor: pointer;
    font-size: 1.2em;
    padding-top: 0.5em;
    padding-right: 1em;
    padding-bottom: 0.6em;
    border-bottom: 1px solid lightgrey;
    text-align: right;
    background-color: white;
}

.journal-left-sidebar {
    display: none;
    background-color: wheat;
}

.journal-right-sidebar {
    display: none;
    background-color: wheat;
}

.journal-sidebar-hamburger {
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

.journal-left-sidebar, .journal-right-sidebar, :global(.journal-page-container) {
    overflow-y: auto;
    padding-top: 1.4em;
    padding-bottom: 1.4em;
}

:global(.journal-page-container) {
    padding-bottom: 0;
}

:global(.journal-left-sidebar[style*="block"] + .journal-page:not(.PageType-RichText)) {
    margin-left: 2em;
}

:global(.journal-left-sidebar[style*="none"] + .journal-page:not(.PageType-RichText)) {
    padding-left: 2rem;
}

.mt-0_5em {
    margin-top: 0.5em;
}

.d-b {
    display: block;
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

table.table {
    border-collapse: collapse;
}

table.table th, table.table td {
    border: 1px solid black;
}

a.page-sidebar-item {
    display: block;
    color: inherit;
    text-decoration: none;
}
</style>
