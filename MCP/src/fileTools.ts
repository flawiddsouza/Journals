import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { config } from './config'
import { checkFilename, createTicket, isImage, storedName } from './fileTickets'
import * as api from './journals'
import { ToolError, mutates, pageSchema, readOnly, run, writeDenied } from './toolkit'

/**
 * Files and images on a page. The bytes travel over one-time links (see
 * fileTickets.ts), the same way streaks-and-todo moves task attachments.
 *
 * There is no delete here on purpose. The API's upload delete removes the file
 * from disk, and every other delete in Journals is a soft one.
 */

/** Uploads attach to a page of any type, so this is not loadPage. */
async function pageForFiles(username: string, pageId: number) {
  const info = await api.getPageInfo(username, pageId)
  if (info.locked) throw new ToolError(`Page ${pageId} is password protected and is not readable here`)
  return info
}

export function registerFileTools(server: McpServer, { username, canWrite, origin }: { username: string; canWrite: boolean; origin: string }) {
  server.registerTool(
    'list_page_files',
    {
      title: 'List the files uploaded to a page',
      description:
        'Every file and image that was uploaded to a page, newest first, with its address and whether the page still refers to it. Works for any page type. An address cannot be fetched directly, because the API serves a file only to its owner: use create_file_download.',
      inputSchema: z.object({ page: pageSchema }),
      annotations: readOnly,
    },
    async ({ page }) =>
      run(async () => {
        const info = await pageForFiles(username, page)
        const uploads = await api.listPageUploads(username, page)
        return {
          page: { id: info.id, name: info.name, type: info.type },
          files: uploads.map((upload) => {
            const filename = upload.file_path.split('/').pop()!
            return {
              filename,
              ...(config.publicApiUrl ? { url: `${config.publicApiUrl}/${upload.file_path}` } : {}),
              image: isImage(filename),
              usedOnPage: upload.used,
              uploadedAt: upload.created_at,
            }
          }),
        }
      }),
  )

  server.registerTool(
    'create_file_upload',
    {
      title: 'Create a link to upload a file to a page',
      description: [
        'Mints a one-time link that stores a file from your machine against a page, without its bytes entering the conversation. Send the file with a plain HTTP PUT, for example curl -X PUT --data-binary @photo.png "<uploadUrl>".',
        'The PUT response carries the file\'s address and the markup that shows it: ![](address) for an image, [name](address) for anything else. The upload alone shows nowhere, so put that markup into the page with edit_page or edit_table_rows. A mini app reads it with Journals.getFileUrl(filename).',
        `The link takes one file of up to ${config.maxUploadBytes / 1024 / 1024} MB and expires after 15 minutes. Mint one per file. Files a browser would run when opened, such as .html and .svg, are refused.`,
      ].join(' '),
      inputSchema: z.object({
        page: pageSchema,
        filename: z.string().min(1).describe('The file\'s name with its extension, like "receipt.pdf". The API keeps the extension and names the stored file itself'),
      }),
      annotations: { ...mutates, idempotentHint: false },
    },
    async ({ page, filename }) => {
      if (!canWrite) return writeDenied
      return run(async () => {
        const problem = checkFilename(filename)
        if (problem) throw new ToolError(problem)
        if (!config.publicApiUrl) {
          // Without it the address a page has to use for the file is unknown,
          // and the upload would sit there unreferenced.
          throw new ToolError('Uploads are not set up on this server: JOURNALS_PUBLIC_API_URL is not set. It is the public URL of the Journals API.')
        }
        const info = await pageForFiles(username, page)
        if (info.view_only || info.parent_view_only) throw new ToolError(`Page ${page} is view only. Turn that off in the app before adding files to it.`)

        const { token, expiresAt } = createTicket({ kind: 'upload', username, pageId: page, filename: filename.trim() })
        const uploadUrl = `${origin}/mcp/files/up/${token}`
        return {
          uploadUrl,
          method: 'PUT',
          expiresAt: new Date(expiresAt).toISOString(),
          maxBytes: config.maxUploadBytes,
          example: `curl -X PUT --data-binary @${JSON.stringify(filename.trim())} "${uploadUrl}"`,
        }
      })
    },
  )

  server.registerTool(
    'create_file_download',
    {
      title: 'Create a link to download a file from a page',
      description:
        'Mints a one-time link to a file that was uploaded to a page, so it reaches your machine without its bytes entering the conversation. file is a filename from list_page_files, or the address found in the page, such as the one inside ![](...). Fetch it with a plain HTTP GET, for example curl -o "<filename>" "<downloadUrl>", then open the saved file with your own tools. The link works once and expires after 15 minutes.',
      inputSchema: z.object({
        page: pageSchema,
        file: z.string().min(1).describe('A filename from list_page_files, or the file\'s address as the page has it'),
      }),
      annotations: readOnly,
    },
    async ({ page, file }) =>
      run(async () => {
        await pageForFiles(username, page)
        const filename = storedName(file)
        const uploads = await api.listPageUploads(username, page)
        if (!filename || !uploads.some((upload) => upload.file_path.endsWith(`/${filename}`))) {
          throw new ToolError(`Page ${page} has no uploaded file called ${filename ?? file}. list_page_files shows what it has.`)
        }
        const { token, expiresAt } = createTicket({ kind: 'download', username, filename })
        const downloadUrl = `${origin}/mcp/files/down/${token}`
        return {
          downloadUrl,
          method: 'GET',
          expiresAt: new Date(expiresAt).toISOString(),
          filename,
          example: `curl -o ${JSON.stringify(filename)} "${downloadUrl}"`,
        }
      }),
  )
}
