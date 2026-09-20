import { CodecError } from './lines/inline'
import { type StatsWidget, type TableDocument } from './tableDoc'

/**
 * Adding, changing, removing and ordering the stats widgets of a Table page,
 * the way handleSave, removeWidget and setColSpan in TableStats.svelte:59-89
 * do it. set_table_script writes a widget's expression; everything else about
 * a widget lives here, and a widget has to exist before it can hold one.
 *
 * Option values are the ones the app stores, so they match what
 * get_table_config shows. align is kept for a 'stat' widget only, which is
 * what the app writes (TableStats.svelte:64,69).
 */

export const WIDGET_OPTIONS = {
  type: ['stat', 'bar', 'line', 'pie'],
  colSpan: [2, 3, 4, 6],
  align: ['left', 'center', 'right'],
} as const

export type WidgetType = (typeof WIDGET_OPTIONS.type)[number]
export type WidgetOptions = {
  title?: string
  type?: WidgetType
  colSpan?: (typeof WIDGET_OPTIONS.colSpan)[number]
  align?: (typeof WIDGET_OPTIONS.align)[number]
  expression?: string
}

export type WidgetEdit = {
  update?: ({ widget: string } & WidgetOptions)[]
  remove?: string[]
  add?: ({ title: string; type: WidgetType; before?: string } & Omit<WidgetOptions, 'title' | 'type'>)[]
  order?: string[]
}

const DEFAULT_SPAN = 2
const DEFAULT_ALIGN = 'left'

const widgetsOf = (doc: TableDocument) => doc.stats?.widgets ?? []

function checkTitle(title: string): string {
  const clean = title.trim()
  if (!clean) throw new CodecError("A widget title can't be empty")
  if (/[\r\n]/.test(clean)) throw new CodecError('A widget title is one line')
  return clean
}

/** A chart carries no align. The app drops it when the type changes, so a
 *  widget that goes back to 'stat' starts from the default again. */
function setAlign(widget: StatsWidget, align: WidgetOptions['align']): void {
  if (widget.type !== 'stat') {
    delete widget.align
    return
  }
  if (align !== undefined) widget.align = align
  else if (widget.align === undefined) widget.align = DEFAULT_ALIGN
}

/**
 * Applies one batch to the document in place: updates first, then removals,
 * then new widgets, then the order. `update`, `remove` and `before` name
 * widgets by the id get_table_config shows; `order` names them as the batch
 * leaves them, and cannot be given alongside `add`, whose ids are minted here.
 */
export function editWidgets(
  doc: TableDocument,
  edit: WidgetEdit,
  newId: () => string = () => crypto.randomUUID(),
): { widgets: { id: string; title: string; type: string }[]; added: string[]; removed: string[] } {
  const update = edit.update ?? []
  const remove = [...new Set(edit.remove ?? [])]
  const add = edit.add ?? []
  if (!update.length && !remove.length && !add.length && !edit.order) {
    throw new CodecError('Nothing to change: pass update, remove, add or order')
  }

  // Worked out on a copy, so a batch that fails half way changes nothing.
  const next: StatsWidget[] = JSON.parse(JSON.stringify(widgetsOf(doc)))
  // The page as the caller has it, not the half-applied copy: a removal
  // earlier in the same batch is undone by the refusal, so listing what is
  // left of the copy would name a table that never existed.
  const known = () => {
    const held = widgetsOf(doc)
    return held.length ? held.map((w) => `${w.id} (${w.title})`).join(', ') : 'no widgets yet'
  }
  const find = (id: string) => {
    const widget = next.find((w) => w.id === id)
    if (!widget) throw new CodecError(`No stats widget with id ${id}. This table has: ${known()}`)
    return widget
  }

  for (const { widget: id, title, type, colSpan, align, expression } of update) {
    const widget = find(id)
    if (title !== undefined) widget.title = checkTitle(title)
    if (type !== undefined) widget.type = type
    if (colSpan !== undefined) widget.colSpan = colSpan
    if (expression !== undefined) widget.expression = expression
    // Only when the change is about align, or about the type that decides
    // whether there is one. An update names what it changes, and a widget
    // saved before align existed is not asked to gain one by a retitling.
    if (type !== undefined || align !== undefined) setAlign(widget, align)
  }

  const removed: string[] = []
  for (const id of remove) {
    find(id)
    next.splice(next.findIndex((w) => w.id === id), 1)
    removed.push(id)
  }

  const added: string[] = []
  for (const { title, type, colSpan, align, expression, before } of add) {
    const widget: StatsWidget = {
      id: newId(),
      title: checkTitle(title),
      type,
      colSpan: colSpan ?? DEFAULT_SPAN,
      expression: expression ?? '',
    }
    setAlign(widget, align)
    const at = before === undefined ? next.length : next.indexOf(find(before))
    next.splice(at, 0, widget)
    added.push(widget.id)
  }

  if (edit.order && add.length) {
    // order has to name every widget, and a widget added here is given its id
    // here, so the caller could not have written it. The batch is refused
    // whole, so the ids minted above are never saved and naming them would
    // only send the caller after widgets that do not exist.
    throw new CodecError(
      'order cannot name a widget added in the same batch, because its id is given here and this batch is refused whole. Place a new widget with before, or add it first and order in a second call.',
    )
  }

  if (edit.order) {
    const ids = next.map((w) => w.id)
    const same = edit.order.length === ids.length && new Set(edit.order).size === ids.length && edit.order.every((id) => ids.includes(id))
    if (!same) throw new CodecError(`order has to list every widget exactly once. After this change the widgets are: ${ids.join(', ') || 'none'}`)
    next.sort((a, b) => edit.order!.indexOf(a.id) - edit.order!.indexOf(b.id))
  }

  // The app reads stats with a fallback but saves the key every time
  // (Table.svelte:172, 247), so a page that has been through here carries it.
  // Spread as the app's own writer does (Table.svelte:1826): widgets is all
  // stats holds today, and anything it gains later is not ours to drop.
  doc.stats = { ...(doc.stats ?? {}), widgets: next }
  return { widgets: next.map((w) => ({ id: w.id, title: w.title, type: w.type })), added, removed }
}
