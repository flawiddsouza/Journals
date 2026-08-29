import PageNav from '../../src/components/PageNav.svelte'

const type = new URLSearchParams(location.search).get('type') || 'FlatPageV2'

new PageNav({
    target: document.getElementById('app'),
    props: {
        activePage: {
            id: 1,
            name: `${type} review`,
            type,
            view_only: false,
            parent_id: null,
        },
    },
})
