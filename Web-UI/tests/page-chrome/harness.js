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

// Serve every request an empty page body. Page types differ in how they parse it,
// but all of them settle into a rendered (if empty) state, which is all the chrome
// assertions need -- and it keeps the suite independent of a running API.
window.fetch = async () =>
    new Response(JSON.stringify({ content: '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })

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
        },
    },
})
