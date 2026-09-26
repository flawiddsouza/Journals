import { sign } from 'hono/jwt'
import { config } from './config'

/**
 * Client for the Crystal API. Every call carries a JWT we mint ourselves with
 * the same secret and the same `{username, exp}` payload `POST /login` uses
 * (auth_handler.cr), so the API needs no changes to accept the sidecar.
 *
 * Reads and writes go through the API rather than store.db on purpose:
 * `PUT /pages/:page_id` writes the page_history row, prunes to 100 non-pinned
 * entries, and re-syncs page_links from the content (routes.cr:607-650). Table
 * cells can hold page links, so that logic is live here and must not be
 * reimplemented.
 */

async function mintToken(username: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + config.upstreamTokenTtlSeconds
  return sign({ username, exp }, config.jwtSecret, 'HS256')
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function call<T>(
  username: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: {
      Token: await mintToken(username),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new ApiError(`${method} ${path} failed: ${text.slice(0, 200)}`, response.status)
  }
  return (text ? JSON.parse(text) : null) as T
}

/** `id` is null for the synthetic "Default" bucket the API prepends for
 *  notebooks with no profile (routes.cr:1342). */
export type Profile = { id: number | null; name: string }
export type Section = { id: number; name: string; notebook_id: number }
export type Notebook = { id: number; name: string; sections: Section[] }
export type PageSummary = { id: number; name: string; type: string; section_id: number }

/** Verifies credentials against the API's own login route, so bcrypt hashing
 *  and the users table stay entirely on the Crystal side. */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const response = await fetch(`${config.apiUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, refresh: true }),
  })
  if (!response.ok) return false
  const body = (await response.json()) as { token?: string; error?: string }
  return typeof body.token === 'string'
}

export const listProfiles = (username: string) =>
  call<Profile[]>(username, 'GET', '/profiles')

export const listNotebooks = (username: string, profileId: number | null) =>
  call<Notebook[]>(username, 'GET', `/notebooks?profile_id=${profileId ?? 'null'}`)

/** Top-level pages in a section. Pages inside a page group are excluded here
 *  (routes.cr:501 filters parent_id IS NULL); reach those via listGroupPages. */
export const listPages = (username: string, sectionId: number) =>
  call<PageSummary[]>(username, 'GET', `/pages/${sectionId}`)

export const listGroupPages = (username: string, groupPageId: number) =>
  call<PageSummary[]>(username, 'GET', `/page-group/${groupPageId}`)

export const getPageInfo = (username: string, pageId: number) =>
  call<{
    id: number
    name: string
    type: string
    locked: boolean
    section_id: number
    parent_id: number | null
    view_only: boolean
    /** Set when the page sits in a page group; the group's flag covers it. */
    parent_view_only: boolean | null
  }>(username, 'GET', `/pages/info/${pageId}`)

export const getPageContent = (username: string, pageId: number) =>
  call<{ content: string | null; revision: string }>(username, 'GET', `/pages/content/${pageId}`)

/** baseRevision is the revision of the content the change was made from. The
 *  API answers 409 when the page has moved on since (routes.cr, PUT /pages). */
export const putPageContent = (username: string, pageId: number, content: string, baseRevision: string) =>
  call<{ success: boolean; revision: string }>(username, 'PUT', `/pages/${pageId}`, { pageContent: content, baseRevision })

/** A page's saved versions, newest first. Each is the content the page had
 *  until the save made at created_at replaced it (routes.cr, PUT /pages).
 *  created_at is UTC with no zone. */
export const listPageHistory = (username: string, pageId: number) =>
  call<{ id: number; created_at: string; pinned: number | null }[]>(username, 'GET', `/page-history/${pageId}`)

export const getPageHistoryContent = (username: string, historyId: number) =>
  call<{ content: string | null }>(username, 'GET', `/page-history/content/${historyId}`)

/** The template a Mini App page was made from, if any. `templateId` is null
 *  for a page with no link (miniapp_routes.cr:450-481). */
export const getMiniAppTemplate = (username: string, pageId: number) =>
  call<{
    templateId: number | null
    templateName?: string
    lastPulledRevision?: number
    latestRevision?: number
  }>(username, 'GET', `/miniapp/pages/${pageId}/template`)

/** A new page has no content. Each page type treats that as its blank state.
 *  pageParentId has to be sent even when null (routes.cr:459). */
export const createPage = (username: string, sectionId: number, type: string, name: string, parentId: number | null) =>
  call<{ insertedRowId: number }>(username, 'POST', '/pages', { sectionId, pageType: type, pageName: name, pageParentId: parentId })

export type SearchHit = { id: number; name: string; section_id: number; section_name: string; notebook_name: string; snippet?: string }

/** The app's own search: page names, or page text through the full text index.
 *  It returns the ten best matches (routes.cr, POST /pages/search). */
export const searchPages = (username: string, query: string, searchContent: boolean) =>
  call<SearchHit[]>(username, 'POST', '/pages/search', { query, searchContent })

export const renamePage = (username: string, pageId: number, name: string) =>
  call<{ success: boolean }>(username, 'PUT', `/pages/name/${pageId}`, { pageName: name })

/** pageGroupId has to be sent even when null (routes.cr, PUT /move-page). */
export const movePage = (username: string, pageId: number, sectionId: number, groupId: number | null) =>
  call<{ success: boolean }>(username, 'PUT', `/move-page/${pageId}`, { sectionId, pageGroupId: groupId })

/** A soft delete: the page goes to the recycle bin, and the pages inside a
 *  page group go with it (routes.cr, DELETE /pages). */
export const deletePage = (username: string, pageId: number) =>
  call<{ success: boolean }>(username, 'DELETE', `/pages/${pageId}`)

export type PageUpload = { id: number; file_path: string; created_at: string; used: boolean }

/** Files uploaded to a page. `used` is the API's own check: whether the page's
 *  content mentions the file name (routes.cr:1090-1109). */
export const listPageUploads = (username: string, pageId: number) =>
  call<PageUpload[]>(username, 'GET', `/page-uploads/${pageId}`)

/** Stores a file against a page. The API keeps only the extension of the name
 *  given and names the file itself (routes.cr:990-1025). */
export async function uploadFile(username: string, pageId: number, filename: string, bytes: ArrayBuffer, contentType: string) {
  const form = new FormData()
  form.append('image', new File([bytes], filename, { type: contentType }))
  const response = await fetch(`${config.apiUrl}/upload-image/${pageId}`, {
    method: 'POST',
    headers: { Token: await mintToken(username) },
    body: form,
  })
  const body = (await response.json().catch(() => ({}))) as { imageUrl?: string; filename?: string; error?: string }
  if (!response.ok || !body.imageUrl || !body.filename) {
    throw new ApiError(`upload failed: ${body.error ?? response.status}`, response.status)
  }
  return { path: body.imageUrl, filename: body.filename }
}

/** An uploaded file's bytes. The API serves them only to their owner. */
export async function fetchUpload(username: string, filename: string): Promise<Response> {
  return fetch(`${config.apiUrl}/uploads/images/${encodeURIComponent(filename)}`, {
    headers: { Token: await mintToken(username) },
  })
}

/** An integration as the API lists it: never the header values, which stay on
 *  the API side (integration_routes.cr). */
export type Integration = {
  id: number
  name: string
  baseUrl: string
  headerNames: string[]
  grants: { pageId: number; pageName: string }[]
}

export const listIntegrations = (username: string) => call<Integration[]>(username, 'GET', '/integrations')

/** headers: name to value. On an update a null value keeps the saved one, and
 *  a name left out is removed. */
export type IntegrationInput = { name: string; baseUrl: string; headers: Record<string, string | null> }

export const createIntegration = (username: string, input: IntegrationInput) =>
  call<{ id: number }>(username, 'POST', '/integrations', input)

export const updateIntegration = (username: string, id: number, input: IntegrationInput) =>
  call<{ success: boolean }>(username, 'PUT', `/integrations/${id}`, input)

/** A soft delete: it goes to the recycle bin with its saved headers. */
export const deleteIntegration = (username: string, id: number) =>
  call<{ success: boolean }>(username, 'DELETE', `/integrations/${id}`)

export const revokeIntegrationGrant = (username: string, pageId: number, integrationId: number) =>
  call<{ success: boolean }>(username, 'DELETE', `/integration-grants/${pageId}/${integrationId}`)

export type IntegrationAnswer = { status: number; headers: Record<string, string>; bytes: Uint8Array }

/** One request through an integration, sent the way the app sends it
 *  (Web-UI/src/helpers/integrations.js): what to do in X-Integration-*
 *  headers, the body as bytes. Resolves to the service's answer whatever its
 *  status, and throws when the API refused the request or got no answer. */
export async function requestThroughIntegration(
  username: string,
  request: { name: string; method: string; path: string; headers: Record<string, string>; body?: string },
): Promise<IntegrationAnswer> {
  const response = await fetch(`${config.apiUrl}/integration-requests`, {
    method: 'POST',
    headers: {
      Token: await mintToken(username),
      'Content-Type': 'application/octet-stream',
      'X-Integration-Name': encodeURIComponent(request.name),
      'X-Integration-Method': encodeURIComponent(request.method),
      'X-Integration-Path': encodeURIComponent(request.path),
      'X-Integration-Headers': encodeURIComponent(JSON.stringify(request.headers)),
    },
    body: request.body,
  })
  const status = response.headers.get('x-integration-status')
  if (status === null) {
    const text = await response.text()
    let message = text.slice(0, 300)
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? message
    } catch {
      // not JSON, keep the text
    }
    throw new ApiError(message, response.status)
  }
  return {
    status: Number(status),
    headers: JSON.parse(decodeURIComponent(response.headers.get('x-integration-headers') ?? '%7B%7D')),
    bytes: new Uint8Array(await response.arrayBuffer()),
  }
}
