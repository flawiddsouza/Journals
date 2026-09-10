import Table from '../../src/components/PageTypes/Table.svelte'
import { eventStore } from '../../src/stores.js'

const content = {
    columns: [
        {
            name: 'value',
            label: 'Value',
            type: '',
            filterable: 'Yes',
            autocomplete: 'Yes',
        },
    ],
    items: [{ value: 'A' }, { value: 'B' }, { value: 'C' }],
    totals: {},
    widths: {},
    note: '',
    ...window.tableFixture,
}
window.tableSaves = []
window.fetch = async (input, options = {}) => {
    const pathname = new URL(typeof input === 'string' ? input : input.url)
        .pathname
    if (options.method === 'PUT') {
        window.tableSaves.push({
            pathname,
            content: JSON.parse(JSON.parse(options.body).pageContent),
        })
    }
    return new Response(
        JSON.stringify(
            pathname.startsWith('/pages/content/')
                ? {
                      content: JSON.stringify(
                          window.tablePageFixtures?.[
                              pathname.split('/').at(-1)
                          ] ?? content,
                      ),
                  }
                : {},
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
}
const table = new Table({
    target: document.getElementById('app'),
    props: { pageId: 42 },
})
window.tableHarness = {
    destroy: () => table.$destroy(),
    setProps: (props) => table.$set(props),
    configure: () => eventStore.set({ event: 'configureTable' }),
    exitConfiguration: () => eventStore.set({ event: 'tableConfigureExit' }),
}
