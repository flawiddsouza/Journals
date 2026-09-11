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
const fullPage = new URLSearchParams(location.search).has('fullPage')
if (fullPage) {
    await import('../../src/components/Frame.svelte')
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = '/global.css'
    document.head.append(css)
    const layout = document.createElement('style')
    layout.textContent = `
        body { margin: 0; font: 16px/1.5 system-ui; }
        #app { display: grid; height: 100dvh; grid-template-columns: minmax(0, 1fr); }
    `
    document.head.append(layout)
    const sidebar = document.createElement('div')
    sidebar.className = 'journal-left-sidebar'
    sidebar.hidden = true
    document.getElementById('app').append(sidebar)
}
const Component = fullPage
    ? (await import('../../src/components/Page.svelte')).default
    : Table
const table = new Component({
    target: document.getElementById('app'),
    props: fullPage
        ? {
              className: 'journal-page-container',
              updatePageName: () => {},
              activePage: {
                  id: 42,
                  name: 'Job + Salary',
                  type: 'Table',
                  created_at: '2021-04-03 22:40:00',
                  locked: false,
                  view_only: false,
                  hide_title: false,
                  ...window.tablePageProps,
              },
          }
        : { pageId: 42 },
})
if (fullPage && new URLSearchParams(location.search).has('pageActions')) {
    const { default: PageNav } =
        await import('../../src/components/PageNav.svelte')
    const nav = document.createElement('nav')
    nav.style.cssText =
        'display: flex; justify-content: flex-end; padding: 0.5rem; position: relative; z-index: 1'
    document.body.prepend(nav)
    document.body.style.cssText =
        'display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100dvh'
    document.getElementById('app').style.height = '100%'
    new PageNav({
        target: nav,
        props: {
            activePage: {
                id: 42,
                type: 'Table',
                view_only: false,
                ...window.tablePageProps,
            },
        },
    })
}
window.tableHarness = {
    destroy: () => table.$destroy(),
    setProps: (props) => table.$set(props),
    configure: () => eventStore.set({ event: 'configureTable' }),
    exitConfiguration: () => eventStore.set({ event: 'tableConfigureExit' }),
}
