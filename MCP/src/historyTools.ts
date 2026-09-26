import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import * as api from './journals'
import { LINE_CODECS } from './lines/codecs'
import { linesOf } from './lines/edit'
import { diffPageLines, diffTableDocuments, textDiff } from './pageHistory'
import { startupHint, parseTableDocument } from './tableDoc'
import { cellText } from './tableRows'
import { ToolError, assertWritable, loadPage, mutates, pageSchema, readOnly, revisionSchema, run, savePage, writeDenied } from './toolkit'

/**
 * get_page_history and restore_page_history: the Page History dialog in the
 * app (PageNav.svelte). A history entry is the whole page as it read until a
 * save replaced it, so a change is found by comparing two entries.
 */

const DEFAULT_LIMIT = 100
const DIFFED_TYPES = ['Table', ...Object.keys(LINE_CODECS)]

const entrySchema = z.number().int().describe('History entry id from get_page_history')

// The API stores UTC without saying so.
const asUtc = (createdAt: string) => new Date(createdAt.replace(' ', 'T') + 'Z').toISOString()

/** Any page type, including ones the app no longer offers for new pages. */
async function loadAnyPage(username: string, page: number) {
  const { type } = await api.getPageInfo(username, page)
  return loadPage(username, page, [type])
}

async function entryOf(username: string, page: number, entry: number) {
  const entries = await api.listPageHistory(username, page)
  const index = entries.findIndex((e) => e.id === entry)
  if (index === -1) throw new ToolError(`Page ${page} has no history entry ${entry}. Leave entry out to list them.`)
  return { entries, index }
}

/** A window of a list, and where it sits in the whole. */
function windowOf<T>(items: T[], start: number | undefined, limit: number | undefined) {
  const from = Math.max(1, start ?? 1)
  const shown = items.slice(from - 1, from - 1 + (limit ?? DEFAULT_LIMIT))
  return { shown, start: from, end: from + shown.length - 1, total: items.length }
}

function tableChanges(olderContent: string | null, newerContent: string | null, start?: number, limit?: number) {
  const older = parseTableDocument(olderContent)
  const newer = parseTableDocument(newerContent)
  const diff = diffTableDocuments(older, newer)
  const stored = (doc: typeof older) => doc.columns.filter((c) => c.type !== 'Computed').map((c) => c.name)
  const filled = (row: Record<string, string>, names: string[]) =>
    Object.fromEntries(names.map((name) => [name, cellText(row[name])]).filter(([, text]) => text))

  const rows = windowOf(diff.rows, start, limit)
  return {
    columns: {
      added: diff.columnsAdded,
      removed: diff.columnsRemoved,
      changed: diff.columnsChanged,
      ...(diff.columnsReordered ? { orderNow: newer.columns.map((c) => c.name) } : {}),
    },
    rows: {
      added: diff.rows.filter((r) => r.type === 'add').length,
      changed: diff.rows.filter((r) => r.type === 'change').length,
      removed: diff.rows.filter((r) => r.type === 'remove').length,
      comparedOn: diff.rowColumns,
      start: rows.start,
      end: rows.end,
      changes: rows.shown.map((r) => {
        if (r.type === 'add') return { type: 'added', row: r.rowNumber, cells: filled(r.after, stored(newer)) }
        if (r.type === 'remove') return { type: 'removed', row: r.rowNumber, cells: filled(r.before, stored(older)) }
        const cells = Object.fromEntries(
          diff.rowColumns
            .map((name) => [name, { before: cellText(r.before[name]), after: cellText(r.after[name]) }] as const)
            .filter(([, cell]) => cell.before !== cell.after),
        )
        return { type: 'changed', row: r.rowNumber, cells }
      }),
    },
    settings: diff.settings.map((s) => ({ setting: s.setting, diff: textDiff(String(s.before), String(s.after)) })),
    alsoChanged: diff.settingsOther,
  }
}

function lineChanges(type: string, olderContent: string | null, newerContent: string | null, start?: number, limit?: number) {
  const codec = LINE_CODECS[type]!
  const hunks = diffPageLines(linesOf(codec.read(olderContent)), linesOf(codec.read(newerContent)))
  const window = windowOf(hunks, start, limit)
  return {
    added: hunks.reduce((sum, h) => sum + h.added, 0),
    removed: hunks.reduce((sum, h) => sum + h.removed, 0),
    hunks: window.total,
    start: window.start,
    end: window.end,
    text: window.shown.map((h) => h.text).join('\n...\n'),
  }
}

export function registerHistoryTools(server: McpServer, { username, canWrite }: { username: string; canWrite: boolean }) {
  server.registerTool(
    'get_page_history',
    {
      title: "Read a page's saved versions and what each changed",
      description: [
        'The Page History of any page, as the app keeps it: every save keeps the page as it read before, up to 100 entries plus pinned ones.',
        'Without entry it lists the entries, newest first. An entry is the page as it read until replacedAt.',
        'With entry it shows what differs from the entry before it, which is what one save changed. compare "current" shows instead what changed from that entry to the page now, which is what restore_page_history would undo.',
        `Changes are shown for ${DIFFED_TYPES.join(', ')} pages. A Table reports columns, rows and settings, and rows are compared on the columns both versions have, so a column added or removed is reported once as a column. A line page reports hunks: " ", "-" or "+", the line number, a tab and the line, where a removed line carries its old number. Long results come in windows of changed rows or hunks.`,
      ].join('\n'),
      inputSchema: z.object({
        page: pageSchema,
        entry: entrySchema.optional().describe('A history entry id. Omit to list the entries'),
        compare: z.enum(['previous', 'current']).optional().describe('What to compare the entry with. Default previous'),
        start: z.number().int().min(1).optional().describe('First changed row or hunk to return, 1-based. Default 1'),
        limit: z.number().int().min(1).max(1000).optional().describe(`How many changed rows or hunks to return. Default ${DEFAULT_LIMIT}`),
      }),
      annotations: readOnly,
    },
    async ({ page, entry, compare, start, limit }) =>
      run(async () => {
        const { info, content, revision } = await loadAnyPage(username, page)
        const about = { page: { id: info.id, name: info.name, type: info.type }, revision }
        if (entry === undefined) {
          const entries = await api.listPageHistory(username, page)
          return {
            ...about,
            entries: entries.map((e) => ({ id: e.id, replacedAt: asUtc(e.created_at), pinned: e.pinned === 1 })),
          }
        }

        const { entries, index } = await entryOf(username, page, entry)
        const shown = { id: entry, replacedAt: asUtc(entries[index]!.created_at) }
        if (!DIFFED_TYPES.includes(info.type)) {
          return { ...about, entry: shown, changes: null, why: `Changes are shown for ${DIFFED_TYPES.join(', ')} pages only. restore_page_history can still put this version back.` }
        }
        const entryContent = (await api.getPageHistoryContent(username, entry)).content
        let olderContent: string | null
        let newerContent: string | null
        let comparedWith: unknown
        if (compare === 'current') {
          olderContent = entryContent
          newerContent = content
          comparedWith = 'the page now'
        } else {
          const olderEntry = entries[index + 1]
          if (!olderEntry) {
            return { ...about, entry: shown, changes: null, why: 'This is the oldest saved version, so nothing before it is kept. compare "current" shows what changed since.' }
          }
          olderContent = (await api.getPageHistoryContent(username, olderEntry.id)).content
          newerContent = entryContent
          comparedWith = { id: olderEntry.id, replacedAt: asUtc(olderEntry.created_at) }
        }
        const changes = info.type === 'Table'
          ? tableChanges(olderContent, newerContent, start, limit)
          : lineChanges(info.type, olderContent, newerContent, start, limit)
        return { ...about, entry: shown, comparedWith, ...(olderContent === newerContent ? { same: true } : {}), changes }
      }),
  )

  server.registerTool(
    'restore_page_history',
    {
      title: 'Put a page back to a saved version',
      description:
        "What Restore does in the app's Page History. The whole page becomes the entry's content, and what it said before is kept as the newest entry, so a restore can be undone the same way. Takes the revision get_page_history returned.",
      inputSchema: z.object({ page: pageSchema, entry: entrySchema, revision: revisionSchema }),
      annotations: { ...mutates, destructiveHint: true },
    },
    async ({ page, entry, revision }) => {
      if (!canWrite) return writeDenied
      return run(async () => {
        const loaded = await loadAnyPage(username, page)
        assertWritable(loaded, revision, loaded.info.type === 'Table' ? startupHint(parseTableDocument(loaded.content)) : '')
        await entryOf(username, page, entry)
        const { content } = await api.getPageHistoryContent(username, entry)
        // An empty FlatPageV2 never finishes loading, and no page type reads
        // an empty string as more than a blank page.
        if (!content) throw new ToolError(`Entry ${entry} is empty: the page had no content then, so there is nothing to put back.`)
        if (content === loaded.content) throw new ToolError(`The page already reads like entry ${entry}.`)
        const saved = await savePage(username, loaded, content)
        return { restored: true, id: page, entry, revision: saved }
      })
    },
  )
}
