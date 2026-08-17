import TaskList from '../../src/components/PageTypes/TaskList.svelte'

const mode = new URLSearchParams(location.search).get('mode')

if (mode === 'error') {
    window.fetch = async () => new Response('', { status: 503 })
}

const taskList = new TaskList({
    target: document.getElementById('task-list'),
    props: {
        pageId: mode === 'error' ? 1 : null,
        pageContentOverride: mode === 'override' ? null : undefined,
        viewOnly: mode === 'override',
    },
})

window.taskListHarness = {
    setContent(pageContentOverride) {
        taskList.$set({ pageContentOverride })
    },
}
