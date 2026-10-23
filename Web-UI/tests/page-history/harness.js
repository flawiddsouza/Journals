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
// ?plain makes Note an "Input (Plain Text)" column, whose cells hold real line breaks.
const plainText = new URLSearchParams(location.search).has('plain')
const storageOnly = new URLSearchParams(location.search).has('storage-only')
const calculated = new URLSearchParams(location.search).has('calculated')
const formatting = new URLSearchParams(location.search).has('formatting')
const hanging = new URLSearchParams(location.search).has('hanging')
const styled = new URLSearchParams(location.search).has('styled')
const tableContent = (...notes) =>
    JSON.stringify({
        columns: [
            {
                name: 'Note',
                label: 'Note',
                type: plainText ? 'Input (Plain Text)' : '',
                wrap: '',
                align: '',
                autocomplete: '',
            },
            ...(calculated || hanging ? [{
                name: 'Entries', label: 'Entries', type: 'Computed',
                expression: "return item.Note.split('\\n').length",
            }] : []),
        ],
        items: notes.map((Note) => ({ Note })),
        totals: {},
        widths: {},
        rowStyle: '',
        startupScript: '',
        pullScript: '',
        customFunctions: '',
        note: '',
    })
const pageContentTable = formatting
    ? {
          3: tableContent('<strong>same words</strong>'),
          2: tableContent('<em>same words</em>'),
          1: tableContent('same words'),
      }
    : plainText
    ? {
          3: tableContent('one\ntwo', 'keep\nme'),
          2: storageOnly ? tableContent('one<br>two', 'keep<br>me') : tableContent('one', 'keep\nme'),
          1: tableContent('one', 'keep\nme'),
      }
    : {
          3: tableContent('one', 'two', 'three'),
          2: tableContent('one', 'two'),
          1: tableContent('one'),
      }
if (hanging) {
    const content = JSON.parse(pageContentTable[3])
    content.columns.find((column) => column.name === 'Entries').expression = 'while (true) {}'
    pageContentTable[3] = JSON.stringify(content)
}
if (styled) {
    for (const id of [1, 2, 3]) {
        const content = JSON.parse(pageContentTable[id])
        content.columns[0].style = id === 3 ? "return 'color: green'" : "return 'color: red'"
        content.rowStyle = id === 3 ? "return 'font-size: 18px'" : "return 'font-size: 12px'"
        content.widths.Note = id === 3 ? '150px' : '100px'
        content.totals.Note = 'return items.length'
        pageContentTable[id] = JSON.stringify(content)
    }
}

// The page as it is now: the save after version 3 added a fourth row, or a
// third line to the plain-text note.
const pageContentCurrentTable = plainText
    ? tableContent('one\ntwo\nthree', 'keep\nme')
    : tableContent('one', 'two', 'three', 'four')
const pageContent =
    pageType === 'FlatPageV2'
        ? pageContentFlatPageV2
        : pageType === 'Table'
          ? pageContentTable
          : pageContentFlatPage

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
    // The page as it is now, which the Current version entry shows.
    if (url.pathname === '/pages/content/42')
        return json({
            content:
                pageType === 'FlatPageV2'
                    ? tiptapContent('Snapshot current')
                    : pageType === 'Table'
                      ? pageContentCurrentTable
                      : flatPageContent('current'),
        })

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
