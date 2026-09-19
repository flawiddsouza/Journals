import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { COLUMN_OPTIONS, editColumns } from './tableColumns'
import { editRows, readRows } from './tableRows'
import { assertLinksExist, assertWritable, loadTable, mutates, pageSchema, readOnly, revisionSchema, run, savePage, writeDenied } from './toolkit'

/**
 * get_table_rows, edit_table_rows and edit_table_columns: the data in a Table
 * page and the columns that shape it. The scripts behind a table are the other
 * three table tools, in mcp.ts.
 */

const CELL_FORM =
  'A cell is one line of text. **bold**, *italic*, ~~strike~~, `code`, [label](https://address), [[Page name|id]] and <br> for a line break work in it, and a backslash keeps a character literal (\\*). Numbers and dates are just text: write them the way the rest of the column does, because the table\'s scripts parse that text.'

const DEFAULT_LIMIT = 100

const columnOptions = {
  label: z.string().optional().describe('Heading shown for the column. Defaults to its name'),
  wrap: z.enum(COLUMN_OPTIONS.wrap).optional().describe("'' wraps long text, 'No' keeps it on one line"),
  align: z.enum(COLUMN_OPTIONS.align).optional().describe("'' is left"),
  type: z
    .enum(COLUMN_OPTIONS.type)
    .optional()
    .describe("'' is a normal cell, 'Input (Plain Text)' drops formatting on entry. A computed column is made by set_table_script, not here. Setting type on a computed column turns it back into a stored one and discards its script"),
  autocomplete: z.enum(COLUMN_OPTIONS.autocomplete).optional().describe("'Yes' suggests the column's existing values while typing"),
  filterable: z.enum(COLUMN_OPTIONS.filterable).optional().describe("'Yes' gives the column a filter button in the app. Which values are filtered is chosen in the app and is not saved"),
  width: z.string().optional().describe("A length like 120px or 12em. '' means automatic"),
}

const valuesSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))

export function registerTableRowTools(server: McpServer, { username, canWrite }: { username: string; canWrite: boolean }) {
  server.registerTool(
    'get_table_rows',
    {
      title: "Read a table's rows",
      description: [
        'Rows of a Table page, as text keyed by column name, with each row\'s number. Computed columns come back with the value their script produces for that row, or "#ERROR ..." when it throws.',
        'Large tables come back in windows: pass start and limit, or a negative start to read from the end (-20 is the last 20 rows). search keeps only rows where a stored column contains the text, case-insensitively, and the window then applies to the matches; each row still carries its real number.',
        'Row numbers are positions, starting at 0. They change when rows are added or removed, so take them from a read made at the same revision as the edit.',
        CELL_FORM,
      ].join(' '),
      inputSchema: z.object({
        page: pageSchema,
        start: z.number().int().optional().describe('First row to return, 0-based. Negative counts from the end. Default 0'),
        limit: z.number().int().min(1).max(500).optional().describe(`How many rows to return. Default ${DEFAULT_LIMIT}`),
        search: z.string().optional().describe('Only rows where some stored column contains this text'),
        columns: z.array(z.string()).optional().describe('Only these columns. Default all. Leaving computed columns out skips running their scripts'),
        totals: z.boolean().optional().describe('Also run the footer total scripts and return what they show'),
      }),
      annotations: readOnly,
    },
    async ({ page, start, limit, search, columns, totals }) =>
      run(async () => {
        const { info, doc, revision } = await loadTable(username, page)
        return {
          page: { id: info.id, name: info.name },
          revision,
          ...readRows(doc, { start, limit: limit ?? DEFAULT_LIMIT, search, columns, totals }),
          viewOnly: Boolean(info.view_only || info.parent_view_only),
        }
      }),
  )

  server.registerTool(
    'edit_table_rows',
    {
      title: "Add, change and remove a table's rows",
      description: [
        'One batch of row changes, saved together as a single page history entry: update sets cells in existing rows, remove deletes rows, add puts new rows at the bottom, or above row addBefore.',
        'Every row number in the batch means the table as get_table_rows showed it at this revision, whatever else the batch does. A bad row number or column name refuses the whole batch.',
        'Only the columns named in a row are touched; a new row leaves the others empty. Computed columns cannot be set. Adding to a new table replaces its single blank row, and removing every row leaves one blank row, as the app does.',
        CELL_FORM,
        'A table that is open in a browser tab keeps its own copy. After a save here, that tab refuses its own next save and offers to reload.',
      ].join(' '),
      inputSchema: z.object({
        page: pageSchema,
        revision: revisionSchema,
        update: z
          .array(z.object({ row: z.number().int().describe('Row number from get_table_rows'), values: valuesSchema.describe('Column name to new cell text') }))
          .optional(),
        remove: z.array(z.number().int()).optional().describe('Row numbers to delete'),
        add: z.array(valuesSchema).optional().describe('New rows, each a map of column name to cell text'),
        addBefore: z.number().int().optional().describe('Insert the new rows above this row number instead of at the bottom'),
      }),
      annotations: { ...mutates, destructiveHint: true, idempotentHint: false },
    },
    async ({ page, revision, update, remove, add, addBefore }) => {
      if (!canWrite) return writeDenied
      return run(async () => {
        const loaded = await loadTable(username, page)
        assertWritable(loaded, revision)
        const summary = editRows(loaded.doc, { update, remove, add, addBefore })
        const content = JSON.stringify(loaded.doc)
        await assertLinksExist(username, loaded.content, content)
        const saved = await savePage(username, loaded, content)
        return { saved: true, revision: saved, rowCount: loaded.doc.items.length, ...summary }
      })
    },
  )

  server.registerTool(
    'edit_table_columns',
    {
      title: "Add, change, remove and reorder a table's columns",
      description: [
        'One batch of column changes: update sets options on existing columns and renames them, remove deletes columns with everything in them, add creates columns, order puts them in sequence. They apply in that order and a bad name refuses the whole batch. update, remove and before name columns as get_table_config shows them now; order names them as the batch leaves them and has to list every column.',
        'A rename carries the cells, the total and the width along. Scripts are not rewritten: they read a column as item["Name"], so the result lists every script that mentions a renamed or removed column under scriptsToCheck. Fix those with set_table_script.',
        'This is also how a new Table page gets its first columns. Option values are the ones the app stores, the same ones get_table_config shows.',
        'A table that is open in a browser tab keeps its own copy. After a save here, that tab refuses its own next save and offers to reload.',
      ].join(' '),
      inputSchema: z.object({
        page: pageSchema,
        revision: revisionSchema,
        update: z.array(z.object({ column: z.string().describe('The column as it is named now'), name: z.string().optional().describe('New name, to rename it'), ...columnOptions })).optional(),
        remove: z.array(z.string()).optional().describe('Names of columns to delete, with their data'),
        add: z.array(z.object({ name: z.string(), before: z.string().optional().describe('Insert before this column. Default: at the end'), ...columnOptions })).optional(),
        order: z.array(z.string()).optional().describe('Every column name, in the order they should appear'),
      }),
      annotations: { ...mutates, destructiveHint: true, idempotentHint: false },
    },
    async ({ page, revision, update, remove, add, order }) => {
      if (!canWrite) return writeDenied
      return run(async () => {
        const loaded = await loadTable(username, page)
        assertWritable(loaded, revision)
        const summary = editColumns(loaded.doc, { update, remove, add, order })
        const content = JSON.stringify(loaded.doc)
        const saved = await savePage(username, loaded, content)
        return { saved: true, revision: saved, ...summary }
      })
    },
  )
}
