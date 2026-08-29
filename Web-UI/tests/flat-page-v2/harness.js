import FlatPageV2 from '../../src/components/PageTypes/FlatPageV2.svelte'

const params = new URLSearchParams(location.search)
const viewOnly = params.get('viewOnly') === '1'
const emptyDocument = {
    type: 'doc',
    content: [{ type: 'paragraph' }],
}
const nestedDocument = {
    type: 'doc',
    content: [
        {
            type: 'bulletList',
            content: [
                {
                    type: 'listItem',
                    content: [
                        {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Parent' }],
                        },
                        {
                            type: 'bulletList',
                            content: [
                                {
                                    type: 'listItem',
                                    content: [
                                        {
                                            type: 'paragraph',
                                            content: [
                                                {
                                                    type: 'text',
                                                    text: 'Child',
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
}

let pageContentSaved = null

window.fetch = async (input, options = {}) => {
    const method = (options.method || 'GET').toUpperCase()

    if (method === 'GET') {
        return Response.json({ content: JSON.stringify(emptyDocument) })
    }

    if (method === 'PUT') {
        pageContentSaved = JSON.parse(options.body).pageContent
        return Response.json({ success: true })
    }

    return Response.json({ success: true })
}

new FlatPageV2({
    target: document.getElementById('flat-page-v2'),
    props: {
        pageId: viewOnly ? null : 1,
        viewOnly,
        pageContentOverride: viewOnly ? nestedDocument : undefined,
    },
})

window.flatPageV2Harness = {
    getPageContentSaved() {
        return pageContentSaved
    },
}
