import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import * as api from './journals'
import { ToolError, mutates, pageSchema, readOnly, run, writeDenied } from './toolkit'

/**
 * Integrations: a saved address plus the secret headers sent with it, which a
 * Table's pull script and a Mini App call by name. The API keeps the header
 * values and never returns them, so neither does anything here.
 */

const nameSchema = z.string().min(1).describe('The integration name, as scripts call it: integration(name)')

// Answers of these types are shown as text. Anything else is described, since
// bytes in a tool result are no use to the caller.
const TEXT_TYPES = /^(text\/|application\/([\w.+-]*\+)?(json|xml|javascript|x-www-form-urlencoded)\b)/i
// A tool result goes into the caller's context whole. An API page of a few
// hundred records fits; a download the size of the 10 MB cap would not.
const MAX_TEXT_CHARS = 50_000

async function findIntegration(username: string, name: string): Promise<api.Integration> {
  const all = await api.listIntegrations(username)
  const found = all.find((integration) => integration.name === name)
  if (!found) {
    throw new ToolError(`No integration named ${name}. There are: ${all.map((i) => i.name).join(', ') || 'none yet'}`)
  }
  return found
}

function decodeAnswer(answer: api.IntegrationAnswer) {
  const type = answer.headers['content-type'] ?? ''
  if (answer.bytes.length && !TEXT_TYPES.test(type)) {
    return { binary: true, bytes: answer.bytes.length }
  }
  const charset = /charset=([^;]+)/i.exec(type)?.[1]?.trim().replace(/^"|"$/g, '')
  let text: string
  try {
    text = new TextDecoder((charset || 'utf-8') as ConstructorParameters<typeof TextDecoder>[0]).decode(answer.bytes)
  } catch {
    text = new TextDecoder().decode(answer.bytes)
  }
  return text.length > MAX_TEXT_CHARS
    ? { body: text.slice(0, MAX_TEXT_CHARS), truncated: true, characters: text.length }
    : { body: text }
}

export function registerIntegrationTools(server: McpServer, { username, canWrite }: { username: string; canWrite: boolean }) {
  server.registerTool(
    'list_integrations',
    {
      title: 'List integrations',
      description:
        'The saved integrations: name, base address and the names of the headers each sends, never their values. Also which Mini App pages have been allowed to use each.',
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    async () => run(async () => ({ integrations: await api.listIntegrations(username) })),
  )

  server.registerTool(
    'create_integration',
    {
      title: 'Add an integration',
      description: [
        'Saves a service for scripts to call by name: its base address and the headers every request carries, such as Authorization: Bearer <token>.',
        'The values are kept by the Journals API and never shown again, by the app or here.',
        'Private, loopback and link-local addresses cannot be reached through an integration.',
      ].join(' '),
      inputSchema: z.object({
        name: nameSchema,
        baseUrl: z.string().describe('http or https address requests are made under, such as https://api.github.com'),
        headers: z.record(z.string(), z.string().min(1)).optional().describe('Header name to value'),
      }),
      annotations: { ...mutates, idempotentHint: false },
    },
    async ({ name, baseUrl, headers }) => {
      if (!canWrite) return writeDenied
      return run(async () => {
        const { id } = await api.createIntegration(username, { name, baseUrl, headers: headers ?? {} })
        return { created: true, id, name }
      })
    },
  )

  server.registerTool(
    'update_integration',
    {
      title: 'Change an integration',
      description: [
        'Renames it, moves its base address, or changes its headers. Anything left out stays as it is.',
        'headers, when given, is the whole set: a value replaces that header, null keeps the value already saved, and a header not named is removed.',
        'Renaming breaks the scripts that call it by the old name.',
      ].join(' '),
      inputSchema: z.object({
        name: nameSchema,
        newName: z.string().min(1).optional(),
        baseUrl: z.string().optional(),
        headers: z.record(z.string(), z.string().min(1).nullable()).optional(),
      }),
      annotations: mutates,
    },
    async ({ name, newName, baseUrl, headers }) => {
      if (!canWrite) return writeDenied
      return run(async () => {
        const found = await findIntegration(username, name)
        const kept = Object.fromEntries(found.headerNames.map((header) => [header, null]))
        await api.updateIntegration(username, found.id, {
          name: newName ?? found.name,
          baseUrl: baseUrl ?? found.baseUrl,
          headers: headers ?? kept,
        })
        const now = await findIntegration(username, newName ?? found.name)
        return { updated: true, integration: now }
      })
    },
  )

  server.registerTool(
    'delete_integration',
    {
      title: 'Delete an integration',
      description:
        'Moves it to the recycle bin, where it can be restored from the app. Its saved headers stay there until the bin is emptied. Scripts calling it fail until then.',
      inputSchema: z.object({ name: nameSchema }),
      annotations: { ...mutates, destructiveHint: true },
    },
    async ({ name }) => {
      if (!canWrite) return writeDenied
      return run(async () => {
        const found = await findIntegration(username, name)
        await api.deleteIntegration(username, found.id)
        return { deleted: true, name, inRecycleBin: true }
      })
    },
  )

  server.registerTool(
    'revoke_integration_grant',
    {
      title: "Take an integration away from a Mini App",
      description:
        'A Mini App asks before it first uses an integration, and the answer is kept per page. This takes that permission back, so the page asks again. list_integrations shows which pages have one.',
      inputSchema: z.object({ name: nameSchema, page: pageSchema }),
      annotations: mutates,
    },
    async ({ name, page }) => {
      if (!canWrite) return writeDenied
      return run(async () => {
        const found = await findIntegration(username, name)
        if (!found.grants.some((grant) => grant.pageId === page)) {
          throw new ToolError(`Page ${page} has no permission to use ${name}.`)
        }
        await api.revokeIntegrationGrant(username, page, found.id)
        return { revoked: true, name, page }
      })
    },
  )

  server.registerTool(
    'call_integration',
    {
      title: 'Make a request through an integration',
      description: [
        'Sends one request the way a pull script or Mini App would, with the integration\'s saved headers added, and returns the service\'s status, headers and body.',
        'Use it to see what a service answers before writing a pull script (set_table_script, target pull).',
        'A text answer comes back as text, cut at 50,000 characters. A binary one is described by its size.',
        'Anything but GET needs the write scope, since it can change things at the service.',
      ].join(' '),
      inputSchema: z.object({
        name: nameSchema,
        path: z.string().describe('Under the base address, starting with /, or a full address under it such as a pagination link'),
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('Default GET'),
        headers: z.record(z.string(), z.string()).optional().describe('Extra headers. The saved ones win over these'),
        body: z.string().optional().describe('Sent as it is. Set Content-Type in headers to match'),
      }),
      annotations: { ...mutates, idempotentHint: false, openWorldHint: true },
    },
    async ({ name, path, method = 'GET', headers, body }) => {
      if (method !== 'GET' && !canWrite) return writeDenied
      return run(async () => {
        const answer = await api.requestThroughIntegration(username, { name, method, path, headers: headers ?? {}, body })
        return { status: answer.status, headers: answer.headers, ...decodeAnswer(answer) }
      })
    },
  )
}
