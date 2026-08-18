<script>
import { onDestroy, onMount } from 'svelte'
import { baseURL } from '../../../config.js'
import fetchPlus from '../../helpers/fetchPlus.js'
import {
    addExcalidrawFileNames,
    createExcalidrawLibraryAdapter,
    getExcalidrawUploadFilename,
    getReferencedExcalidrawFileIds,
    parseExcalidrawPageContent,
} from '../../helpers/excalidrawPage.js'

export let pageId = null
export let viewOnly = false
export let pageContentOverride = undefined

let container
let errorMessage = ''
let loading = true
let reactCreateElement
let reactUseState
let reactRoot
let ExcalidrawEditor
let excalidrawAPIInstance
let serializeAsJSON
let useHandleLibrary
let initialData
let fileNames = {}
let latestScene = null
let saveTimer = null
let saveQueue = Promise.resolve()
let destroyed = false
let theme = getExcalidrawTheme()
let themeObserver
let lastSavedPageContent = ''
let libraryChannel = null
let libraryPopup = null
const uploads = new Map()
const libraryAdapter = createExcalidrawLibraryAdapter(fetchPlus)

function getExcalidrawTheme() {
    return document.documentElement.dataset.theme === 'midnight'
        ? 'dark'
        : 'light'
}

function getAuthHeaders() {
    return { Token: localStorage.getItem('token') || '' }
}

function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
    })
}

async function loadStoredFile(fileId, filename) {
    const response = await fetch(
        `${baseURL}/uploads/images/${encodeURIComponent(filename)}`,
        {
            credentials: 'include',
            headers: getAuthHeaders(),
        },
    )

    if (!response.ok) {
        throw new Error(`Could not load ${filename}`)
    }

    const blob = await response.blob()
    return {
        id: fileId,
        dataURL: await blobToDataURL(blob),
        mimeType: blob.type || 'application/octet-stream',
        created: 0,
    }
}

async function loadStoredFiles(fileNamesToLoad) {
    const entries = await Promise.allSettled(
        Object.entries(fileNamesToLoad).map(([fileId, filename]) =>
            loadStoredFile(fileId, filename),
        ),
    )
    const files = {}
    let failures = 0

    for (const entry of entries) {
        if (entry.status === 'fulfilled') {
            files[entry.value.id] = entry.value
        } else {
            failures += 1
        }
    }

    if (failures > 0) {
        errorMessage = `${failures} drawing image${failures === 1 ? '' : 's'} could not be loaded.`
    }

    return files
}

async function uploadFile(fileId, file) {
    if (fileNames[fileId]) return fileNames[fileId]
    if (uploads.has(fileId)) return uploads.get(fileId)
    if (!file?.dataURL) throw new Error(`Image ${fileId} has no data`)

    const upload = (async () => {
        const blob = await fetch(file.dataURL).then((response) =>
            response.blob(),
        )
        const data = new FormData()
        data.append(
            'image',
            blob,
            getExcalidrawUploadFilename(fileId, file.mimeType || blob.type),
        )
        const response = await fetchPlus.post(`/upload-image/${pageId}`, data)
        fileNames[fileId] = response.filename
        return response.filename
    })()

    uploads.set(fileId, upload)

    try {
        return await upload
    } finally {
        uploads.delete(fileId)
    }
}

async function saveLatestScene() {
    if (!latestScene || viewOnly || pageContentOverride !== undefined) return

    let scene = latestScene
    while (scene) {
        const fileIds = getReferencedExcalidrawFileIds(scene.elements)
        await Promise.all(
            fileIds.map((fileId) => uploadFile(fileId, scene.files[fileId])),
        )

        if (scene === latestScene) break
        scene = latestScene
    }

    if (!scene) return

    const elementsStored = scene.elements.map((element) =>
        element.type === 'image' && fileNames[element.fileId]
            ? { ...element, status: 'saved' }
            : element,
    )
    const serializedScene = serializeAsJSON(
        elementsStored,
        scene.appState,
        {},
        'database',
    )
    const pageContent = addExcalidrawFileNames(
        serializedScene,
        elementsStored,
        fileNames,
        scene.appState,
    )

    if (pageContent === lastSavedPageContent) return

    await fetchPlus.put(`/pages/${pageId}`, { pageContent })
    lastSavedPageContent = pageContent
    errorMessage = ''
}

function queueSave() {
    saveQueue = saveQueue.then(saveLatestScene).catch(() => {
        errorMessage = 'Drawing save failed.'
    })
}

function scheduleSave() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(queueSave, 700)
}

function handleChange(elements, appState, files) {
    if (viewOnly || pageContentOverride !== undefined) return
    latestScene = { elements, appState, files }
    scheduleSave()
}

function handleScrollChange(scrollX, scrollY, zoom) {
    if (viewOnly || pageContentOverride !== undefined) return

    if (!latestScene) {
        if (!excalidrawAPIInstance) return
        latestScene = {
            elements: excalidrawAPIInstance.getSceneElementsIncludingDeleted(),
            appState: excalidrawAPIInstance.getAppState(),
            files: excalidrawAPIInstance.getFiles(),
        }
    }

    latestScene = {
        ...latestScene,
        appState: {
            ...latestScene.appState,
            scrollX,
            scrollY,
            zoom,
        },
    }
    scheduleSave()
}

function getLibraryReturnUrl() {
    const libraryReturnUrl = new URL(window.location.href)
    libraryReturnUrl.hash = ''
    return libraryReturnUrl.href
}

async function importLibraryUrl(libraryUrl) {
    if (!excalidrawAPIInstance) {
        throw new Error('Drawing editor is not ready')
    }

    const libraryUrlParsed = new URL(libraryUrl)
    if (
        libraryUrlParsed.protocol !== 'https:' ||
        libraryUrlParsed.hostname !== 'libraries.excalidraw.com'
    ) {
        throw new Error('Library URL is not allowed')
    }

    const response = await fetch(libraryUrlParsed.href)
    if (!response.ok) {
        throw new Error('Library download failed')
    }

    await excalidrawAPIInstance.updateLibrary({
        libraryItems: await response.blob(),
        prompt: false,
        merge: true,
        defaultStatus: 'published',
        openLibraryMenu: true,
    })
    errorMessage = ''
}

function closeLibraryPopup() {
    try {
        libraryPopup?.close()
    } catch {
        // The library site can detach its popup from the opener.
    }
    libraryPopup = null
}

function handleExcalidrawClick(event) {
    if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
    ) {
        return
    }

    const libraryLink = event.target.closest('a.library-menu-browse-button')
    if (!libraryLink) return

    libraryChannel?.close()
    closeLibraryPopup()

    const libraryChannelName = `journals-excalidraw-library-${crypto.randomUUID()}`
    const libraryReturnUrl = new URL(
        '/excalidraw-library-return.html',
        window.location.origin,
    )
    libraryReturnUrl.searchParams.set('channel', libraryChannelName)

    const libraryUrl = new URL(libraryLink.href)
    libraryUrl.searchParams.set('target', '_self')
    libraryUrl.searchParams.set('referrer', libraryReturnUrl.href)

    libraryChannel = new BroadcastChannel(libraryChannelName)
    libraryChannel.onmessage = async ({ data }) => {
        if (
            data?.type !== 'excalidraw-library' ||
            typeof data.hash !== 'string' ||
            !data.hash.startsWith('#addLibrary=')
        ) {
            return
        }

        const libraryParameters = new URLSearchParams(data.hash.slice(1))
        const libraryUrlReturned = libraryParameters.get('addLibrary')
        if (!libraryUrlReturned) return

        const libraryChannelReceived = libraryChannel
        libraryChannelReceived?.postMessage({
            type: 'excalidraw-library-received',
        })
        window.setTimeout(() => libraryChannelReceived?.close(), 100)
        libraryChannel = null
        closeLibraryPopup()

        try {
            await importLibraryUrl(libraryUrlReturned)
        } catch {
            errorMessage = 'Library import failed.'
        }
    }

    libraryPopup = window.open(
        libraryUrl.href,
        libraryLink.target,
        'popup=yes,width=1100,height=780,resizable=yes,scrollbars=yes',
    )
    if (!libraryPopup) {
        libraryChannel.close()
        libraryChannel = null
        return
    }

    event.preventDefault()
    libraryPopup.focus()
}

function ExcalidrawWithLibrary({ libraryPersistenceEnabled, ...props }) {
    const [excalidrawAPI, setExcalidrawAPI] = reactUseState(null)
    useHandleLibrary(
        libraryPersistenceEnabled
            ? { excalidrawAPI, adapter: libraryAdapter }
            : { excalidrawAPI },
    )

    const handleExcalidrawAPI = (excalidrawAPINext) => {
        excalidrawAPIInstance = excalidrawAPINext
        setExcalidrawAPI(excalidrawAPINext)
    }

    return reactCreateElement(ExcalidrawEditor, {
        ...props,
        excalidrawAPI: handleExcalidrawAPI,
    })
}

function renderEditor(
    viewModeEnabled = viewOnly || pageContentOverride !== undefined,
) {
    if (!reactRoot || !initialData) return

    reactRoot.render(
        reactCreateElement(ExcalidrawWithLibrary, {
            initialData,
            onChange: handleChange,
            onScrollChange: handleScrollChange,
            theme,
            viewModeEnabled,
            libraryPersistenceEnabled: pageContentOverride === undefined,
            libraryReturnUrl: encodeURIComponent(getLibraryReturnUrl()),
        }),
    )
}

onMount(async () => {
    try {
        window.EXCALIDRAW_ASSET_PATH = '/excalidraw/fonts/'
        if (!window.name) {
            window.name = `journals-excalidraw-${crypto.randomUUID()}`
        }
        container.addEventListener('click', handleExcalidrawClick, true)

        const [reactModule, reactDomModule, excalidrawModule] =
            await Promise.all([
                import('react'),
                import('react-dom/client'),
                import('@excalidraw/excalidraw'),
                import('@excalidraw/excalidraw/index.css'),
            ])

        if (destroyed) return

        reactCreateElement = reactModule.createElement
        reactUseState = reactModule.useState
        ExcalidrawEditor = excalidrawModule.Excalidraw
        serializeAsJSON = excalidrawModule.serializeAsJSON
        useHandleLibrary = excalidrawModule.useHandleLibrary

        const pageContent =
            pageContentOverride !== undefined
                ? pageContentOverride
                : (await fetchPlus.get(`/pages/content/${pageId}`)).content
        lastSavedPageContent = pageContent || ''
        const pageContentParsed = parseExcalidrawPageContent(pageContent)
        fileNames = { ...pageContentParsed.fileNames }
        const files = await loadStoredFiles(fileNames)

        if (destroyed) return

        initialData = { ...pageContentParsed.scene, files }
        reactRoot = reactDomModule.createRoot(container)
        loading = false
        renderEditor()

        themeObserver = new MutationObserver(() => {
            const themeNext = getExcalidrawTheme()
            if (themeNext !== theme) {
                theme = themeNext
                renderEditor()
            }
        })
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        })
    } catch {
        loading = false
        errorMessage = 'Drawing could not be loaded.'
    }
})

$: if (reactRoot && initialData) {
    renderEditor(viewOnly || pageContentOverride !== undefined)
}

onDestroy(() => {
    if (latestScene && !viewOnly && pageContentOverride === undefined) {
        queueSave()
    }
    destroyed = true
    clearTimeout(saveTimer)
    themeObserver?.disconnect()
    libraryChannel?.close()
    closeLibraryPopup()
    container?.removeEventListener('click', handleExcalidrawClick, true)
    reactRoot?.unmount()
})
</script>

<div class="excalidraw-page">
    {#if loading}
        <div class="excalidraw-message">Loading drawing...</div>
    {/if}
    {#if errorMessage}
        <div class="excalidraw-error" role="alert">{errorMessage}</div>
    {/if}
    <div class="excalidraw-root" bind:this={container}></div>
</div>

<style>
.excalidraw-page,
.excalidraw-root {
    width: 100%;
    height: 100%;
    min-height: 420px;
}

.excalidraw-page {
    position: relative;
    overflow: hidden;
}

.excalidraw-message,
.excalidraw-error {
    position: absolute;
    z-index: 2;
    top: 0.75rem;
    left: 50%;
    padding: 0.45rem 0.7rem;
    border: 1px solid var(--border-select);
    border-radius: 5px;
    background: var(--bg-select);
    color: var(--color-section);
    transform: translateX(-50%);
}

.excalidraw-error {
    border-color: var(--color-danger);
}

.excalidraw-page :global(.excalidraw .library-menu-browse-button),
.excalidraw-page :global(.excalidraw .library-menu-browse-button:visited) {
    color: #fff;
}

.excalidraw-page :global(.excalidraw.theme--dark .library-menu-browse-button),
.excalidraw-page
    :global(.excalidraw.theme--dark .library-menu-browse-button:visited) {
    color: var(--color-gray-100);
}
</style>
