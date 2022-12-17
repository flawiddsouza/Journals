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

let profiles = [
    {
        id: null,
        name: 'Default'
    }
]

function slugify(string) {
    return string.toLowerCase().replace(/[^\w ]+/g,'').replace(/ +/g,'-')
}

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
            activePage = page
        }
    }
}

let showAddPageModal = false
let addPageToTop = false
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

    let pageObj = {
        id: response.insertedRowId,
        name: pageName,
        type: pageType,
        section_id: activeSection.id,
        notebook_id: activeSection.notebook_id,
        view_only: false,
        password_exists: false,
        locked: false
    }

    if(addPageToTop) {
        pages.unshift(pageObj)
    } else {
        pages.push(pageObj)
    }

    pages = pages

    // set sort order {
    let pageIdsWithSortOrder = pages.map((page, index) => {
        return {
            pageId: String(page.id),
            sortOrder: index + 1
        }
    })

    fetchPlus.post('/pages/sort-order/update', pageIdsWithSortOrder)
    // }

    activePage = pageObj

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

async function duplicatePage() {
    await fetchPlus.post(`/duplicate-page/${pageItemContextMenu.page.id}`, {})
    pageItemContextMenu.page = null
    fetchPages(activeSection)
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

async function passwordProtect() {
    let password = prompt('Password:')
    let passwordConfirm = prompt('Password Confirm:')

    if(password && passwordConfirm && password === passwordConfirm) {
        await fetchPlus.put(`/pages/password-protect/${pageItemContextMenu.page.id}`, {
            password
        })

        pageItemContextMenu.page.password_exists = true
        pageItemContextMenu.page.locked = true

        if(activePage.id === pageItemContextMenu.page.id) {
            activePage.password_exists = true
            activePage.locked = true
        }
    } else {
        if(password === passwordConfirm) {
            alert('Empty passwords given')
        } else {
            alert('Given passwords didn\'t match')
        }
    }

    pageItemContextMenu.page = null
}

async function unlockPage() {
    let password = prompt('Password:')

    if(password) {
        const response = await fetchPlus.post(`/pages/unlock/${pageItemContextMenu.page.id}`, {
            password
        })

        if('error' in response) {
            alert('Invalid password given')
        } else {
            pageItemContextMenu.page.locked = false

            if(activePage.id === pageItemContextMenu.page.id) {
                activePage.locked = false
            }
        }
    } else {
        alert('Empty password given')
    }

    pageItemContextMenu.page = null
}

async function changePagePassword() {
    let currentPassword = prompt('Current Password:')

    if(currentPassword === '') {
        alert('Current Password required')
        return
    }

    let newPassword = prompt('New Password:')

    if(newPassword === '') {
        alert('New Password required')
        return
    }

    let newPasswordConfirm = prompt('Confirm New Password:')

    if(newPasswordConfirm === '') {
        alert('Confirm New Password required')
        return
    }

    if(newPassword === newPasswordConfirm) {
        const response = await fetchPlus.put(`/pages/change-password/${pageItemContextMenu.page.id}`, {
            currentPassword,
            newPassword
        })

        if('error' in response) {
            alert('Invalid current password given')
        } else {
            alert('Page password changed')
        }
    } else {
        alert('Given passwords didn\'t match')
    }

    pageItemContextMenu.page = null
}

async function removePagePassword() {
    let password = prompt('Password:')

    if(password) {
        const response = await fetchPlus.post(`/pages/remove-password/${pageItemContextMenu.page.id}`, {
            password
        })

        if('error' in response) {
            alert('Invalid password given')
        } else {
            pageItemContextMenu.page.locked = false
            pageItemContextMenu.page.password_exists = false

            if(activePage.id === pageItemContextMenu.page.id) {
                activePage.locked = false
                activePage.password_exists = false
            }
        }
    } else {
        alert('Empty password given')
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

const htmlParser = new DOMParser()

async function readFileAsDataURL(fileBlob) {
    let base64String = await new Promise((resolve) => {
        let fileReader = new FileReader()
        fileReader.onload = () => resolve(fileReader.result)
        fileReader.readAsDataURL(fileBlob)
    })

    return base64String
}

async function exportPage() {
    let html = ''

    if(activePage.type === 'FlatPage') {
        html = document.querySelector('.page-container').innerHTML
    }

    if(activePage.type === 'Table') {
        html = document.querySelector('.editable-table').outerHTML
    }

    let parsedHtml = htmlParser.parseFromString(html, 'text/html')

    // convert all img url srcs to base64 srcs
    for(const img of parsedHtml.querySelectorAll('img')) {
        let response = await fetch(img.src)
        let blob = await response.blob()
        let base64String = await readFileAsDataURL(blob)
        img.src = base64String
    }

    html = `
        <head>
            <title>${activePage.name} - ${activeSection.name}</title>
            <style>
            table {
                border-collapse: collapse;
            }

            table th, table td {
                border: 1px solid grey;
                min-width: 3em;
                padding: 2px 5px;
            }

            table > tbody td {
                padding: 0;
                vertical-align: top;
            }

            table > tbody td > div {
                padding: 2px 5px;
            }

            table td > div[contenteditable] {
                outline: 0;
            }

            body {
                margin-left: 2em;
                margin-top: 1em;
            }
            </style>
        </head>
        <body>
            <h1>${activePage.name}</h1>
            <main>${parsedHtml.body.innerHTML}</main>
        </body>
    `
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = slugify(activePage.name) + '_' + slugify(activeSection.name) + '.html'
    a.click()
    a.remove()
}

function handleAddPageInput(e) {
    // insert current date at cursor
    if(e.altKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        const el = e.target
        const textToInsert = format(new Date(), 'DD-MMM-YY')
        el.setRangeText(textToInsert, el.selectionStart, el.selectionEnd, 'end')
        el.dispatchEvent(new Event('input')) // trigger the input event, so the data binding gets updated by svelte
    }
}

function handlePagesSidebarItemClick(e, page) {
    if(e.ctrlKey) {
        return
    }
    e.preventDefault()
    activePage = page
}

import { switchAccount } from '../helpers/account'
import Table from './PageTypes/Table.svelte'
import FlatPage from './PageTypes/FlatPage.svelte'
import Spreadsheet from './PageTypes/Spreadsheet.svelte'
import Page from './Page.svelte'
import Modal from './Modal.svelte'
import { format } from 'date-fns'
</script>

<div>
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
                {#if activePage.locked === false}
                Page [ <a href="#view-page-history" on:click|preventDefault|stopPropagation={() => activePage.id ? showPageHistoryModal = true : null}>History</a> | <a href="#view-page-uploads" on:click|preventDefault|stopPropagation={() => activePage.id ? showPageUploadsModal = true : null}>Uploads</a> {#if activePage.type !== 'Spreadsheet'} | <a href="#view-page-styles" on:click|preventDefault|stopPropagation={() => activePage.id ? startShowPageStylesModal() : null}>Styles</a> | <a href="#export" on:click|preventDefault|stopPropagation={() => activePage.id ? exportPage() : null}>Export</a> {/if} ]
                {/if}
            </div>
            <a href="#add-account" on:click|preventDefault|stopPropagation={switchAccount} class="mr-1em">Switch Account</a>
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
    <Page activePage={activePage} updatePageName={updatePageName} className="journal-page-container"></Page>
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
    {#if showAddPageModal}
        <Modal on:close-modal={() => showAddPageModal = false}>
            <form on:submit|preventDefault={addPageToActiveSection}>
                <h2 class="heading">Add Page</h2>
                <label>Name<br>
                    <input type="text" bind:value={addPage.name} required class="w-100p" use:focus on:keydown={handleAddPageInput}>
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
                    <!-- svelte-ignore a11y-label-has-associated-control -->
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

    {#if pageItemContextMenu.page}
        <div class="context-menu" style="left: {pageItemContextMenu.left}px; top: {pageItemContextMenu.top}px">
            {#if pageItemContextMenu.page.locked === false}
                {#if pageItemContextMenu.page.view_only === false}
                    <div on:click={pageMakeViewOnly}>Make view only</div>
                {:else}
                    <div on:click={pageEnableEdits}>Enable Edits</div>
                {/if}
                {#if pageItemContextMenu.page.password_exists === false}
                    <div on:click={passwordProtect}>Password Protect</div>
                {:else}
                    <div on:click={changePagePassword}>Change Password</div>
                    <div on:click={removePagePassword}>Remove Password</div>
                {/if}
                <div on:click={duplicatePage}>Duplicate page</div>
                <div on:click={startMovePage}>Move page</div>
                <div on:click={deletePage}>Delete page</div>
            {:else}
                <div on:click={unlockPage}>Unlock Page</div>
            {/if}
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
            <div on:click={startMoveNotebook}>Move notebook</div>
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
    height: calc(100vh - 3em);
    margin-top: 3em;
    padding-top: 1.4em;
    padding-bottom: 1.4em;
}

:global(.journal-page-container) {
    padding-bottom: 0;
}

:global(.journal-left-sidebar[style*="block"] + .journal-page) {
    margin-left: 17em;
    margin-right: 20em;
}

:global(.journal-left-sidebar[style*="none"] + .journal-page) {
    padding-left: 2rem;
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

a.page-sidebar-item {
    display: block;
    color: inherit;
    text-decoration: none;
}
</style>
