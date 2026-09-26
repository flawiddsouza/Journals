import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
// The app's own modules, not copies.
import { createTableComputeEngine } from '../../Web-UI/src/helpers/tableComputeEngine.js'
import { createEmptyTaskListDocument, taskTextToItems } from '../../Web-UI/src/helpers/taskList.js'
import { diffTableContent } from '../../Web-UI/src/helpers/tableHistoryDiff.js'
import { evaluateScript } from './evaluate'
import { linesOf } from './lines/edit'
import { proseCodec } from './lines/prose'
import { MAX_MODULES } from './miniApp'
import { diffTableDocuments } from './pageHistory'
import { PAGE_TYPES } from './pageTypes'
import { COLUMN_OPTIONS } from './tableColumns'
import { type TableDocument, parseTableDocument } from './tableDoc'
import { WIDGET_OPTIONS } from './tableStats'

/**
 * This server repeats things the app decides: which page types exist, what a
 * saved table carries, how a computed column resolves. Each test here compares
 * one of those with the app's source or runs the app's own module beside ours,
 * so a change on the app's side fails here instead of drifting quietly.
 *
 * A failure means: the app changed. Bring the named MCP file in line, then
 * update the expectation.
 */

const ui = (path: string) => readFileSync(`${import.meta.dir}/../../Web-UI/src/${path}`, 'utf8')

describe('constants copied from the app', () => {
  test('page types are the ones the add page dialog offers (pageTypes.ts)', () => {
    const offered = [...ui('components/Modals/AddPageModal.svelte').matchAll(/value: '([^']+)'/g)].map((m) => m[1])
    expect([...PAGE_TYPES]).toEqual(offered as typeof PAGE_TYPES[number][])
  })

  test('column option values are the ones the column form offers (tableColumns.ts)', () => {
    const source = ui('components/PageTypes/Table.svelte')
    const optionsOf = (label: string) => {
      const select = source.match(new RegExp(`aria-label="${label}"[^>]*>([\\s\\S]*?)</select>`))![1]!
      return [...select.matchAll(/<option(?: value="([^"]*)")?>([^<]*)<\/option>/g)].map((m) => m[1] ?? m[2])
    }
    expect(optionsOf('Wrap')).toEqual([...COLUMN_OPTIONS.wrap])
    expect(optionsOf('Align')).toEqual([...COLUMN_OPTIONS.align])
    expect(optionsOf('Autocomplete')).toEqual([...COLUMN_OPTIONS.autocomplete])
    expect(optionsOf('Filter')).toEqual([...COLUMN_OPTIONS.filterable])
    // Computed is offered by the app too. Here it is set_table_script's job.
    expect(optionsOf('Type')).toEqual([...COLUMN_OPTIONS.type, 'Computed'])
  })

  test('stats widget options are the ones the app stores (tableStats.ts)', () => {
    const source = ui('components/PageTypes/TableStats.svelte')
    const setOf = (name: string) => {
      const listed = source.split(`const ${name} = new Set([`)[1]!.split('])')[0]!
      return [...listed.matchAll(/'([^']+)'|(\d+)/g)].map((m) => m[1] ?? Number(m[2]))
    }
    expect(setOf('validTypes')).toEqual([...WIDGET_OPTIONS.type])
    expect(setOf('validSpans')).toEqual([...WIDGET_OPTIONS.colSpan])
    expect(setOf('validAligns')).toEqual([...WIDGET_OPTIONS.align])
    // The widths the app offers, which is what colSpan means.
    expect(JSON.parse(source.match(/const SPAN_OPTIONS = (\[[^\]]*\])/)![1]!)).toEqual([...WIDGET_OPTIONS.colSpan])
    // align is written for a stat widget and left off a chart.
    expect(source).toContain("...(type === 'stat' && { align })")
  })

  test('a saved table carries the keys the app saves (tableDoc.ts)', () => {
    const saved = ui('components/PageTypes/Table.svelte').match(/pageSavePending = \{\s*pageId,\s*content: \{([^}]*)\}/)![1]!
    const keys = saved.split(',').map((k) => k.trim()).filter(Boolean)
    // stats is the one key the app reads with a fallback, so a new table may leave it out.
    expect([...Object.keys(parseTableDocument(null)), 'stats'].sort()).toEqual(keys.sort())
  })

  test('the Mini App module limit and saved shape (miniApp.ts)', () => {
    const source = ui('components/PageTypes/MiniApp.svelte')
    expect(Number(source.match(/const MAX_MODULES = (\d+)/)![1])).toBe(MAX_MODULES)
    expect(source).toContain('JSON.stringify({ files: { ...files, modules }, kv })')
  })

  test('the editors use the extensions testSchema.ts was written from', () => {
    const extensions = (file: string) =>
      [...ui(file).matchAll(/from '@tiptap\/(starter-kit|extension-[a-z-]+)'/g)].map((m) => m[1]).sort()
    expect(extensions('components/PageTypes/FlatPageV2.svelte')).toEqual(
      ['extension-image', 'extension-paragraph', 'extension-table', 'extension-table-cell', 'extension-table-header', 'extension-table-row', 'extension-task-item', 'extension-task-list', 'starter-kit'],
    )
    expect(extensions('components/PageTypes/TaskList.svelte')).toEqual(['extension-task-item', 'extension-task-list', 'starter-kit'])
    // And the StarterKit parts each editor switches off, which decide what the schema lacks.
    expect(ui('components/PageTypes/FlatPageV2.svelte')).toMatch(/StarterKit\.configure\(\{\s*paragraph: false,\s*horizontalRule: false,\s*blockquote: false,?\s*\}\)/)
  })
})

describe("the app's compute engine and the harness agree (evaluate.ts)", () => {
  const doc: TableDocument = {
    columns: [
      { name: 'Amount' },
      { name: 'Double', type: 'Computed', expression: "return dbl(Number(item['Amount']))" },
      { name: 'OnDouble', type: 'Computed', expression: "return item['Double'] + 1" },
      { name: 'Running', type: 'Computed', expression: "return items.slice(0, rowIndex + 1).reduce((a, r) => a + Number(r['Amount']), 0)" },
      { name: 'Prev', type: 'Computed', expression: "return rowIndex ? items[rowIndex - 1]['OnDouble'] : 'first'" },
      // for..of, spread and Array.from all read items[Symbol.iterator] first.
      { name: 'Iterated', type: 'Computed', expression: "let sum = 0; for (const r of items) sum += Number(r['Amount']); return sum" },
      { name: 'Spread', type: 'Computed', expression: "return [...items].map((r) => r['Double']).join(',')" },
      { name: 'Throws', type: 'Computed', expression: "if (rowIndex === 1) throw new Error('no'); return item.hasOwnProperty('Amount')" },
      { name: 'ReadsThrows', type: 'Computed', expression: "return 'saw: ' + item['Throws']" },
      { name: 'LoopA', type: 'Computed', expression: "return 'a' + item['LoopB']" },
      { name: 'LoopB', type: 'Computed', expression: "return 'b' + item['LoopA']" },
    ],
    items: [{ Amount: '1' }, { Amount: '2' }, { Amount: '3' }],
    customFunctions: 'function dbl(x){return x*2}',
  }

  for (const column of doc.columns.filter((c) => c.expression)) {
    test(column.name, () => {
      // A fresh engine each time. The app caches what it has worked out, so
      // with a cycle on the page a value depends on which column ran first.
      const engine = createTableComputeEngine()
      engine.setColumns(doc.columns)
      engine.setItems(doc.items)
      engine.setCustomFunctions(doc.customFunctions)
      // The app logs the error it swallows. Keep the test output readable.
      const error = console.error
      console.error = () => {}
      const fromApp = doc.items.map((_, row) => String(engine.getComputedValue(row, column.name)))
      console.error = error

      const result = evaluateScript(doc, 'computed', column.expression!, column.name, { rows: [0, 1, 2] })
      const fromHarness = doc.items.map((_, row) => result.sample.find((s) => s.rowIndex === row)?.output ?? 'error evaluating given expression')
      expect(fromHarness).toEqual(fromApp)
    })
  }
})

describe("the app's table history view and get_page_history agree (pageHistory.ts)", () => {
  const older: TableDocument = {
    columns: [
      { name: 'Item', label: '' },
      { name: 'Qty', label: '' },
      { name: 'Note', label: '' },
    ],
    items: [
      { Item: 'Milk', Qty: '2', Note: '' },
      { Item: 'Bread', Qty: '1', Note: 'wheat' },
      { Item: 'Eggs', Qty: '12', Note: '' },
      { Item: 'Apples', Qty: '6', Note: '' },
    ],
    totals: {},
    stats: { widgets: [] },
    startupScript: 'a\nb',
  }
  const newer: TableDocument = {
    columns: [
      { name: 'Qty', label: 'Quantity', align: 'Right' },
      { name: 'Item', label: '' },
      { name: 'Total', type: 'Computed', expression: "return item['Qty']" },
    ],
    items: [
      { Item: 'Milk', Qty: '3', Total: '' },
      { Item: 'Bread', Qty: '1' },
      { Item: 'Apples', Qty: '6' },
      { Item: '<b>Butter</b>', Qty: '1' },
    ],
    totals: {},
    widths: { Item: '140px' },
    startupScript: 'a\nc',
  }

  test('the same columns, rows and settings', () => {
    const fromApp = diffTableContent(older, newer)
    const ours = diffTableDocuments(older, newer)
    expect(ours.rows).toEqual(fromApp.rows)
    expect(ours.rowColumns).toEqual(fromApp.rowColumns)
    expect(ours.columnsAdded).toEqual(fromApp.columnsAdded)
    expect(ours.columnsRemoved).toEqual(fromApp.columnsRemoved)
    expect(ours.columnsReordered).toBe(fromApp.columnsReordered)
    // The app labels fields and settings for people; these carry their keys.
    expect(ours.columnsChanged.map((c) => [c.name, c.fields.map((f) => [f.before, f.after])])).toEqual(
      fromApp.columnsChanged.map((c: { name: string; fields: { before: string; after: string }[] }) => [c.name, c.fields.map((f) => [f.before, f.after])]),
    )
    expect(ours.settings.map((s) => [s.before, s.after])).toEqual(fromApp.settings.map((s: { before: string; after: string }) => [s.before, s.after]))
    expect(ours.settingsOther).toHaveLength(fromApp.settingsOther.length)
  })
})

describe("the app's task list helpers and the Task List codec agree (lines/prose.ts)", () => {
  const tasks = proseCodec('TaskList')

  test('a blank task list', () => {
    expect(JSON.parse(tasks.write([]))).toEqual(createEmptyTaskListDocument())
  })

  test('plain text becomes the same tasks the app makes of a paste', () => {
    const text = ['- [x] done', '- [ ] open', '  - [ ] nested', '- bullet', 'plain line', '\tindented with a tab'].join('\n')
    const ours = JSON.parse(tasks.write(tasks.parse(text.split('\n')))).content[0].content
    expect(ours).toEqual(taskTextToItems(text))
    expect(linesOf(tasks.parse(text.split('\n')))).toHaveLength(6)
  })
})
