// Test-only harness: mounts the real Page.svelte against a fake API that keeps
// one page the way the real one does, revision and refused saves included, so a
// spec can save the page "from another device" with window.saveElsewhere().
// Not part of the shipped app: vite.config.ts only builds index.html and page/.
//
// Driven by query params: ?type=FlatPageV2&paragraphs=80
import Page from '../../src/components/Page.svelte'
import '../../src/components/Frame.svelte'

const params = new URLSearchParams(location.search)
const type = params.get('type') || 'FlatPageV2'
const paragraphs = Number(params.get('paragraphs') || 3)

export const flatPageV2Content = (lines) =>
    JSON.stringify({
        type: 'doc',
        content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
    })

const initialLines = Array.from({ length: paragraphs }, (_, index) => `Line ${index + 1}`)
const server = {
    content: flatPageV2Content(initialLines),
    saves: [],
    refused: 0,
    revisionChecks: 0,
    contentLoads: 0,
}
window.server = server
window.flatPageV2Content = flatPageV2Content

// Any string that changes with the content will do, as on the API.
const revisionOf = (content) => {
    let hash = 0
    for (const character of content || '') hash = (hash * 31 + character.charCodeAt(0)) | 0
    return `r${hash >>> 0}`
}

window.saveElsewhere = (content) => {
    server.content = content
}

const json = (value, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

const nativeFetch = window.fetch.bind(window)
window.fetch = async (input, options = {}) => {
    const url = typeof input === 'string' ? input : input.url
    if (url.startsWith('data:') || url.startsWith('blob:')) return nativeFetch(input, options)
    const method = (options.method || 'GET').toUpperCase()

    if (method === 'GET' && url.includes('/pages/content/')) {
        server.contentLoads++
        return json({ content: server.content, revision: revisionOf(server.content) })
    }
    if (method === 'GET' && url.includes('/pages/revision/')) {
        server.revisionChecks++
        return json({ revision: revisionOf(server.content) })
    }
    if (method === 'PUT' && /\/pages\/\d+$/.test(url)) {
        const { pageContent, baseRevision } = JSON.parse(options.body)
        if (baseRevision && baseRevision !== revisionOf(server.content) && pageContent !== server.content) {
            server.refused++
            return json({ error: 'The page changed since it was read', revision: revisionOf(server.content) }, 409)
        }
        server.content = pageContent
        server.saves.push(pageContent)
        return json({ success: true, revision: revisionOf(pageContent) })
    }
    return json({})
}

new Page({
    target: document.getElementById('frame'),
    props: {
        notebooks: [],
        className: 'journal-page-container',
        updatePageName: () => {},
        activePage: {
            id: 1,
            name: 'Outside Changes',
            type,
            created_at: '2026-01-01 00:00:00',
            locked: false,
            view_only: false,
            hide_title: false,
        },
    },
})
