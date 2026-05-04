<script>
import { onMount, onDestroy } from 'svelte'
import { eventStore, role } from '../stores.js'
import { slugify } from '../helpers/string.js'
import { focus } from '../actions/focus.js'
import { isTouchPrimary, isMobileViewport, mobileViewportMql } from '../actions/touchGuard.js'
import { clickOutside } from '../actions/clickOutside.js'
import { getTheme, setTheme as persistTheme, initTheme } from '../helpers/theme.js'

let pages = []
let pagesFilter = ''

$: filteredPages =
    pagesFilter !== ''
        ? pages.filter((page) =>
              page.name.toLowerCase().includes(pagesFilter.toLowerCase()),
          )
        : pages

let leftOpen = true
let rightOpen = true

// Mobile: drawers are exclusive overlays (opening one closes the other);
// hamburger toggles only the left drawer. Desktop: both sidebars toggle
// together via hamburger, individual drawers can be toggled independently.

function toggleLeftDrawer() {
    if (isMobileViewport() && !leftOpen) rightOpen = false
    leftOpen = !leftOpen
}

function toggleRightDrawer() {
    if (isMobileViewport() && !rightOpen) leftOpen = false
    rightOpen = !rightOpen
}

function toggleSidebars() {
    if (isMobileViewport()) {
        toggleLeftDrawer()
    } else {
        const newOpen = !(leftOpen && rightOpen)
        leftOpen = newOpen
        rightOpen = newOpen
    }
}

function closeDrawers() {
    leftOpen = false
    rightOpen = false
}

function clampMenuPos(e) {
    const MENU_W = 220
    const MENU_H = 200
    return {
        left: Math.min(e.pageX, window.innerWidth - MENU_W - 8),
        top: Math.min(e.pageY, window.innerHeight - MENU_H - 8),
    }
}

let mobileMql = null

function handleMqlChange(e) {
    const desired = !e.matches
    if (leftOpen !== desired) leftOpen = desired
    if (rightOpen !== desired) rightOpen = desired
}

onMount(() => {
    mobileMql = mobileViewportMql()
    if (mobileMql) {
        if (mobileMql.matches) {
            leftOpen = false
            rightOpen = false
        }
        mobileMql.addEventListener('change', handleMqlChange)
    }
})

onDestroy(() => {
    if (mobileMql) mobileMql.removeEventListener('change', handleMqlChange)
})

let notebooks = []

import fetchPlus from '../helpers/fetchPlus.js'

let profiles = [
    {
        id: null,
        name: 'Default',
    },
]

function clearDocumentLocationHash() {
    history.replaceState(null, null, ' ')
}

function setSelectedProfileFromLocationHash() {
    if (document.location.hash === '#admin' && $role === 'admin') return
    if (document.location.hash) {
        let localionHashProfile = profiles.find(
            (profile) =>
                slugify(profile.name) === document.location.hash.substring(1),
        )
        if (
            localionHashProfile &&
            selectedProfileId === localionHashProfile.id
        ) {
            return
        }
        if (localionHashProfile) {
            selectedProfileId = localionHashProfile.id
        } else {
            // clear location hash and load notebooks when hash on load is invalid
            clearDocumentLocationHash()
            selectedProfileId = null
            if (firstLoadFetchNotebooks) {
                fetchNotebooks()
            }
        }
    }
}

function fetchProfiles() {
    fetchPlus.get(`/profiles`).then((response) => {
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
    if (profileName && profileName.trim() !== '') {
        fetchPlus.post('/profiles', { profileName }).then(() => {
            fetchProfiles()
        })
    }
}

function renameProfile(profile) {
    let newProfileName = prompt(
        'Enter the new name for the profile',
        profile.name,
    )
    if (newProfileName && newProfileName.trim() !== '') {
        fetchPlus
            .put(`/profiles/name/${profile.id}`, {
                profileName: newProfileName,
            })
            .then(() => {
                if (profile.id === selectedProfileId) {
                    document.location.hash = slugify(newProfileName)
                }
                fetchProfiles()
            })
    }
}

function deleteProfile(profileId) {
    if (confirm('Are you sure you want to delete this profile?')) {
        fetchPlus.delete(`/profiles/delete/${profileId}`).then(() => {
            fetchProfiles()
            if (profileId === selectedProfileId) {
                selectedProfileId = null
            }
        })
    }
}

let firstLoadFetchNotebooks = true

function fetchNotebooks(profileId = null) {
    if (profileId) {
        document.location.hash = slugify(
            profiles.find((profile) => profile.id === profileId).name,
        )
    } else {
        if (!firstLoadFetchNotebooks) {
            // don't reset document.location.hash on first load
            clearDocumentLocationHash()
        } else {
            // if first load
            if (document.location.hash) {
                // if hash exists on load, exit method, to prevent double loading of notebooks route
                return
            }
        }
    }
    fetchPlus.get(`/notebooks?profile_id=${profileId}`).then((response) => {
        notebooks = response
        if (!firstLoadFetchNotebooks) {
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
    if (notebookName) {
        const response = await fetchPlus.post('/notebooks', {
            notebookName,
            profileId: selectedProfileId,
        })

        notebooks.push({
            id: response.insertedRowId,
            name: notebookName,
            expanded: true,
            sections: [],
        })

        notebooks = notebooks
    }
}

async function addSectionToNotebook(notebook) {
    let sectionName = prompt('Enter new section name')
    if (sectionName) {
        const response = await fetchPlus.post('/sections', {
            notebookId: notebook.id,
            sectionName,
        })

        let newSection = {
            id: response.insertedRowId,
            name: sectionName,
            notebook_id: notebook.id,
        }

        notebook.sections.push(newSection)
        notebooks = notebooks

        activeSection = newSection
    }
}

let savedActiveSection = localStorage.getItem('activeSection')
let activeSection = savedActiveSection ? JSON.parse(savedActiveSection) : {}

$: if (activeSection) {
    fetchPages()
    localStorage.setItem('activeSection', JSON.stringify(activeSection))
}

let activePage = {}
let firstLoad = true
let showBacklinks = false
function closeBacklinks() { showBacklinks = false }

$: if (activePage && activePage.id) {
    localStorage.setItem('activePage', JSON.stringify(activePage))
    closeBacklinks()
    firstLoad = false
} else {
    if (!firstLoad) {
        localStorage.removeItem('activePage')
    }
    closeBacklinks()
    firstLoad = false
}

async function fetchPages() {
    if (!activeSection.id) {
        return
    }

    pages = []

    pages = await fetchPlus.get(`/pages/${activeSection.id}`)

    let savedActivePage = localStorage.getItem('activePage')
    savedActivePage = savedActivePage ? JSON.parse(savedActivePage) : {}

    if (savedActivePage) {
        let page = pages.find((page) => page.id === savedActivePage.id)
        if (page === undefined) {
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
    page: null,
}
let pageContextMenuHasOpenModal = false

function handlePageItemContextMenu(e, page) {
    const { left, top } = clampMenuPos(e)
    pageItemContextMenu.left = left
    pageItemContextMenu.top = top
    pageItemContextMenu.page = page
}

let sectionItemContextMenu = {
    left: 0,
    top: 0,
    section: null,
    notebook: null,
}

function handleSectionItemContextMenu(e, section, notebook) {
    const { left, top } = clampMenuPos(e)
    sectionItemContextMenu.left = left
    sectionItemContextMenu.top = top
    sectionItemContextMenu.section = section
    sectionItemContextMenu.notebook = notebook
}

let showMoveSectionModal = false
let showMoveSectionModalData = null
let showMoveSectionModalSelectedNotebookId = null

function startMoveSection() {
    showMoveSectionModalSelectedNotebookId = null
    showMoveSectionModalData = JSON.parse(
        JSON.stringify(sectionItemContextMenu.section),
    )
    showMoveSectionModal = true
}

function moveSection() {
    fetchPlus.put(`/move-section/${showMoveSectionModalData.id}`, {
        notebookId: showMoveSectionModalSelectedNotebookId,
    })

    let sourceNotebook = notebooks.find(
        (notebook) => notebook.id === showMoveSectionModalData.notebook_id,
    )
    sourceNotebook.sections = sourceNotebook.sections.filter(
        (section) => section.id !== showMoveSectionModalData.id,
    )

    let targetNotebook = notebooks.find(
        (notebook) => notebook.id === showMoveSectionModalSelectedNotebookId,
    )
    let sectionToInsert = JSON.parse(JSON.stringify(showMoveSectionModalData))
    sectionToInsert.notebook_id = showMoveSectionModalSelectedNotebookId
    targetNotebook.sections.push(sectionToInsert)

    notebooks = notebooks

    if (activeSection.id === showMoveSectionModalData.id) {
        activeSection = {}
    }

    if (activePage.section_id === showMoveSectionModalData.id) {
        activePage = {}
    }

    showMoveSectionModal = false
}

function renameSection() {
    let newSectionName = prompt(
        'Enter new section name',
        sectionItemContextMenu.section.name,
    )
    if (newSectionName) {
        fetchPlus.put(`/sections/name/${sectionItemContextMenu.section.id}`, {
            sectionName: newSectionName,
        })
        sectionItemContextMenu.section.name = newSectionName
        notebooks = notebooks
    }
    sectionItemContextMenu.section = null
    sectionItemContextMenu.notebook = null
}

function deleteSection() {
    if (confirm('Move this section to the recycle bin?')) {
        fetchPlus.delete(`/sections/${sectionItemContextMenu.section.id}`)
        sectionItemContextMenu.notebook.sections =
            sectionItemContextMenu.notebook.sections.filter(
                (section) => section.id !== sectionItemContextMenu.section.id,
            )
        notebooks = notebooks

        if (activeSection.id === sectionItemContextMenu.section.id) {
            activeSection = {}
        }

        // set activePage to {} if it belongs to the deleted section
        if (activePage.section_id === sectionItemContextMenu.section.id) {
            activePage = {}
        }
    }

    sectionItemContextMenu.section = null
    sectionItemContextMenu.notebook = null
}

let notebookItemContextMenu = {
    left: 0,
    top: 0,
    notebook: null,
}

function handleNotebookItemContextMenu(e, notebook) {
    const { left, top } = clampMenuPos(e)
    notebookItemContextMenu.left = left
    notebookItemContextMenu.top = top
    notebookItemContextMenu.notebook = notebook
}

let showMoveNotebookModal = false
let showMoveNotebookModalData = null
let showMoveNotebookModalSelectedProfileId = null

function startMoveNotebook() {
    showMoveNotebookModalSelectedProfileId = ''
    showMoveNotebookModalData = JSON.parse(
        JSON.stringify(notebookItemContextMenu.notebook),
    )
    showMoveNotebookModalData.profile_id = selectedProfileId
    showMoveNotebookModal = true
}

function moveNotebook() {
    fetchPlus.put(`/move-notebook/${showMoveNotebookModalData.id}`, {
        profileId: showMoveNotebookModalSelectedProfileId,
    })

    notebooks = notebooks.filter(
        (notebook) => notebook.id !== showMoveNotebookModalData.id,
    )

    if (activeSection.notebook_id === showMoveNotebookModalData.id) {
        activeSection = {}
    }

    if (activePage.notebook_id === showMoveNotebookModalData.id) {
        activePage = {}
    }

    showMoveNotebookModal = false
}

let showConfigureSectionSortOrderModal = false
let showConfigureSectionSortOrderModalData = null

function startConfigureSectionSortOrder() {
    showConfigureSectionSortOrderModalData = JSON.parse(
        JSON.stringify(notebookItemContextMenu.notebook),
    )
    showConfigureSectionSortOrderModal = true
}

function configureSectionSortOrder() {
    fetchPlus.post(
        '/sections/sort-order/update',
        showConfigureSectionSortOrderModalData.sections.map((item) => ({
            sectionId: item.id,
            sortOrder: Number(item.sort_order),
        })),
    )

    let targetNotebook = notebooks.find(
        (notebook) => notebook.id === showConfigureSectionSortOrderModalData.id,
    )
    targetNotebook.sections = showConfigureSectionSortOrderModalData.sections
    targetNotebook.sections = targetNotebook.sections.sort(
        (a, b) => a.sort_order - b.sort_order,
    )
    notebooks = notebooks

    showConfigureSectionSortOrderModal = false
}

function renameNotebook() {
    let newNotebookName = prompt(
        'Enter new notebook name',
        notebookItemContextMenu.notebook.name,
    )
    if (newNotebookName) {
        fetchPlus.put(
            `/notebooks/name/${notebookItemContextMenu.notebook.id}`,
            {
                notebookName: newNotebookName,
            },
        )
        notebookItemContextMenu.notebook.name = newNotebookName
        notebooks = notebooks
    }
    notebookItemContextMenu.notebook = null
}

function deleteNotebook() {
    if (confirm('Move this notebook to the recycle bin?')) {
        fetchPlus.delete(`/notebooks/${notebookItemContextMenu.notebook.id}`)
        notebooks = notebooks.filter(
            (notebook) => notebook.id !== notebookItemContextMenu.notebook.id,
        )

        // set activeSection to {} if it belongs to the deleted notebook
        if (activeSection.notebook_id === notebookItemContextMenu.notebook.id) {
            activeSection = {}
        }
        // set activePage to {} if it belongs to the deleted notebook
        if (activePage.notebook_id === notebookItemContextMenu.notebook.id) {
            activePage = {}
        }
    }

    notebookItemContextMenu.notebook = null
}


import debounce from '../helpers/debounce.js'

const updatePageName = debounce(function (e) {
    fetchPlus.put(`/pages/name/${activePage.id}`, {
        pageName: e.target.innerText,
    })
    let page = pages.find((page) => page.id === activePage.id)
    page.name = e.target.innerText
    localStorage.setItem('activePage', JSON.stringify(page))
    pages = pages
}, 500)

import { logoutAccount } from '../helpers/account.js'

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        logoutAccount()
    }
}

function toggleNotebookExpanded(notebook) {
    notebook.expanded = !notebook.expanded
    notebooks = notebooks
    fetchPlus.put(`/notebooks/expanded/${notebook.id}`, {
        notebookExpanded: notebook.expanded ? 1 : 0,
    })
}

let showChangePasswordModal = false

let changePasswordObj = {
    currentPassword: '',
    newPassword: '',
    error: '',
}

function changePassword() {
    fetchPlus
        .post('/change-password', {
            currentPassword: changePasswordObj.currentPassword,
            newPassword: changePasswordObj.newPassword,
        })
        .then((response) => {
            if (response.hasOwnProperty('error')) {
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
    if (isTouchPrimary()) return

    function dragover(e) {
        if (pagesFilter !== '') {
            // disable drag sort order functionality when pages are filtered
            return
        }

        e.preventDefault()
        if (e.target.classList.contains(sidebarItemClass)) {
            if (e.target === activeElement.previousElementSibling) {
                // if item is before drag element
                e.target.insertAdjacentElement('beforebegin', activeElement)
            } else {
                // if item is after drag element
                e.target.insertAdjacentElement('afterend', activeElement)
            }
        }
        activeElement.classList.add('ghost')
    }

    function updateSortOrder() {
        if (pagesFilter !== '') {
            // disable drag sort order functionality when pages are filtered
            return
        }

        let pageIdsInOrder = Array.from(
            activeElement.parentElement.querySelectorAll('[draggable="true"'),
        ).map((item) => item.dataset.pageId)
        let pageIdsWithSortOrder = pageIdsInOrder.map((pageId, index) => {
            return {
                pageId,
                sortOrder: index + 1,
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
        if (activeElement) {
            updateSortOrder()
        }
    }

    element.addEventListener('dragover', dragover)
    element.addEventListener('drop', drop)
    element.addEventListener('dragend', dragend)
}

function makeDraggableItem(element) {
    if (isTouchPrimary()) return

    element.draggable = true

    function dragstart(e) {
        if (pagesFilter !== '') {
            // disable drag sort order functionality when pages are filtered
            return
        }

        activeElement = e.target

        // hide drag image by setting it to transparent image - https://stackoverflow.com/a/49535378/4932305
        var img = new Image()
        img.src =
            'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs='
        event.dataTransfer.setDragImage(img, 0, 0)
    }

    element.addEventListener('dragstart', (e) => dragstart(e))
}

function handlePagesSidebarItemClick(e, page) {
    if (e.ctrlKey) {
        return
    }
    e.preventDefault()
    activePage = page
}

eventStore.subscribe((event) => {
    if (
        event &&
        event.event === 'pageMovedToSection' &&
        event.data.sectionId === activeSection.id
    ) {
        fetchPages()
    }
})

import { switchAccount } from '../helpers/account'
import PageNav from './PageNav.svelte'
import PageContextMenu from './PageContextMenu.svelte'
import Page from './Page.svelte'
import Modal from './Modal.svelte'
import AddPageModal from './Modals/AddPageModal.svelte'
import BacklinksPanel from './BacklinksPanel.svelte'
import RecycleBin from './RecycleBin.svelte'

let showRecycleBin = false

let theme = getTheme()
initTheme()

function setTheme(value) {
    theme = value
    persistTheme(value)
}

function openRecycleBin() {
    showRecycleBin = true
    activePage = {}
}

const accountDrawerActions = [
    { href: '#add-account', text: 'Switch Account', onClick: switchAccount },
    { href: '#change-password', text: 'Change Password', onClick: () => (showChangePasswordModal = true) },
    { href: '#logout', text: 'Logout', onClick: logout },
]

function handleRecycleBinRestored() {
    fetchPlus.get(`/notebooks?profile_id=${selectedProfileId}`).then((response) => {
        notebooks = response
    })
}
</script>

<div style="display: grid; grid-template-rows: auto 1fr; height: 100%;">
    <nav class="journal-sidebar-hamburger" on:click={toggleSidebars}>
        <span class="tb-brand">Journals</span>
        <span class="tb-sep-v"></span>
        <div class="tb-profile" on:click|preventDefault|stopPropagation>
            <select bind:value={selectedProfileId} style="width: 9em">
                {#each profiles as profile}
                    <option value={profile.id}>{profile.name}</option>
                {/each}
            </select>
            <a
                href="#manage-profiles"
                on:click|preventDefault|stopPropagation={() =>
                    (showManageProfilesModal = true)}>Manage</a
            >
        </div>
        <span class="tb-sep-v"></span>
        <div class="tb-page-actions">
            {#if activePage.locked === false && activePage.type !== 'PageGroup'}
                <PageNav bind:activePage {activeSection} bind:showBacklinks></PageNav>
            {/if}
        </div>
        <button
            class="mobile-page-title"
            type="button"
            on:click|stopPropagation={toggleRightDrawer}
            aria-label="Open pages"
        >
            <span class="title-text">{activePage?.name || activeSection?.name || ''}</span>
            <span class="chevron">▾</span>
        </button>
        <span class="hide-on-small-screen">
            {#if $role === 'admin'}
                <a href="#admin" class="mr-1em">Admin Panel</a>
            {/if}
            <a
                href="#add-account"
                on:click|preventDefault|stopPropagation={switchAccount}
                class="mr-1em">Switch Account</a
            >
            <a
                href="#change-password"
                on:click|preventDefault|stopPropagation={() =>
                    (showChangePasswordModal = true)}
                class="mr-1em">Change Password</a
            >
        </span>
        <a
            href="#logout"
            on:click|preventDefault|stopPropagation={logout}
            class="mr-1em">Logout</a
        >
        <span class="tb-sep-v"></span>
        <span class="tb-theme-label">Theme:</span>
        <select
            value={theme}
            on:change={(e) => setTheme(e.target.value)}
            on:click|stopPropagation
        >
            <option value="golden">Golden</option>
            <option value="slate">Slate</option>
            <option value="forest">Forest</option>
            <option value="midnight">Midnight</option>
            <option value="rose">Rose</option>
        </select>
        <span class="tb-sep-v"></span>
        <button class="tb-hamburger" on:click|stopPropagation={toggleSidebars}>☰</button>
    </nav>
    <div
        class="grid-wrapper"
        class:left-open={leftOpen}
        class:right-open={rightOpen}
        class:any-drawer-open={leftOpen || rightOpen}
    >
        <nav
            class="journal-left-sidebar"
            class:open={leftOpen}
        >
            {#each notebooks as notebook}
                <div class="journal-sidebar-item-notebook">
                    <div
                        class="journal-sidebar-item journal-sidebar-item-notebook-name"
                        class:journal-sidebar-item-notebook-expanded={!notebook.expanded}
                        class:journal-sidebar-item-notebook-active={notebook.sections.some(s => s.id === activeSection.id)}
                        on:click={(e) => toggleNotebookExpanded(notebook)}
                        on:contextmenu|preventDefault={(e) =>
                            handleNotebookItemContextMenu(e, notebook)}
                    >
                        {notebook.name}
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
                                    class:journal-sidebar-item-selected={activeSection.id ===
                                        section.id}
                                    on:click={() => {
                                        activeSection = section
                                        pagesFilter = '' // reset pages filter on section change
                                        showRecycleBin = false
                                    }}
                                    on:keyup={(e) => {
                                        if (e.key === 'Enter') {
                                            activeSection = section
                                            pagesFilter = '' // reset pages filter on section change
                                            showRecycleBin = false
                                        }
                                    }}
                                    tabindex="0"
                                    on:contextmenu|preventDefault={(e) =>
                                        handleSectionItemContextMenu(
                                            e,
                                            section,
                                            notebook,
                                        )}
                                >
                                    {section.name}
                                </div>
                            {/each}
                            <div
                                class="journal-sidebar-item journal-sidebar-action"
                                on:click={() => addSectionToNotebook(notebook)}
                            >
                                Add Section +
                            </div>
                        </div>
                    {/if}
                </div>
            {/each}
            <div class="journal-sidebar-item journal-sidebar-action" on:click={addNotebook}>
                Add Notebook +
            </div>
            <div
                class="journal-sidebar-item journal-sidebar-action"
                class:journal-sidebar-item-selected={showRecycleBin}
                on:click={openRecycleBin}
            >
                Recycle Bin
            </div>
            <div class="drawer-mobile-only">
                <div class="drawer-section">
                    <div class="drawer-section-label">Profile</div>
                    <div class="drawer-section-body">
                        <select bind:value={selectedProfileId} class="input w-100p">
                            {#each profiles as profile}
                                <option value={profile.id}>{profile.name}</option>
                            {/each}
                        </select>
                        <a
                            href="#manage-profiles"
                            class="drawer-link"
                            on:click|preventDefault|stopPropagation={() => (showManageProfilesModal = true)}
                        >Manage Profiles</a>
                    </div>
                </div>

                <div class="drawer-section">
                    <div class="drawer-section-label">Account</div>
                    <div class="drawer-section-body">
                        {#if $role === 'admin'}
                            <a href="#admin" class="drawer-link">Admin Panel</a>
                        {/if}
                        {#each accountDrawerActions as { href, text, onClick }}
                            <a
                                {href}
                                class="drawer-link"
                                on:click|preventDefault|stopPropagation={onClick}
                            >{text}</a>
                        {/each}
                    </div>
                </div>

                <div class="drawer-section">
                    <div class="drawer-section-label">Theme</div>
                    <div class="drawer-section-body">
                        <select
                            value={theme}
                            on:change={(e) => setTheme(e.target.value)}
                            class="input w-100p"
                        >
                            <option value="golden">Golden</option>
                            <option value="slate">Slate</option>
                            <option value="forest">Forest</option>
                            <option value="midnight">Midnight</option>
                            <option value="rose">Rose</option>
                        </select>
                    </div>
                </div>
            </div>
        </nav>
        {#if showRecycleBin}
            <RecycleBin on:restored={handleRecycleBinRestored} />
        {:else}
            {#key activePage.id}
                <Page
                    {notebooks}
                    {activePage}
                    {updatePageName}
                    className="journal-page-container"
                ></Page>
            {/key}
        {/if}
        <nav
            class="journal-right-sidebar"
            class:open={rightOpen}
            use:makeDraggableContainer={'page-sidebar-item'}
        >
            {#if activeSection.id !== undefined && activeSection.id !== null}
                <div class="sidebar-filter-placeholder">
                    <input
                        type="search"
                        placeholder="Filter..."
                        class="sidebar-filter"
                        bind:value={pagesFilter}
                    />
                </div>
                {#if filteredPages.length > 0}
                    <div
                        class="journal-sidebar-item journal-sidebar-action"
                        on:click={() => {
                            addPageToTop = true
                            showAddPageModal = true
                        }}
                    >
                        Add Page +
                    </div>
                {/if}
                {#each filteredPages as page (page.id)}
                    <a
                        href={`/page/${page.id}`}
                        class="journal-sidebar-item page-sidebar-item"
                        class:journal-sidebar-item-selected={activePage.id ===
                            page.id}
                        on:click={(event) =>
                            handlePagesSidebarItemClick(event, page)}
                        on:keyup={(e) =>
                            e.key === 'Enter' && (activePage = page)}
                        tabindex="0"
                        on:contextmenu|preventDefault={(e) =>
                            handlePageItemContextMenu(e, page)}
                        data-page-id={page.id}
                        use:makeDraggableItem>{page.name}</a
                    >
                {/each}
                <div
                    class="journal-sidebar-item journal-sidebar-action"
                    on:click={() => {
                        addPageToTop = false
                        showAddPageModal = true
                    }}
                >
                    Add Page +
                </div>
            {/if}
        </nav>
        {#if leftOpen || rightOpen}
            <div class="drawer-scrim" on:click={closeDrawers}></div>
        {/if}
    </div>
    {#if showBacklinks}
        <BacklinksPanel
            pageId={activePage.id}
            on:close={closeBacklinks}
        ></BacklinksPanel>
    {/if}
    {#if showAddPageModal}
        <AddPageModal
            sectionId={activeSection.id}
            notebookId={activeSection.notebook_id}
            {pages}
            {setPages}
            {setActivePage}
            {activePage}
            {addPageToTop}
            onClose={() => (showAddPageModal = false)}
        />
    {/if}
    {#if showChangePasswordModal}
        <Modal on:close-modal={() => (showChangePasswordModal = false)}>
            <form on:submit|preventDefault={changePassword}>
                <h2 class="heading">Change Password</h2>
                <label
                    >Current Password<br />
                    <input
                        class="input w-100p"
                        type="password"
                        bind:value={changePasswordObj.currentPassword}
                        required
                        use:focus
                    />
                </label>
                <label class="d-b mt-0_5em"
                    >New Password<br />
                    <input
                        class="input w-100p"
                        type="password"
                        bind:value={changePasswordObj.newPassword}
                        required
                    />
                </label>
                <button class="btn-sm w-100p mt-1em">Update Password</button>
            </form>
            <div class="mt-1em red">
                {#if changePasswordObj.error}
                    Error: {changePasswordObj.error}
                {/if}
            </div>
        </Modal>
    {/if}

    {#if showMoveSectionModal}
        <Modal on:close-modal={() => (showMoveSectionModal = false)}>
            <h2 class="heading">Move Section</h2>
            <form on:submit|preventDefault={moveSection}>
                <div>
                    Selected Section:
                    <div style="font-weight: bold">
                        {showMoveSectionModalData.name}
                    </div>
                </div>
                <div class="mt-1em">
                    <label>
                        Select Target Notebook<br />
                        <!-- svelte-ignore a11y-no-onchange -->
                        <select
                            class="input w-100p"
                            required
                            bind:value={showMoveSectionModalSelectedNotebookId}
                        >
                            <option></option>
                            {#each notebooks.filter((item) => item.id !== showMoveSectionModalData.notebook_id) as notebook}
                                <option value={notebook.id}
                                    >{notebook.name}</option
                                >
                            {/each}
                        </select>
                    </label>
                </div>
                <button class="btn-sm mt-1em w-100p">Move Section</button>
            </form>
        </Modal>
    {/if}
    {#if showMoveNotebookModal}
        <Modal on:close-modal={() => (showMoveNotebookModal = false)}>
            <h2 class="heading">Move Notebook</h2>
            <form on:submit|preventDefault={moveNotebook}>
                <div>
                    Selected Notebook:
                    <div style="font-weight: bold">
                        {showMoveNotebookModalData.name}
                    </div>
                </div>
                <div class="mt-1em">
                    <label>
                        Select Target Profile<br />
                        <!-- svelte-ignore a11y-no-onchange -->
                        <select
                            class="input w-100p"
                            required
                            bind:value={showMoveNotebookModalSelectedProfileId}
                        >
                            <option></option>
                            {#each profiles.filter((item) => item.id !== showMoveNotebookModalData.profile_id) as profile}
                                <option value={profile.id}
                                    >{profile.name}</option
                                >
                            {/each}
                        </select>
                    </label>
                </div>
                <button class="btn-sm mt-1em w-100p">Move Notebook</button>
            </form>
        </Modal>
    {/if}
    {#if showConfigureSectionSortOrderModal}
        <Modal
            on:close-modal={() => (showConfigureSectionSortOrderModal = false)}
        >
            <h2 class="heading">Configure Section Sort Order</h2>
            <form on:submit|preventDefault={configureSectionSortOrder}>
                <div>
                    Selected Notebook:
                    <div style="font-weight: bold">
                        {showConfigureSectionSortOrderModalData.name}
                    </div>
                </div>
                <div class="mt-1em">
                    <table class="w-100p table">
                        {#each showConfigureSectionSortOrderModalData.sections as section}
                            <tr>
                                <td style="width: 1px">
                                    <input
                                        class="input"
                                        type="text"
                                        pattern="[0-9]+"
                                        bind:value={section.sort_order}
                                        style="width: 4em; text-align: center"
                                        required
                                    />
                                </td>
                                <td>{section.name}</td>
                            </tr>
                        {/each}
                    </table>
                </div>
                <button class="btn-sm mt-1em w-100p">Update Section Sort Order</button>
            </form>
        </Modal>
    {/if}
    {#if showManageProfilesModal}
        <Modal on:close-modal={() => (showManageProfilesModal = false)}>
            <h2 class="heading">Manage Profiles</h2>
            <div>
                <table class="w-100p table">
                    <thead>
                        <tr>
                            <th>Profile</th>
                            <th colspan="2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each profiles as profile}
                            <tr>
                                <td>{profile.name}</td>
                                {#if profile.id !== null}
                                    <td
                                        ><button
                                            class="btn-sm"
                                            on:click={() =>
                                                renameProfile(profile)}
                                            >Rename</button
                                        ></td
                                    >
                                    <td
                                        ><button
                                            class="btn-sm"
                                            on:click={() =>
                                                deleteProfile(profile.id)}
                                            >Delete</button
                                        ></td
                                    >
                                {:else}
                                    <td colspan="2"></td>
                                {/if}
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            <div class="mt-1em">
                <button class="btn-sm" on:click={addProfile}>Add Profile +</button>
            </div>
        </Modal>
    {/if}

    {#if sectionItemContextMenu.section}
        <div
            class="context-menu"
            style="left: {sectionItemContextMenu.left}px; top: {sectionItemContextMenu.top}px"
            use:clickOutside={() => {
                sectionItemContextMenu.section = null
                sectionItemContextMenu.notebook = null
            }}
        >
            <div on:click={startMoveSection}>Move section</div>
            <div on:click={renameSection}>Rename section</div>
            <div on:click={deleteSection}>Delete section</div>
        </div>
    {/if}
    {#if notebookItemContextMenu.notebook}
        <div
            class="context-menu"
            style="left: {notebookItemContextMenu.left}px; top: {notebookItemContextMenu.top}px"
            use:clickOutside={() => (notebookItemContextMenu.notebook = null)}
        >
            <div on:click={startMoveNotebook}>Move notebook</div>
            <div on:click={startConfigureSectionSortOrder}>
                Configure section sort order
            </div>
            <div on:click={renameNotebook}>Rename notebook</div>
            <div on:click={deleteNotebook}>Delete notebook</div>
        </div>
    {/if}

    {#if pageItemContextMenu.page || pageContextMenuHasOpenModal || (activePage.id !== undefined && activePage.id !== null)}
        <PageContextMenu
            bind:pageItemContextMenu
            {fetchPages}
            bind:pages
            bind:activePage
            {notebooks}
            bind:hasOpenModal={pageContextMenuHasOpenModal}
        ></PageContextMenu>
    {/if}
</div>

<style>
.journal-sidebar-hamburger {
    display: flex;
    align-items: center;
    height: 42px;
    padding: 0 14px;
    gap: 0;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-topbar);
    background-color: var(--bg-topbar);
    user-select: none;
}

.journal-sidebar-hamburger a {
    color: var(--color-tb-link);
    text-decoration: none;
}

.journal-sidebar-hamburger a:hover {
    color: var(--color-tb-hover);
}

.tb-brand {
    font-weight: 700;
    font-size: 16px;
    letter-spacing: -0.01em;
    flex-shrink: 0;
    margin-right: 8px;
}

.tb-sep-v {
    width: 1px;
    height: 16px;
    background: var(--border-topbar);
    margin: 0 10px;
    flex-shrink: 0;
}

.tb-profile {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
}

.tb-profile select,
.journal-sidebar-hamburger > select {
    appearance: none;
    border: 1px solid var(--border-select);
    background: var(--bg-select);
    border-radius: 5px;
    padding: 3px 22px 3px 8px;
    font-size: 14px;
    color: inherit;
    outline: none;
    cursor: pointer;
    font-family: inherit;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
}

.journal-sidebar-hamburger > select {
    font-size: 12px;
    opacity: 0.8;
    margin-right: 6px;
    padding: 3px 20px 3px 7px;
}

.tb-page-actions {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
}

.tb-hamburger {
    border: 1px solid var(--border-select);
    border-radius: 5px;
    background: none;
    cursor: pointer;
    padding: 4px 8px;
    font-size: 14px;
    color: var(--color-tb-link);
    font-family: inherit;
    flex-shrink: 0;
}

.tb-theme-label {
    font-size: 11px;
    color: var(--color-tb-link);
    flex-shrink: 0;
    margin-right: 4px;
}

.journal-sidebar-action {
    color: var(--color-utility);
}

.journal-sidebar-action:hover {
    background-color: var(--bg-utility-hover);
    color: inherit;
}

.journal-left-sidebar {
    background-color: var(--bg-sidebar);
    border-right: 0;
}

.journal-right-sidebar {
    background-color: var(--bg-sidebar);
    border-left: 0;
}

.grid-wrapper {
    display: grid;
    grid-template-columns: 15em 1fr 20em;
    overflow: auto;
}

/* Desktop: when only one side is hidden, content takes its space. */
.grid-wrapper:not(.left-open):not(.right-open) {
    grid-template-columns: 1fr;
}
.grid-wrapper.left-open:not(.right-open) {
    grid-template-columns: 15em 1fr;
}
.grid-wrapper:not(.left-open).right-open {
    grid-template-columns: 1fr 20em;
}

.journal-left-sidebar:not(.open),
.journal-right-sidebar:not(.open) {
    display: none;
}
.journal-left-sidebar.open,
.journal-right-sidebar.open {
    display: block;
}

@media (max-width: 768px) {
    /* On mobile, sidebars are absolute overlays inside the topbar grid row. */
    .grid-wrapper {
        grid-template-columns: 1fr !important;
    }

    .grid-wrapper.any-drawer-open {
        overflow: hidden;
    }

    .journal-left-sidebar.open,
    .journal-right-sidebar.open {
        position: fixed;
        top: 42px;
        bottom: 0;
        width: min(280px, 80vw);
        z-index: 10;
        overflow-y: auto;
    }
    .journal-left-sidebar.open {
        left: 0;
        box-shadow: 4px 0 12px rgba(0, 0, 0, 0.18);
    }
    .journal-right-sidebar.open {
        right: 0;
        box-shadow: -4px 0 12px rgba(0, 0, 0, 0.18);
    }
}

.drawer-scrim {
    position: fixed;
    inset: 42px 0 0 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 9;
}

@media (min-width: 769px) {
    .drawer-scrim {
        display: none;
    }
}

.journal-sidebar-item {
    padding: 0.3em 0.9em;
    user-select: none;
}

:global(.journal-sidebar-item.ghost) {
    background-color: #f7f7f7 !important;
}

.journal-sidebar-item:hover {
    background-color: var(--bg-section-hover);
    cursor: pointer;
}

.journal-sidebar-item-selected,
.journal-sidebar-item-selected:hover {
    background-color: var(--bg-section-active);
}

.journal-sidebar-item-notebook:first-of-type {
    border-top: 1px solid var(--border-nb);
}

.journal-sidebar-item-notebook {
    border-bottom: 1px solid var(--border-nb);
}

.journal-sidebar-item-notebook-name {
    background-color: var(--bg-nb-header);
    padding-top: 0.4em;
    padding-bottom: 0.4em;
}

.journal-sidebar-item-notebook-active {
}

.journal-sidebar-item-notebook-name:hover {
    background-color: var(--bg-nb-header-hover);
}

.journal-sidebar-item-notebook-name:not(
    .journal-sidebar-item-notebook-expanded
) {
    border-bottom: 1px solid var(--border-nb);
}

.journal-left-sidebar,
.journal-right-sidebar,
:global(.journal-page-container) {
    overflow-y: auto;
    padding-top: 1.4em;
    padding-bottom: 1.4em;
}

:global(.journal-page-container) {
    padding-bottom: 0;
}

:global(
    .journal-left-sidebar.open
        + .journal-page:not(.PageType-RichText):not(.PageType-Spreadsheet):not(.PageType-DrawIO):not(.PageType-MiniApp):not(.PageType-Kanban)
) {
    padding-left: 2em;
}

:global(
    .journal-left-sidebar:not(.open) + .journal-page:not(.PageType-RichText):not(.PageType-Spreadsheet):not(.PageType-DrawIO):not(.PageType-MiniApp):not(.PageType-Kanban)
) {
    padding-left: 2rem;
}

:global(.journal-page-container.PageType-Spreadsheet),
:global(.journal-page-container.PageType-DrawIO),
:global(.journal-page-container.PageType-MiniApp),
:global(.journal-page-container.PageType-Kanban) {
    padding-top: 0;
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

.sidebar-filter-placeholder {
    width: 100%;
    height: 1.6em;
}

.sidebar-filter {
    position: fixed;
    top: 50px;
    width: 20.9em;
    margin-left: 1px;
    background: var(--bg-section-active);
    border: 1px solid var(--border-select);
    border-radius: 5px;
    color: var(--color-section);
    font-family: inherit;
    font-size: 14px;
    padding: 0.25em 0.5em;
    outline: none;
}

/* On mobile the right sidebar becomes a narrow drawer (min(280px, 80vw)),
 * so the desktop fixed-positioned 20.9em input would overflow it. Flow the
 * input normally inside the drawer instead. */
@media (max-width: 768px) {
    .sidebar-filter-placeholder {
        height: auto;
    }
    .sidebar-filter {
        position: static;
        width: 100%;
        margin-left: 0;
    }
}

.sidebar-filter::placeholder {
    color: var(--color-utility);
    opacity: 0.6;
}

table.table {
    border-collapse: collapse;
}

table.table th,
table.table td {
    border: 1px solid black;
}

a.page-sidebar-item {
    display: block;
    color: inherit;
    text-decoration: none;
}

.mobile-page-title {
    display: none;
    flex: 1;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: 0;
    padding: 4px 8px;
    color: inherit;
    font: inherit;
    font-size: 14px;
    cursor: pointer;
    min-width: 0;
    overflow: hidden;
    text-align: left;
}

.mobile-page-title .title-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
}

.mobile-page-title .chevron {
    color: var(--color-utility);
    font-size: 12px;
    flex-shrink: 0;
}

.mobile-page-title:hover {
    background: var(--bg-utility-hover);
    border-radius: 4px;
}

.drawer-mobile-only {
    display: none;
    border-top: 1px solid var(--border-nb);
    margin-top: 1em;
}

@media (max-width: 768px) {
    .mobile-page-title {
        display: inline-flex;
    }

    .journal-sidebar-hamburger .tb-brand,
    .journal-sidebar-hamburger .tb-sep-v,
    .journal-sidebar-hamburger .tb-profile,
    .journal-sidebar-hamburger .tb-theme-label,
    .journal-sidebar-hamburger > select,
    .journal-sidebar-hamburger > a[href="#logout"] {
        display: none;
    }

    .journal-sidebar-hamburger .tb-page-actions {
        flex: 0 0 auto;
        justify-content: flex-end;
    }

    /* Visible mobile topbar order: hamburger / title / overflow menu. */
    .journal-sidebar-hamburger .tb-hamburger { order: -1; }
    .journal-sidebar-hamburger .mobile-page-title { order: 0; }
    .journal-sidebar-hamburger .tb-page-actions { order: 1; }

    .drawer-mobile-only {
        display: block;
    }
}

.drawer-section {
    padding: 0.6em 0.9em;
    border-bottom: 1px solid var(--border-nb);
}

.drawer-section-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-utility);
    margin-bottom: 0.4em;
}

.drawer-section-body {
    display: flex;
    flex-direction: column;
    gap: 0.4em;
}

.drawer-link {
    color: var(--color-tb-link);
    text-decoration: none;
    padding: 0.4em 0;
    font-size: 14px;
}

.drawer-link:hover {
    color: var(--color-tb-hover);
}
</style>
