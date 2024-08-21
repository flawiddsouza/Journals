<script>
export let pageItemContextMenu
export let fetchPages
export let pages
export let activePage
export let notebooks
export let pageGroupId = null

import fetchPlus from '../helpers/fetchPlus.js'
import Portal from './Portal.svelte'
import Modal from './Modal.svelte'
import { eventStore } from '../stores.js'

let showMovePageModal = false
let showMovePageModalData = null
let showMovePageModalSelectedNotebook = null
let showMovePageModalSelectedSectionId = null
let showMovePageModalSelectedPageGroupId = null
let pageGroupsForShowMovePageModalSelectedSectionId = []

function openPageNewTab() {
    window.open(`/page/${pageItemContextMenu.page.id}`)
    pageItemContextMenu.page = null
}

function pageMakeViewOnly() {
    fetchPlus.put(`/pages/view-only/${pageItemContextMenu.page.id}`, {
        viewOnly: true
    })

    pageItemContextMenu.page.view_only = true

    if(activePage.id === pageItemContextMenu.page.id) {
        activePage.view_only = true
    }

    pageItemContextMenu.page = null
}

function pageEnableEdits() {
    fetchPlus.put(`/pages/view-only/${pageItemContextMenu.page.id}`, {
        viewOnly: false
    })

    pageItemContextMenu.page.view_only = false

    if(activePage.id === pageItemContextMenu.page.id) {
        activePage.view_only = false
    }

    pageItemContextMenu.page = null
}

async function duplicatePage() {
    await fetchPlus.post(`/duplicate-page/${pageItemContextMenu.page.id}`, { pageGroupId })
    pageItemContextMenu.page = null
    if(pageGroupId) {
        fetchPages(pageGroupId)
    } else {
        fetchPages()
    }
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

async function movePage() {
    const existingPageGroupId = showMovePageModalData.parent_id ? showMovePageModalData.parent_id : null
    const pageGroupId = showMovePageModalSelectedPageGroupId ? Number(showMovePageModalSelectedPageGroupId) : null
    const sectionId = Number(showMovePageModalSelectedSectionId)

    if(showMovePageModalData.section_id === sectionId && existingPageGroupId === pageGroupId) {
        alert('Page is already in this section / page group')
        return
    }

    await fetchPlus.put(`/move-page/${showMovePageModalData.id}`, {
        sectionId,
        pageGroupId
    })

    pages = pages.filter(page => page.id !== showMovePageModalData.id)

    if(pageGroupId) {
        eventStore.set({
            event: 'pageAddedToPageGroup',
            data: {
                pageGroupId
            }
        })
    } else {
        eventStore.set({
            event: 'pageMovedToSection',
            data: {
                sectionId
            }
        })

        if (existingPageGroupId) {
            await fetchPlus.put(`/pages/${existingPageGroupId}`, {
                pageContent: JSON.stringify({
                    activePageId: null
                })
            })

            eventStore.set({
                event: 'pageRemovedFromPageGroup',
                data: {
                    pageGroupId: existingPageGroupId
                }
            })
        }
    }

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
            if(pageGroupId) {
                if(pages.length) {
                    activePage = pages[0]
                    fetchPlus.put(`/pages/${pageGroupId}`, {
                        pageContent: JSON.stringify({
                            activePageId: activePage.id
                        })
                    })
                } else {
                    activePage = {}
                    fetchPlus.put(`/pages/${pageGroupId}`, {
                        pageContent: JSON.stringify({
                            activePageId: null
                        })
                    })
                }
            } else {
                activePage = {}
            }
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

async function fetchPageGroupsForSectionId() {
    if(showMovePageModalSelectedSectionId) {
        pageGroupsForShowMovePageModalSelectedSectionId = await fetchPlus.get(`/pages/${showMovePageModalSelectedSectionId}?page_groups_only=true`)
    } else {
        pageGroupsForShowMovePageModalSelectedSectionId = []
    }
}

$: fetchPageGroupsForSectionId(showMovePageModalSelectedSectionId)
</script>

<Portal>
    {#if pageItemContextMenu.page}
        <div class="context-menu" style="left: {pageItemContextMenu.left}px; top: {pageItemContextMenu.top}px">
            {#if pageItemContextMenu.page.locked === false}
                <div on:click={openPageNewTab}>Open page in a new tab</div>
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
                            <option disabled></option>
                            {#each notebooks as notebook}
                                <option value={notebook}>{ notebook.name }</option>
                            {/each}
                        </select>
                    </label>
                </div>
                <div class="mt-1em">
                    <label>
                        Select Target Section<br>
                        <select class="w-100p" required bind:value={showMovePageModalSelectedSectionId} on:change={() => showMovePageModalSelectedPageGroupId = null}>
                            <option></option>
                            {#each showMovePageModalSelectedNotebook.sections.filter(item => {
                                if(showMovePageModalData.type !== 'PageGroup') {
                                    return true
                                } else {
                                    return item.id !== showMovePageModalData.section_id
                                }
                            }) as section}
                                <option value={section.id} selected={showMovePageModalSelectedSectionId === section.id}>{ section.name }</option>
                            {/each}
                        </select>
                    </label>
                </div>
                {#if showMovePageModalData.type !== 'PageGroup'}
                    <div class="mt-1em">
                        <label>
                            Select Page Group<br>
                            <select class="w-100p" bind:value={showMovePageModalSelectedPageGroupId}>
                                <option></option>
                                {#each pageGroupsForShowMovePageModalSelectedSectionId as pageGroup}
                                    <option value={pageGroup.id} selected={showMovePageModalSelectedPageGroupId === pageGroup.id}>{ pageGroup.name }</option>
                                {/each}
                            </select>
                        </label>
                    </div>
                {/if}
                <button class="mt-1em w-100p">Move Page</button>
            </form>
        </Modal>
    {/if}
</Portal>
