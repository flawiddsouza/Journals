import { Schema, type NodeSpec } from 'prosemirror-model'

/**
 * Test only. The editors' schemas, rebuilt from the Tiptap extension lists at
 * FlatPageV2.svelte:171-208 and TaskList.svelte:22-45, so tests can check that
 * a document this server writes is one the app can load. A Flat Page v2 page
 * whose content fails to load stays on "Loading..." forever.
 *
 * When an editor gains a node or an attribute, add it here too.
 */

const cell: NodeSpec = {
  content: 'block+',
  attrs: { colspan: { default: 1 }, rowspan: { default: 1 }, colwidth: { default: null }, align: { default: null }, nowrap: { default: false } },
}

const marks = { bold: {}, code: { excludes: '_' }, italic: {}, strike: {} }

const shared: Record<string, NodeSpec> = {
  paragraph: { content: 'inline*', group: 'block' },
  text: { group: 'inline' },
  hardBreak: { inline: true, group: 'inline' },
  taskList: { content: 'taskItem+', group: 'block list' },
  taskItem: { content: 'paragraph block*', attrs: { checked: { default: false } } },
}

export const flatPageV2Schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    ...shared,
    heading: { content: 'inline*', group: 'block', attrs: { level: { default: 1 } } },
    codeBlock: { content: 'text*', marks: '', group: 'block', code: true, attrs: { language: { default: null } } },
    bulletList: { content: 'listItem+', group: 'block list' },
    orderedList: { content: 'listItem+', group: 'block list', attrs: { start: { default: 1 }, type: { default: null } } },
    listItem: { content: 'paragraph block*' },
    pageLink: { inline: true, group: 'inline', atom: true, attrs: { pageId: { default: null }, pageName: { default: '' } } },
    externalLink: { inline: true, group: 'inline', atom: true, attrs: { href: { default: null }, label: { default: '' } } },
    image: { inline: true, group: 'inline', atom: true, attrs: { src: { default: null }, alt: { default: null }, title: { default: null } } },
    table: { content: 'tableRow+', group: 'block' },
    tableRow: { content: '(tableCell | tableHeader)*' },
    tableHeader: cell,
    tableCell: cell,
  },
  marks,
})

export const taskListSchema = new Schema({ nodes: { doc: { content: 'taskList' }, ...shared }, marks })

/** Throws when the content is not a document the editor would accept. */
export function assertLoads(schema: Schema, content: string): void {
  schema.nodeFromJSON(JSON.parse(content)).check()
}
