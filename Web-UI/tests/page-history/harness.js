import PageNav from '../../src/components/PageNav.svelte'

const pageType = new URLSearchParams(location.search).get('type') ?? 'FlatPage'
const pageHistory = [
    { id: 3, created_at: '2026-07-16 12:03:00', pinned: 0 },
    { id: 2, created_at: '2026-07-16 12:02:00', pinned: 0 },
    { id: 1, created_at: '2026-07-16 12:01:00', pinned: 0 },
]
const pageContextBefore = `<div style="height: 900px;"></div><p style="display:inline-block;white-space:pre;">Context before 1 ${'W'.repeat(122)}</p><p>Context before 2</p><p>Context before 3</p><p>Context before 4</p><p>Context before 5</p>`
const pageContextAfter =
    '<p>Context after 1</p><p>Context after 2</p><p>Context after 3</p><p>Context after 4</p><p>Context after 5</p>'
const flatPageContent = (version) =>
    `${pageContextBefore}<section class="snapshot-layout"><p>Hello ${version}</p></section>${pageContextAfter}`
const pageContentFlatPage = {
    3: flatPageContent('newest'),
    2: flatPageContent('middle'),
    1: flatPageContent('oldest'),
}
const tiptapContent = (text) =>
    JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })
const pageContentFlatPageV2 = {
    3: tiptapContent('Snapshot newest'),
    2: tiptapContent('Snapshot middle'),
    1: tiptapContent('Snapshot oldest'),
}
const pageContent =
    pageType === 'FlatPageV2' ? pageContentFlatPageV2 : pageContentFlatPage

window.pageHistoryRequests = []
window.pageHistoryContentDelays = {}

function json(data) {
    return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })
}

window.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    window.pageHistoryRequests.push(url.pathname)
    if (url.pathname === '/page-history/42') return json(pageHistory)

    const match = url.pathname.match(/^\/page-history\/content\/(\d+)$/)
    if (match) {
        const id = Number(match[1])
        const delay = window.pageHistoryContentDelays[id] ?? 0
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
        return json({ content: pageContent[id] })
    }

    return json({})
}

new PageNav({
    target: document.getElementById('app'),
    props: {
        activePage: {
            id: 42,
            name: 'History Test',
            type: pageType,
            font_size: 17,
            font_size_unit: 'px',
            font: 'monospace',
        },
    },
})
