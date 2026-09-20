import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import * as api from './journals'
import { pageText, snippetAround } from './pageText'
import { PAGE_TYPES } from './pageTypes'
import { ToolError, mutates, pageSchema, readOnly, run, writeDenied } from './toolkit'

/**
 * Finding pages and managing them as things: list, search, create, rename,
 * move and delete. What is inside a page belongs to the other tool files.
 */

const DEFAULT_LIST_LIMIT = 200

type Place = { profile: api.Profile; notebook: api.Notebook; section: api.Section }

/** Every section the user has, with where it sits. */
async function walkSections(username: string): Promise<Place[]> {
  // GET /profiles already prepends the synthetic { id: null, name: 'Default' }
  // bucket for notebooks with no profile (routes.cr:1342), so this covers
  // everything. A null entry of our own would walk that bucket a second time.
  const places: Place[] = []
  for (const profile of await api.listProfiles(username)) {
    for (const notebook of await api.listNotebooks(username, profile.id)) {
      for (const section of notebook.sections ?? []) places.push({ profile, notebook, section })
    }
  }
  return places
}

/** POST /pages and PUT /move-page store any section id they are given, so
 *  whose section it is has to be checked here. */
async function sectionOf(username: string, sectionId: number): Promise<Place> {
  const place = (await walkSections(username)).find((s) => s.section.id === sectionId)
  if (!place) throw new ToolError(`No section with id ${sectionId}. Section ids come from list_sections.`)
  return place
}

/** A page group to put a page into. */
async function groupToFill(username: string, groupId: number) {
  const group = await api.getPageInfo(username, groupId)
  if (group.type !== 'PageGroup') throw new ToolError(`Page ${groupId} is a ${group.type} page, not a page group`)
  if (group.view_only) throw new ToolError(`Page group ${groupId} is view only. Turn that off in the app before adding to it.`)
  return group
}

/** The pages of one section, the ones inside its page groups included, which
 *  GET /pages/:section_id leaves out (routes.cr:501 filters parent_id IS NULL). */
async function pagesIn(username: string, sectionId: number) {
  const top = await api.listPages(username, sectionId)
  const nested = await Promise.all(
    top
      .filter((p) => p.type === 'PageGroup')
      .map(async (group) => (await api.listGroupPages(username, group.id)).map((child) => ({ child, group: group.name }))),
  )
  return [...top.map((child) => ({ child, group: null as string | null })), ...nested.flat()]
}

/** A page group remembers which of its pages is open. When that page leaves,
 *  the app clears it (PageContextMenu.svelte, movePage), and so does this. */
async function forgetInGroup(username: string, groupId: number, pageId: number): Promise<void> {
  const { content, revision } = await api.getPageContent(username, groupId)
  let active: unknown = null
  try {
    active = JSON.parse(content ?? '{}')?.activePageId
  } catch {}
  if (active === pageId) await api.putPageContent(username, groupId, JSON.stringify({ activePageId: null }), revision)
}

/** The page as it reads, windowed around the match. The API's own snippet is
 *  a window on the stored content, which for every structured page type is
 *  markup or JSON, so the page is decoded here when it can be. Falling back to
 *  the API's snippet keeps a page type this server cannot read from losing its
 *  snippet altogether; <mark> comes off either way, because a marker put in
 *  here is markup in every line the agent writes back. */
async function readableSnippet(username: string, pageId: number, type: string, fallback: string, query: string): Promise<string> {
  const plain = fallback.replace(/<\/?mark>/g, '')
  try {
    const { content } = await api.getPageContent(username, pageId)
    const said = pageText(type, content)
    return said ? snippetAround(said, query) || plain : plain
  } catch {
    return plain
  }
}

/** The app offers none of these on a password protected page until it is
 *  unlocked, and nothing here can unlock one. */
async function pageToManage(username: string, pageId: number) {
  const info = await api.getPageInfo(username, pageId)
  if (info.locked) throw new ToolError(`Page ${pageId} is password protected. Manage it in the app.`)
  return info
}

export function registerPageTools(server: McpServer, { username, canWrite }: { username: string; canWrite: boolean }) {
  server.registerTool(
    'list_pages',
    {
      title: 'List pages',
      description: [
        'Pages in the journal, with the notebook and section each lives in. Narrow it with type, section or name: a whole journal can be thousands of pages, and the result stops at limit. To find a page by what it says, use search_pages.',
        'A page inside a page group is named "Group > Page".',
      ].join(' '),
      inputSchema: z.object({
        type: z.string().optional().describe('Page type to return, for example "Table", "FlatPage", "TaskList", "Kanban". Omit for every type.'),
        section: z.number().int().optional().describe('Only this section, by id from list_sections. Much faster than the whole journal'),
        name: z.string().optional().describe('Only pages whose name contains this, case-insensitively'),
        limit: z.number().int().min(1).max(1000).optional().describe(`Most pages to return. Default ${DEFAULT_LIST_LIMIT}`),
      }),
      outputSchema: z.object({
        total: z.number(),
        pages: z.array(
          z.object({
            id: z.number(),
            name: z.string(),
            type: z.string(),
            notebook: z.string(),
            section: z.string(),
            sectionId: z.number(),
            profile: z.string().nullable(),
          }),
        ),
        note: z.string().optional(),
      }),
      annotations: readOnly,
    },
    async ({ type, section, name, limit }) =>
      run(async () => {
        const places = section === undefined ? await walkSections(username) : [await sectionOf(username, section)]
        const needle = name?.trim().toLowerCase()
        const pages: Record<string, unknown>[] = []
        // A few sections at a time: one request each, plus one per page group.
        for (let at = 0; at < places.length; at += 8) {
          const batch = places.slice(at, at + 8)
          const found = await Promise.all(batch.map((place) => pagesIn(username, place.section.id)))
          batch.forEach(({ profile, notebook, section: s }, index) => {
            for (const { child, group } of found[index]!) {
              const shown = group ? `${group} > ${child.name}` : child.name
              if (type && child.type !== type) continue
              if (needle && !shown.toLowerCase().includes(needle)) continue
              pages.push({ id: child.id, name: shown, type: child.type, notebook: notebook.name, section: s.name, sectionId: s.id, profile: profile.name })
            }
          })
        }
        const most = limit ?? DEFAULT_LIST_LIMIT
        return {
          total: pages.length,
          pages: pages.slice(0, most),
          ...(pages.length > most ? { note: `Showing the first ${most} of ${pages.length}. Narrow it with type, section or name, or raise limit.` } : {}),
        }
      }),
  )

  server.registerTool(
    'search_pages',
    {
      title: 'Search pages by name or by what they say',
      description:
        "The app's own search. By default it matches page names. With text set it searches what the pages say, through the full text index, and returns a snippet of the page as it reads, not as it is stored. Either way it returns the ten best matches, so make the query specific. A text search matches whole words.",
      inputSchema: z.object({
        query: z.string().min(1).describe('What to look for'),
        text: z.boolean().optional().describe('Search what pages say instead of their names'),
      }),
      annotations: readOnly,
    },
    async ({ query, text }) =>
      run(async () => {
        const needle = query.trim()
        const hits = await api.searchPages(username, needle, Boolean(text))
        const pages = await Promise.all(
          hits.map(async (hit) => {
            // The search leaves out the type, and which tools apply turns on it.
            const info = await api.getPageInfo(username, hit.id)
            return {
              id: hit.id,
              name: hit.name,
              type: info.type,
              notebook: hit.notebook_name,
              section: hit.section_name,
              sectionId: hit.section_id,
              // A password protected page is not readable here, its snippet included.
              ...(hit.snippet && !info.locked ? { snippet: await readableSnippet(username, hit.id, info.type, hit.snippet, needle) } : {}),
              ...(info.locked ? { locked: true } : {}),
            }
          }),
        )
        return { pages }
      }),
  )

  server.registerTool(
    'list_sections',
    {
      title: 'List notebooks and their sections',
      description:
        'Every section, with the notebook and profile it belongs to. A section id is what create_page and move_page need, and this is the only way to find a section that has no pages yet.',
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    async () =>
      run(async () => ({
        sections: (await walkSections(username)).map(({ profile, notebook, section }) => ({
          sectionId: section.id,
          section: section.name,
          notebook: notebook.name,
          profile: profile.name,
        })),
      })),
  )

  server.registerTool(
    'create_page',
    {
      title: 'Create a page',
      description: [
        `A new, empty page at the bottom of a section, or inside a page group. Types are the ones the app offers: ${PAGE_TYPES.join(', ')}.`,
        'The page starts blank and the matching tools fill it: edit_page for FlatPage, FlatPageV2 and TaskList, edit_table_columns then edit_table_rows for Table, set_mini_app_files for MiniApp. The other types can be created here but only edited in the app.',
      ].join(' '),
      inputSchema: z.object({
        name: z.string().min(1).describe('Page name'),
        type: z.enum(PAGE_TYPES),
        section: z.number().int().optional().describe('Section id from list_sections or list_pages. Not needed when group is given'),
        group: z.number().int().optional().describe('Id of a PageGroup page to create the page inside'),
      }),
      annotations: { ...mutates, idempotentHint: false },
    },
    async ({ name, type, section, group }) => {
      if (!canWrite) return writeDenied
      return run(async () => {
        if (!name.trim()) throw new ToolError("A page name can't be blank")
        let sectionId = section
        if (group !== undefined) {
          if (type === 'PageGroup') throw new ToolError('A page group cannot go inside another page group')
          const parent = await groupToFill(username, group)
          if (section !== undefined && section !== parent.section_id) {
            throw new ToolError(`Page group ${group} is in section ${parent.section_id}, not ${section}. Leave section out when group is given.`)
          }
          sectionId = parent.section_id
        }
        if (sectionId === undefined) throw new ToolError('Pass section, or group to create the page inside a page group')
        const place = await sectionOf(username, sectionId)

        const { insertedRowId } = await api.createPage(username, sectionId, type, name.trim(), group ?? null)
        return { created: true, id: insertedRowId, name: name.trim(), type, section: place.section.name, notebook: place.notebook.name }
      })
    },
  )

  server.registerTool(
    'rename_page',
    {
      title: 'Rename a page',
      description: 'Gives a page a new name. Links to the page keep working, because they go by id, but the name shown inside an existing [[Name|id]] link stays as it was written.',
      inputSchema: z.object({ page: pageSchema, name: z.string().min(1).describe('The new name') }),
      annotations: mutates,
    },
    async ({ page, name }) => {
      if (!canWrite) return writeDenied
      return run(async () => {
        if (!name.trim()) throw new ToolError("A page name can't be blank")
        const info = await pageToManage(username, page)
        await api.renamePage(username, page, name.trim())
        return { renamed: true, id: page, from: info.name, name: name.trim() }
      })
    },
  )

  server.registerTool(
    'move_page',
    {
      title: 'Move a page to another section or page group',
      description:
        'Moves a page to a section, or into a page group, or out of one into a section. Pass group to put it in a page group, or section to put it at the top level of a section. A page group moves with the pages inside it, and cannot go inside another page group.',
      inputSchema: z.object({
        page: pageSchema,
        section: z.number().int().optional().describe('Section id from list_sections. Not needed when group is given'),
        group: z.number().int().optional().describe('Id of a PageGroup page to move the page into'),
      }),
      annotations: mutates,
    },
    async ({ page, section, group }) => {
      if (!canWrite) return writeDenied
      return run(async () => {
        const info = await pageToManage(username, page)
        let sectionId = section
        if (group !== undefined) {
          if (info.type === 'PageGroup') throw new ToolError('A page group cannot go inside another page group')
          const parent = await groupToFill(username, group)
          if (section !== undefined && section !== parent.section_id) {
            throw new ToolError(`Page group ${group} is in section ${parent.section_id}, not ${section}. Leave section out when group is given.`)
          }
          sectionId = parent.section_id
        }
        if (sectionId === undefined) throw new ToolError('Pass section, or group to move the page into a page group')
        if (sectionId === info.section_id && (group ?? null) === info.parent_id) throw new ToolError(`Page ${page} is already there`)
        const place = await sectionOf(username, sectionId)

        // The pages inside a group carry a section of their own, which the
        // search reads. They follow the group, or it would name the old one.
        const inside = info.type === 'PageGroup' ? await api.listGroupPages(username, page) : []
        await api.movePage(username, page, sectionId, group ?? null)
        for (const child of inside) await api.movePage(username, child.id, sectionId, page)
        if (info.parent_id !== null) await forgetInGroup(username, info.parent_id, page)
        return { moved: true, id: page, name: info.name, section: place.section.name, notebook: place.notebook.name, group: group ?? null, ...(inside.length ? { pagesInside: inside.length } : {}) }
      })
    },
  )

  server.registerTool(
    'delete_page',
    {
      title: 'Move a page to the recycle bin',
      description:
        'Deletes a page the way the app does: it goes to the recycle bin, where it can be restored in the app, and nothing is erased. Deleting a page group takes the pages inside it along. Nothing here empties the recycle bin or restores from it.',
      inputSchema: z.object({ page: pageSchema }),
      annotations: { ...mutates, destructiveHint: true },
    },
    async ({ page }) => {
      if (!canWrite) return writeDenied
      return run(async () => {
        const info = await pageToManage(username, page)
        const inside = info.type === 'PageGroup' ? await api.listGroupPages(username, page) : []
        await api.deletePage(username, page)
        if (info.parent_id !== null) await forgetInGroup(username, info.parent_id, page)
        return { deleted: true, id: page, name: info.name, type: info.type, ...(inside.length ? { pagesInsideDeleted: inside.map((p) => p.name) } : {}), restore: 'From the recycle bin in the app' }
      })
    },
  )
}
