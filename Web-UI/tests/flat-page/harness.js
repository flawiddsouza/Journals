// Test-only harness: mounts the real FlatPage.svelte. The spec answers its API
// calls. Not part of the shipped app -- vite.config.ts only builds index.html
// and page/.
import FlatPage from '../../src/components/PageTypes/FlatPage.svelte'

new FlatPage({
    target: document.getElementById('app'),
    props: { pageId: 1 },
})
