// Test-only harness: mounts the real Page.svelte so specs can assert the chrome
// (title bar + entries spacing) a page type receives, for both hide_title states.
// Not part of the shipped app -- vite.config.ts only builds index.html and page/.
//
// Driven by query params: ?type=VersatileCalculator&hideTitle=1
import Page from '../../src/components/Page.svelte'
// Side-effect import, for CSS only. The `.journal-page-container` padding and the
// `.journal-left-sidebar.open + .journal-page:not(...)` rules live in Frame.svelte,
// and they carry their own list of which page types are "embedded" chrome-less
// apps. Without this import a spec would measure Page.svelte's rules in isolation
// and miss a page type that is listed in one file but not the other.
import '../../src/components/Frame.svelte'

const params = new URLSearchParams(location.search)
const type = params.get('type') || 'FlatPage'
const hideTitle = params.get('hideTitle') === '1'
const theme = params.get('theme')
const fontSize = params.get('fontSize')
const storageEnabled = params.get('storage') === '1'
const storageKey = 'page-chrome-excalidraw-storage'

if (theme) {
    document.documentElement.setAttribute('data-theme', theme)
}

const jsonResponse = (value) =>
    new Response(JSON.stringify(value), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })

const nativeFetch = window.fetch.bind(window)

function readStorage() {
    return JSON.parse(sessionStorage.getItem(storageKey) || '{}')
}

function writeStorage(storage) {
    sessionStorage.setItem(storageKey, JSON.stringify(storage))
}

window.getExcalidrawStorage = readStorage

// Serve every request an empty page body by default. Storage mode exercises the
// Excalidraw upload and retrieval contract without requiring a running API.
window.fetch = async (input, options = {}) => {
    const url = typeof input === 'string' ? input : input.url
    if (url.startsWith('data:') || url.startsWith('blob:')) {
        return nativeFetch(input, options)
    }

    if (url.startsWith('https://libraries.excalidraw.com/')) {
        return nativeFetch(input, options)
    }

    const method = (options.method || 'GET').toUpperCase()
    const storage = readStorage()

    if (url.includes('/user-settings/excalidraw.library')) {
        if (method === 'GET') {
            return jsonResponse(
                storageEnabled
                    ? storage.libraryData || { libraryItems: [] }
                    : { libraryItems: [] },
            )
        }

        if (method === 'PUT') {
            if (storageEnabled) {
                storage.libraryData = JSON.parse(options.body).settingValue
                storage.librarySaveCount = (storage.librarySaveCount || 0) + 1
                writeStorage(storage)
            }
            return jsonResponse({ success: true })
        }
    }

    if (!storageEnabled) return jsonResponse({ content: '' })

    if (method === 'GET' && url.includes('/pages/content/')) {
        return jsonResponse({ content: storage.pageContent || '' })
    }

    if (method === 'POST' && url.includes('/upload-image/')) {
        const image = options.body.get('image')
        storage.imageDataURL = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(image)
        })
        storage.filename = 'stored-image.png'
        storage.uploadCount = (storage.uploadCount || 0) + 1
        writeStorage(storage)
        return jsonResponse({
            filename: storage.filename,
            imageUrl: `uploads/images/${storage.filename}`,
        })
    }

    if (method === 'PUT' && url.includes('/pages/')) {
        storage.pageContent = JSON.parse(options.body).pageContent
        writeStorage(storage)
        return jsonResponse({ success: true })
    }

    if (method === 'GET' && url.includes('/uploads/images/')) {
        storage.imageLoadCount = (storage.imageLoadCount || 0) + 1
        writeStorage(storage)
        return nativeFetch(storage.imageDataURL)
    }

    return jsonResponse({ content: '' })
}

new Page({
    target: document.getElementById('frame'),
    props: {
        notebooks: [],
        className: 'journal-page-container',
        updatePageName: () => {},
        activePage: {
            id: 1,
            name: 'Chrome Test',
            type,
            created_at: '2026-01-01 00:00:00',
            locked: false,
            view_only: false,
            hide_title: hideTitle,
            font_size: fontSize,
            font_size_unit: fontSize ? 'px' : undefined,
        },
    },
})
