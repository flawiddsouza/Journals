import { z } from 'zod'
import * as api from './journals'
import { CodecError } from './lines/inline'
import { SCOPES } from './oauth'
import { parseTableDocument } from './tableDoc'

/**
 * What every tool shares: result shaping, the checks a page has to pass before
 * it is read or written, and the revision that stops a save from landing on
 * top of a change made in the browser.
 */

export class ToolError extends Error {}

export type ToolResult = {
  content: { type: 'text'; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export async function run(fn: () => Promise<Record<string, unknown>>): Promise<ToolResult> {
  try {
    const data = await fn()
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    }
  } catch (err) {
    // An upstream failure carries a usable message ("Invalid page id"), so it
    // is reported rather than flattened to "Internal error" like a real bug.
    const known = err instanceof ToolError || err instanceof api.ApiError || err instanceof CodecError
    if (!known) console.error('MCP tool error:', err)
    const text = known ? (err as Error).message : 'Internal error'
    return { content: [{ type: 'text', text }], isError: true }
  }
}

export const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}
export const mutates = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}

/** A page is identified by its numeric id, from list_pages. */
export const pageSchema = z.number().int().describe('Page id from list_pages')
export const revisionSchema = z.string().describe('revision from the matching get tool')

export const writeDenied: ToolResult = {
  content: [
    {
      type: 'text',
      text: `This token lacks the ${SCOPES.write} scope. Re-authorize with ${SCOPES.write} to change pages.`,
    },
  ],
  isError: true,
}

/** Which tool reads each page type, for pointing a caller at the right one. */
const READER: Record<string, string> = {
  Table: 'get_table_rows for its data or get_table_config for its scripts',
  FlatPage: 'get_page',
  FlatPageV2: 'get_page',
  TaskList: 'get_page',
  MiniApp: 'get_mini_app',
}

export async function loadPage(username: string, pageId: number, types: string[]) {
  const info = await api.getPageInfo(username, pageId)
  if (!types.includes(info.type)) {
    const reader = READER[info.type]
    throw new ToolError(
      `Page ${pageId} is a ${info.type} page. ` +
        (reader ? `Use ${reader}.` : `This tool handles ${types.join(', ')}, and no tool here handles ${info.type} yet.`),
    )
  }
  if (info.locked) {
    throw new ToolError(`Page ${pageId} is password protected and is not readable here`)
  }
  const { content, revision } = await api.getPageContent(username, pageId)
  return { info, content, revision }
}

export async function loadTable(username: string, pageId: number) {
  const page = await loadPage(username, pageId, ['Table'])
  return { ...page, doc: parseTableDocument(page.content) }
}

/** Page ids linked from content, found the way the API finds them
 *  (routes.cr:600-605), so this sees exactly what page_links will. The
 *  optional backslash is for links inside a JSON string, as in a Table cell. */
const linkedPages = (content: string | null) =>
  new Set([...(content ?? '').matchAll(/data-page-id=\\?"(\d+)\\?"|"pageId"\s*:\s*(\d+)/g)].map((m) => Number(m[1] ?? m[2])))

/** A link to a page that is not the user's would render but go nowhere, and
 *  the API would quietly leave it out of page_links. Only links the save adds
 *  are checked; one already on the page may point at a page deleted since. */
export async function assertLinksExist(username: string, before: string | null, after: string): Promise<void> {
  const known = linkedPages(before)
  for (const id of linkedPages(after)) {
    if (known.has(id)) continue
    await api.getPageInfo(username, id).catch(() => {
      throw new ToolError(`[[...|${id}]] links to a page that does not exist. Page ids come from list_pages.`)
    })
  }
}

type Loaded = Awaited<ReturnType<typeof loadPage>>

/** The two checks every save makes before anything else. `hint` is appended to
 *  the revision refusal, for a page that has a known reason to move on its
 *  own. */
export function assertWritable({ info, revision: current }: Loaded, revision: string, hint = ''): void {
  // PUT /pages/:page_id does not check this; the app simply never saves a
  // view-only page (Table.svelte:234), so the refusal has to be ours.
  if (info.view_only || info.parent_view_only) {
    throw new ToolError(`Page ${info.id} is view only. Turn that off in the app before changing it.`)
  }
  if (revision !== current) {
    throw new ToolError(
      `The page changed since you read it (revision ${current}, you sent ${revision}). Read it again before saving.${hint ? ` ${hint}` : ''}`,
    )
  }
}

/** Saves through the API with the revision the change was made from, so a save
 *  that lands between our read and our write is refused there, not lost.
 *  Resolves to the revision of what was saved. */
export async function savePage(username: string, { info, revision }: Loaded, content: string): Promise<string> {
  const saved = await api.putPageContent(username, info.id, content, revision).catch((error: unknown) => {
    if (error instanceof api.ApiError && error.status === 409) {
      throw new ToolError('The page changed while this save was being prepared. Read it again before saving.')
    }
    throw error
  })
  return saved.revision
}
