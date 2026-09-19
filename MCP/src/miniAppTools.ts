import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import * as api from './journals'
import { applyModules, describeData, parseMiniApp, serialiseMiniApp, syntaxError } from './miniApp'
import { ToolError, assertWritable, loadPage, mutates, pageSchema, readOnly, revisionSchema, run, savePage, writeDenied } from './toolkit'

/**
 * Mini App pages: the app's source and the data it has stored.
 */

/** Condensed from the contract the app gives its own assistant
 *  (MiniApp.svelte:170-209) and how the page actually runs the code
 *  (MiniApp.svelte:403-634). */
const RUNTIME = [
  'How a mini app runs:',
  '- html, css and js are assembled into one document in a sandboxed iframe with no same-origin access. js runs as <script type="module">, so top-level await and import work.',
  '- Modules are extra files, .js or .css, at most 12, flat names. Import a .js module as ./name.js. A .css module is added to the page as a style tag.',
  "- The only library is Vue 3: import { createApp } from 'vue'. Nothing else resolves, and external scripts, CDNs and network calls are not part of the contract.",
  '- Persistent storage is the global async Journals object: getItem(key), setItem(key, value), removeItem(key), clear(), keys(). Values are structured-cloned, so pass plain objects and arrays, never JSON strings.',
  '- Files: Journals.upload(file, filename?) resolves to the stored file name, not a URL. Journals.getFileUrl(name) resolves to a URL the iframe can load, which is needed because uploads require auth. Journals.deleteFile(name) removes one.',
  '- What Journals.setItem stores is the data this server shows and set_mini_app_data changes.',
].join('\n')

const OPEN_TAB_WARNING =
  'A mini app that is open in a browser tab keeps its own copy of the code and data. After a save here, its next Journals.setItem there is refused and the tab offers to reload.'

export function registerMiniAppTools(server: McpServer, { username, canWrite }: { username: string; canWrite: boolean }) {
  server.registerTool(
    'get_mini_app',
    {
      title: "Read a mini app's code and data",
      description: [
        'The html, css, js and modules of a MiniApp page, and the data the app has stored. Large stored values come back as a preview; name them in dataKeys to get them whole.',
        'template says whether the page was made from a template. If it was, "Pull latest" in the app replaces the code with the template\'s and clears the stored data.',
        '',
        RUNTIME,
      ].join('\n'),
      inputSchema: z.object({
        page: pageSchema,
        dataKeys: z.array(z.string()).optional().describe('Stored keys to return in full rather than as a preview'),
      }),
      annotations: readOnly,
    },
    async ({ page, dataKeys }) =>
      run(async () => {
        const { info, content, revision } = await loadPage(username, page, ['MiniApp'])
        const doc = parseMiniApp(content)
        const template = await api.getMiniAppTemplate(username, page)
        return {
          page: { id: info.id, name: info.name },
          revision,
          saved: doc !== null,
          ...(doc ? {} : { note: 'Nothing has been saved to this page yet. The app shows a built-in counter demo until something is.' }),
          files: doc?.files ?? { html: '', css: '', js: '', modules: [] },
          data: describeData(doc?.kv ?? {}, dataKeys ?? []),
          template: template.templateId === null ? null : template,
          viewOnly: Boolean(info.view_only || info.parent_view_only),
        }
      }),
  )

  server.registerTool(
    'set_mini_app_files',
    {
      title: "Save a mini app's code",
      description: [
        'Writes any of html, css, js and modules. A file that is not passed keeps its current content, and the stored data is always carried through untouched.',
        'js and .js modules are syntax-checked first and a file that does not parse is refused, unless force is set. Nothing is run.',
        OPEN_TAB_WARNING,
        '',
        RUNTIME,
      ].join('\n'),
      inputSchema: z.object({
        page: pageSchema,
        revision: revisionSchema,
        html: z.string().optional().describe('The full html, not a diff'),
        css: z.string().optional().describe('The full css, not a diff'),
        js: z.string().optional().describe('The full js, not a diff'),
        modules: z
          .object({
            upsert: z.array(z.object({ name: z.string(), code: z.string() })).optional().describe('Modules to add, or replace by name, each with its full code'),
            remove: z.array(z.string()).optional().describe('Names of modules to delete'),
          })
          .optional(),
        force: z.boolean().optional().describe('Save even though a js file has a syntax error. Does not bypass the revision check'),
      }),
      annotations: mutates,
    },
    async ({ page, revision, html, css, js, modules, force }) => {
      if (!canWrite) return writeDenied
      return run(async () => {
        const loaded = await loadPage(username, page, ['MiniApp'])
        assertWritable(loaded, revision)
        if (html === undefined && css === undefined && js === undefined && !modules?.upsert?.length && !modules?.remove?.length) {
          throw new ToolError('Nothing to save: pass at least one of html, css, js or modules')
        }

        const doc = parseMiniApp(loaded.content) ?? { files: { html: '', css: '', js: '', modules: [] }, kv: {} }
        const broken = [
          ...(js === undefined ? [] : [{ name: 'js', code: js }]),
          ...(modules?.upsert ?? []).filter((m) => m.name.endsWith('.js')),
        ]
          .map((file) => ({ file: file.name, error: syntaxError(file.code) }))
          .filter((check) => check.error)
        if (broken.length && !force) {
          throw new ToolError(`Not saved: ${broken.map((b) => `${b.file}: ${b.error}`).join('; ')}. Pass force to save anyway.`)
        }

        doc.files = {
          html: html ?? doc.files.html,
          css: css ?? doc.files.css,
          js: js ?? doc.files.js,
          modules: applyModules(doc.files.modules, modules?.upsert ?? [], modules?.remove ?? []),
        }
        const content = serialiseMiniApp(doc)
        const saved = await savePage(username, loaded, content)
        return {
          saved: true,
          revision: saved,
          modules: doc.files.modules.map((m) => m.name),
          syntaxErrors: broken,
        }
      })
    },
  )

  server.registerTool(
    'set_mini_app_data',
    {
      title: "Change a mini app's stored data",
      description: [
        'Sets and removes keys in the data the app stores through Journals.setItem. Values are JSON, stored as given. clear empties everything first, then set applies. The code is carried through untouched.',
        'For seeding an app or repairing its state. Read the current values with get_mini_app first: set replaces a key whole, it does not merge.',
        OPEN_TAB_WARNING,
      ].join('\n'),
      inputSchema: z.object({
        page: pageSchema,
        revision: revisionSchema,
        set: z.record(z.string(), z.unknown()).optional().describe('Keys to write, each with its full new value'),
        remove: z.array(z.string()).optional().describe('Keys to delete'),
        clear: z.boolean().optional().describe('Delete every key before applying set'),
      }),
      annotations: { ...mutates, destructiveHint: true },
    },
    async ({ page, revision, set, remove, clear }) => {
      if (!canWrite) return writeDenied
      return run(async () => {
        const loaded = await loadPage(username, page, ['MiniApp'])
        assertWritable(loaded, revision)
        const doc = parseMiniApp(loaded.content)
        if (!doc) {
          // Saving data alone would store an app with empty code, replacing
          // the demo the page shows with a blank frame.
          throw new ToolError('This page has no saved app yet. Save its code with set_mini_app_files first.')
        }
        if (!clear && !remove?.length && !Object.keys(set ?? {}).length) {
          throw new ToolError('Nothing to change: pass set, remove or clear')
        }
        for (const key of remove ?? []) {
          if (!(key in doc.kv)) throw new ToolError(`No stored key named ${key}. Stored keys: ${Object.keys(doc.kv).join(', ') || 'none'}`)
        }

        if (clear) doc.kv = {}
        for (const key of remove ?? []) delete doc.kv[key]
        Object.assign(doc.kv, set ?? {})

        const content = serialiseMiniApp(doc)
        const saved = await savePage(username, loaded, content)
        return { saved: true, revision: saved, keys: Object.keys(doc.kv) }
      })
    },
  )
}
