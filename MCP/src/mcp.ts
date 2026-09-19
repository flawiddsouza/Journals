import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { registerDocTools } from './docTools'
import { registerFileTools } from './fileTools'
import { evaluateScript, type ScriptTarget } from './evaluate'
import { registerMiniAppTools } from './miniAppTools'
import { SCOPES } from './oauth'
import { registerPageTools } from './pageTools'
import { registerTableRowTools } from './tableRowTools'
import {
  chooseSample,
  profileColumn,
  type TableDocument,
} from './tableDoc'
import {
  ToolError,
  assertWritable,
  loadTable,
  mutates,
  pageSchema,
  readOnly,
  revisionSchema,
  run,
  savePage,
  writeDenied,
} from './toolkit'

/**
 * The MCP server. The Table script tools are registered here; the rest live in
 * pageTools.ts, tableRowTools.ts, docTools.ts, miniAppTools.ts and fileTools.ts.
 * Conventions follow streaks-and-todo/src/mcp.ts: snake_case names, zod
 * schemas, annotation hints.
 */

const TARGETS = [
  'computed',
  'total',
  'colStyle',
  'rowStyle',
  'startup',
  'customFns',
  'statsWidget',
] as const

/**
 * Runtime contracts, quoted from Table.svelte:1468-1505 and
 * TableStats.svelte:39-41 rather than paraphrased. They are what the in-app
 * panel already tells a model, and they are the authoritative description of
 * each field's arity and return value.
 */
const CONTRACTS: Record<ScriptTarget, string> = {
  computed:
    "Runs as new Function('items','rowIndex','item','columnName', customFunctions + code), once per visible cell. Return the computed display value as a string, number or HTML. Read-only; no DOM access. Reach other columns via item['Other Column Name']; computed columns resolve to their computed value when read, so one computed column can build on another.",
  total:
    "Runs as new Function('items','rowIndex','item','columnName', customFunctions + code) with rowIndex and item both null. items is enriched, so each row already carries its computed column values. Iterate items and read row['ColName']. Return the footer content.",
  colStyle:
    "Runs as new Function('items','rowIndex','item','columnName', customFunctions + code), once per visible cell. item is enriched. The cell value is item[columnName]. Return an inline CSS string, for example 'color: red; font-weight: bold'.",
  rowStyle:
    "Runs as new Function('items','rowIndex','item', customFunctions + code), once per visible row. Note there is no columnName parameter. item is enriched. Return an inline CSS string.",
  startup:
    "Runs once on load as new Function('rows', code). Mutate the rows array to add, update or remove rows. Return nothing. No network access.",
  customFns:
    'Prepended to every computed, total, colStyle and rowStyle expression on the page. Define pure helpers only, no side effects on load. Note it is NOT prepended to stats widget expressions.',
  statsWidget:
    "Runs as new Function('items', expression) with enriched items, so each row carries its computed column values. customFunctions is NOT in scope here, unlike every other target, though computed columns it feeds still use them. A 'stat' widget returns a scalar; 'bar', 'line' and 'pie' return { labels: string[], values: number[] }.",
}

const CELL_HTML_NOTE =
  "Table cell values are HTML strings, not plain values. Derive text with String(v ?? '').replace(/<[^>]*>/g, '').trim() before comparing or parsing."

const targetSchema = z.enum(TARGETS).describe('Which script field. contracts in get_table_config describes each')
const columnSchema = z
  .string()
  .optional()
  .describe("Column name, required for computed, total and colStyle; ignored otherwise")
const widgetSchema = z
  .string()
  .optional()
  .describe('Stats widget id, required for statsWidget')

function resolveTarget(
  doc: TableDocument,
  target: ScriptTarget,
  column: string | undefined,
  widgetId: string | undefined,
): { columnName: string | null; current: string } {
  if (target === 'rowStyle') return { columnName: null, current: doc.rowStyle ?? '' }
  if (target === 'startup') return { columnName: null, current: doc.startupScript ?? '' }
  if (target === 'customFns') return { columnName: null, current: doc.customFunctions ?? '' }

  if (target === 'statsWidget') {
    if (!widgetId) throw new ToolError('statsWidget needs a widgetId')
    const widget = doc.stats?.widgets?.find((w) => w.id === widgetId)
    if (!widget) throw new ToolError(`No stats widget with id ${widgetId}`)
    return { columnName: null, current: widget.expression ?? '' }
  }

  if (!column) throw new ToolError(`${target} needs a column`)
  const found = doc.columns.find((c) => c.name === column)
  if (!found) {
    throw new ToolError(
      `No column named ${column}. This page has: ${doc.columns.map((c) => c.name).join(', ')}`,
    )
  }
  if (target === 'computed') return { columnName: column, current: found.expression ?? '' }
  if (target === 'colStyle') return { columnName: column, current: found.style ?? '' }
  return { columnName: column, current: doc.totals?.[column] ?? '' }
}

/** Applies a script to the document in place. */
function applyScript(
  doc: TableDocument,
  target: ScriptTarget,
  code: string,
  column: string | undefined,
  widgetId: string | undefined,
): void {
  if (target === 'rowStyle') return void (doc.rowStyle = code)
  if (target === 'startup') return void (doc.startupScript = code)
  if (target === 'customFns') return void (doc.customFunctions = code)
  if (target === 'statsWidget') {
    const widget = doc.stats?.widgets?.find((w) => w.id === widgetId)
    if (!widget) throw new ToolError(`No stats widget with id ${widgetId}`)
    widget.expression = code
    return
  }
  const found = doc.columns.find((c) => c.name === column)
  if (!found) throw new ToolError(`No column named ${column}`)
  if (target === 'computed') {
    found.expression = code
    // A column only computes once its type says so (Table.svelte:1670).
    found.type = 'Computed'
    return
  }
  if (target === 'colStyle') return void (found.style = code)
  doc.totals = { ...(doc.totals ?? {}), [column!]: code }
}

/** Every target whose code has customFunctions prepended, so a customFns edit
 *  can be checked against everything it feeds. */
function dependentsOf(doc: TableDocument): {
  target: ScriptTarget
  column: string | null
  code: string
}[] {
  const out: { target: ScriptTarget; column: string | null; code: string }[] = []
  for (const column of doc.columns) {
    if (column.expression) out.push({ target: 'computed', column: column.name, code: column.expression })
    if (column.style) out.push({ target: 'colStyle', column: column.name, code: column.style })
  }
  for (const [name, code] of Object.entries(doc.totals ?? {})) {
    if (code) out.push({ target: 'total', column: name, code })
  }
  if (doc.rowStyle) out.push({ target: 'rowStyle', column: null, code: doc.rowStyle })
  return out
}

function buildServer(username: string, scopes: string[], origin: string) {
  const server = new McpServer(
    { name: 'journals', version: '0.1.0' },
    {
      instructions: [
        'Reads and edits pages in a Journals notebook. Find a page id with search_pages, by name or by what the page says, or with list_pages narrowed by type, section or name. Which tools apply depends on the page type reported. create_page makes a new page in a section from list_sections; rename_page, move_page and delete_page manage it, and a deleted page goes to the recycle bin.',
        'FlatPage, FlatPageV2 and TaskList: get_page shows the page as numbered lines, edit_page replaces or inserts lines.',
        'Files and images on any page: create_file_upload mints a link to send a file to, and its response carries the markup to insert; list_page_files and create_file_download read them back.',
        'MiniApp: get_mini_app, then set_mini_app_files for the code and set_mini_app_data for what the app has stored.',
        'Table: get_table_rows reads the data, edit_table_rows changes it and edit_table_columns shapes the columns. For the JavaScript behind a table, get_table_config shows every script on the page plus per-column profiles. Always evaluate_table_script before set_table_script: it runs the candidate against the real rows and reports both the output and the cost, which is the only way to catch an expression that is correct but degrades the page.',
        'Every save needs the revision from the matching get tool and is refused if the page changed since, in the app or anywhere else, so read again after a refusal. Each save writes a page history entry, so it can be undone from the app.',
        CELL_HTML_NOTE,
      ].join(' '),
    },
  )

  const canWrite = scopes.includes(SCOPES.write)

  server.registerTool(
    'get_table_config',
    {
      title: 'Read a table\'s scripts and column profiles',
      description: [
        'The whole logic graph for one Table page: every column with its type, expression and style, plus totals, rowStyle, startupScript, customFunctions and stats widgets.',
        'Also returns a profile per column (distinct counts, inferred kind, how many values fail to parse) and a deliberately chosen sample of rows, including the empty, longest and unparseable ones.',
        'It returns a sample, not the data: use get_table_rows to read rows. For writing a script the profile answers more than the rows would.',
        'contracts says, per script target, how the app calls the script and what it has to return. Read it before writing one.',
        CELL_HTML_NOTE,
      ].join(' '),
      inputSchema: z.object({ page: pageSchema }),
      annotations: readOnly,
    },
    async ({ page }) =>
      run(async () => {
        const { info, doc, revision } = await loadTable(username, page)
        const profiles = doc.columns.map((c) => profileColumn(c, doc.items))
        return {
          page: { id: info.id, name: info.name },
          revision,
          rowCount: doc.items.length,
          columns: doc.columns,
          totals: doc.totals ?? {},
          widths: doc.widths ?? {},
          rowStyle: doc.rowStyle ?? '',
          startupScript: doc.startupScript ?? '',
          customFunctions: doc.customFunctions ?? '',
          note: doc.note ?? '',
          statsWidgets: doc.stats?.widgets ?? [],
          profiles,
          sample: chooseSample(doc.columns, doc.items, profiles),
          contracts: CONTRACTS,
        }
      }),
  )

  server.registerTool(
    'evaluate_table_script',
    {
      title: 'Dry run a script against the real rows',
      description: [
        'Compiles a candidate script and runs it over the page\'s actual rows. Saves nothing.',
        'Reports what it produced (distinct outputs with counts, a row sample, every error with its row index) and what it cost (wall time, dependency entries registered, and whether per-row cost grows with rowIndex).',
        'That last flag is the point: an expression like items.slice(0, rowIndex).reduce(...) returns correct numbers while registering O(n squared) dependency entries, which degrades the page as you scroll. Nothing in the app surfaces this.',
        'Run this before every set_table_script. How each target is called and what it has to return is under contracts in get_table_config.',
      ].join(' '),
      inputSchema: z.object({
        page: pageSchema,
        target: targetSchema,
        code: z.string().describe('The full candidate script, not a diff'),
        column: columnSchema,
        widgetId: widgetSchema,
        rows: z
          .array(z.number().int())
          .optional()
          .describe('Specific row indices to report individually'),
      }),
      annotations: readOnly,
    },
    async ({ page, target, code, column, widgetId, rows }) =>
      run(async () => {
        const { doc } = await loadTable(username, page)
        resolveTarget(doc, target, column, widgetId)
        const result = evaluateScript(doc, target, code, column ?? null, { rows })
        return { ...result }
      }),
  )

  server.registerTool(
    'set_table_script',
    {
      title: 'Save a script to a table',
      description: [
        'Writes one script field to the page. Evaluates it first and refuses if it does not compile or throws on every row, unless force is set.',
        'When target is customFns, re-evaluates every computed column, total, column style and row style on the page, because those all have customFunctions prepended. Renaming a helper otherwise breaks other cells silently.',
        'Pass the revision from get_table_config. A stale revision is rejected so a browser edit cannot be clobbered.',
        'Each save writes a page history entry, so the change is undoable from the app.',
      ].join(' '),
      inputSchema: z.object({
        page: pageSchema,
        target: targetSchema,
        code: z.string().describe('The full replacement script, not a diff'),
        revision: revisionSchema,
        column: columnSchema,
        widgetId: widgetSchema,
        force: z
          .boolean()
          .optional()
          .describe(
            'Save even though the script fails to compile, throws on every row, or breaks a dependent. Does not bypass the revision check, and does not allow a script that times out.',
          ),
      }),
      annotations: mutates,
    },
    async ({ page, target, code, revision, column, widgetId, force }) => {
      if (!canWrite) return writeDenied
      return run(async () => {
        const loaded = await loadTable(username, page)
        assertWritable(loaded, revision)
        const { doc } = loaded
        resolveTarget(doc, target, column, widgetId)

        const check = evaluateScript(doc, target, code, column ?? null, {})
        // A timeout has to be fatal on its own: it reports rowsEvaluated 0 with
        // one error, so the "threw on every row" test below never catches it
        // and a runaway expression would save silently.
        // A timeout is refused outright, force or not. A script that throws
        // fails fast and shows an error in the cell; one that never finishes
        // hangs the tab, and page history is reached from that page's own
        // menu, so the obvious way back needs the page to render.
        if (check.timedOut) {
          throw new ToolError(
            `Not saved: ${check.errors[0]?.message ?? 'the script did not finish in time'}. A script that does not terminate would make the page unopenable, so this is refused even with force.`,
          )
        }
        const reason = !check.compiled
          ? 'the script does not compile'
          : // >= and not ===: a run the harness could not finish reports one
            // error over zero rows, and that must not read as a pass.
            check.threw > 0 && check.threw >= check.rowsEvaluated
            ? 'the script threw on every row'
            : null
        if (reason && !force) {
          throw new ToolError(
            `Not saved: ${reason}. First error: ${check.errors[0]?.message ?? 'unknown'}. Pass force to save anyway.`,
          )
        }

        applyScript(doc, target, code, column, widgetId)

        // customFunctions is shared state: everything it feeds has to be
        // re-checked against the new helpers, not just the helpers themselves.
        const broke: { target: string; column: string | null; message: string }[] = []
        if (target === 'customFns') {
          for (const dependent of dependentsOf(doc)) {
            // A sanity check, not a full evaluation: a short cap and a short
            // timeout each, or a page with several heavy scripts would spend
            // the default 5s on every one of them before this tool returns.
            const outcome = evaluateScript(doc, dependent.target, dependent.code, dependent.column, {
              rowCap: 200,
              timeoutMs: 1500,
            })
            if (!outcome.compiled || outcome.timedOut || outcome.threw === outcome.rowsEvaluated) {
              broke.push({
                target: dependent.target,
                column: dependent.column,
                message: outcome.errors[0]?.message ?? 'unknown',
              })
            }
          }
          if (broke.length && !force) {
            throw new ToolError(
              `Not saved: these now fail with the new helpers: ${JSON.stringify(broke)}. Pass force to save anyway.`,
            )
          }
        }

        const saved = await savePage(username, loaded, JSON.stringify(doc))
        return {
          saved: true,
          revision: saved,
          target,
          column: column ?? null,
          evaluation: {
            compiled: check.compiled,
            rowsEvaluated: check.rowsEvaluated,
            threw: check.threw,
            cost: check.cost,
          },
          dependentsBroken: broke,
        }
      })
    },
  )

  registerPageTools(server, { username, canWrite })
  registerTableRowTools(server, { username, canWrite })
  registerDocTools(server, { username, canWrite })
  registerMiniAppTools(server, { username, canWrite })
  registerFileTools(server, { username, canWrite, origin })
  return server
}

/** One handler for the process; a fresh McpServer per request, for the user
 *  the verified token names. */
export function createTablesMcp() {
  const handler = createMcpHandler(
    (ctx) => {
      const username = ctx.authInfo?.extra?.username
      if (typeof username !== 'string') throw new Error('Missing user for MCP')
      const origin = ctx.authInfo?.extra?.origin
      if (typeof origin !== 'string') throw new Error('Missing origin for MCP')
      return buildServer(username, ctx.authInfo?.scopes ?? [], origin)
    },
    {
      legacy: 'stateless',
      onerror: (err: unknown) => console.error('MCP error:', err),
    },
  )
  return {
    fetch: (request: Request, identity: { username: string; scopes: string[]; origin: string }) =>
      handler.fetch(request, {
        authInfo: {
          token: request.headers.get('authorization')?.replace(/^Bearer /i, '') ?? '',
          clientId: '',
          scopes: identity.scopes,
          extra: { username: identity.username, origin: identity.origin },
        },
      }),
  }
}
