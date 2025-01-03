<script>
export let activePage = null
export let activeSection = null

import fetchPlus from '../helpers/fetchPlus.js'
import Modal from './Modal.svelte'
import Portal from './Portal.svelte'
import FlatPage from './PageTypes/FlatPage.svelte'
import Table from './PageTypes/Table.svelte'
import Spreadsheet from './PageTypes/Spreadsheet.svelte'
import DrawIO from './PageTypes/DrawIO.svelte'
import { format } from 'date-fns'
import { eventStore } from '../stores.js'

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

function slugify(string) {
    return string.toLowerCase().replace(/[^\w ]+/g,'').replace(/ +/g,'-')
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

    if(activePage.type === 'FlatPageV2') {
        html = globalThis.generatedHTML
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

    const activeSectionName = activeSection ? ` - ${activeSection.name}` : ''

    html = `
        <head>
            <title>${activePage.name}${activeSectionName}</title>
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

            :where(ul, ol) {
                padding-left: 1rem;
                margin: 0;
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

    let downloadFilename = slugify(activePage.name)

    if(activeSection) {
        downloadFilename += '_' + slugify(activeSection.name)
    }

    downloadFilename += '.html'

    a.download = downloadFilename

    a.click()
    a.remove()
}

function configureTable() {
    eventStore.set({
        event: 'configureTable',
        data: {}
    })
}

function generatePageLinks() {
    const links = []

    if (activePage.id) {
        links.push({
            href: '#view-page-history',
            text: 'History',
            onClick: () => (showPageHistoryModal = true),
        })

        links.push({
            href: '#view-page-uploads',
            text: 'Uploads',
            onClick: () => (showPageUploadsModal = true),
        })

        if (activePage.type !== 'Spreadsheet' && activePage.type !== 'DrawIO') {
            links.push({
                href: '#view-page-styles',
                text: 'Styles',
                onClick: () => startShowPageStylesModal(),
            })

            if (activePage.type === 'Table' && activePage.view_only === false) {
                links.push({
                    href: '#configure-table',
                    text: 'Configure Table',
                    onClick: () => configureTable(),
                })
            }

            links.push({
                href: '#export',
                text: 'Export',
                onClick: () => exportPage(),
            })
        }

        if (activePage.parent_id !== undefined && activePage.parent_id !== null) {
            links.push({
                type: 'link',
                href: `/page/${activePage.parent_id}`,
                text: 'Open Page Group',
                target: '_blank',
            })
        }
    }

    return links
}

let pageLinks = generatePageLinks()

$: if(activePage) {
    pageLinks = generatePageLinks()
}

function isLastLink(index, array) {
    return index === array.length - 1;
}
</script>

<span class="hide-on-small-screen">
    Page [
        {#each pageLinks as { type, href, text, onClick, target }, pageIndex}
            {#if type === 'link'}
                <a href={href} target={target}>{text}</a>
            {:else}
                <a href={href} on:click|preventDefault|stopPropagation={onClick}>{text}</a>
            {/if}
            {#if !isLastLink(pageIndex, pageLinks)}|&nbsp;{/if}
        {/each}
    ]
</span>

<Portal>
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
                {#if activePage.type === 'FlatPage'}
                    <FlatPage bind:pageContentOverride={pageHistoryItemViewPageContent}></FlatPage>
                {/if}
                {#if activePage.type === 'Table'}
                    <Table bind:pageContentOverride={pageHistoryItemViewPageContent}></Table>
                {/if}
                {#if activePage.type === 'Spreadsheet'}
                    <Spreadsheet bind:pageContentOverride={pageHistoryItemViewPageContent}></Spreadsheet>
                {/if}
                {#if activePage.type === 'DrawIO'}
                    <DrawIO bind:pageContentOverride={pageHistoryItemViewPageContent}></DrawIO>
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
</Portal>

<style>
.oy-a {
    overflow-y: auto;
}
</style>
