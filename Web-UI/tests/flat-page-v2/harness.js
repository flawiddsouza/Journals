import FlatPageV2 from '../../src/components/PageTypes/FlatPageV2.svelte'

const params = new URLSearchParams(location.search)
const viewOnly = params.get('viewOnly') === '1'
const contentType = params.get('content')
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
const checklistDocument = {
    type: 'doc',
    content: [
        {
            type: 'taskList',
            content: [
                {
                    type: 'taskItem',
                    attrs: { checked: true },
                    content: [
                        {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Completed task' }],
                        },
                    ],
                },
            ],
        },
    ],
}
const splitChecklistDocument = {
    type: 'doc',
    content: [
        {
            type: 'taskList',
            content: [
                {
                    type: 'taskItem',
                    attrs: { checked: true },
                    content: [
                        {
                            type: 'paragraph',
                            content: [
                                { type: 'text', text: 'Previous task' },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            type: 'taskList',
            content: [
                {
                    type: 'taskItem',
                    attrs: { checked: false },
                    content: [
                        {
                            type: 'paragraph',
                            content: [
                                { type: 'text', text: 'Later task' },
                            ],
                        },
                    ],
                },
                {
                    type: 'taskItem',
                    attrs: { checked: false },
                    content: [{ type: 'paragraph' }],
                },
            ],
        },
    ],
}

const initialDocument =
    contentType === 'split-checklist' ? splitChecklistDocument : emptyDocument

let pageContentSaved = null

window.fetch = async (input, options = {}) => {
    const method = (options.method || 'GET').toUpperCase()

    if (method === 'GET') {
        return Response.json({ content: JSON.stringify(initialDocument) })
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
        pageContentOverride: viewOnly
            ? contentType === 'checklist'
                ? checklistDocument
                : nestedDocument
            : undefined,
    },
})

window.flatPageV2Harness = {
    getPageContentSaved() {
        return pageContentSaved
    },
}
