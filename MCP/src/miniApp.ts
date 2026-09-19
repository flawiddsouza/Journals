import { CodecError } from './lines/inline'

/**
 * The Mini App page document (MiniApp.svelte:341-351): the app's source under
 * `files`, and whatever the running app has stored through Journals.setItem
 * under `kv`. Both live in the one content string, so a save of either always
 * carries the other through.
 */

export type MiniAppModule = { name: string; code: string }
export type MiniAppDocument = {
  files: { html: string; css: string; js: string; modules: MiniAppModule[] }
  kv: Record<string, unknown>
}

/** MAX_MODULES, MiniApp.svelte:44. */
export const MAX_MODULES = 12

/** Null for a page with no app in it: never saved, or content the app cannot
 *  parse. The app shows a built-in demo for both without storing it, and its
 *  next save replaces whatever was there (MiniApp.svelte:211-249, 309-331). */
export function parseMiniApp(content: string | null): MiniAppDocument | null {
  if (!content) return null
  let parsed: { files?: Partial<MiniAppDocument['files']>; kv?: unknown } | null
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  if (!parsed?.files) return null
  const { html = '', css = '', js = '', modules = [] } = parsed.files
  // A page that pulled a template carries kv: null (miniapp_routes.cr:16-27).
  const kv = parsed.kv && typeof parsed.kv === 'object' && !Array.isArray(parsed.kv) ? (parsed.kv as Record<string, unknown>) : {}
  return { files: { html, css, js, modules }, kv }
}

export const serialiseMiniApp = (doc: MiniAppDocument) => JSON.stringify({ files: doc.files, kv: doc.kv })

/** The app's own rule (MiniApp.svelte:46-52): a flat name ending .js or .css. */
export function checkModuleName(name: string): void {
  if (!name || name.includes('/') || name.includes('\\') || !/\.(js|css)$/.test(name)) {
    throw new CodecError(`Module names are flat file names ending in .js or .css. Got "${name}"`)
  }
}

export function applyModules(current: MiniAppModule[], upsert: MiniAppModule[], remove: string[]): MiniAppModule[] {
  for (const name of remove) {
    if (!current.some((m) => m.name === name)) throw new CodecError(`No module named ${name}. This app has: ${current.map((m) => m.name).join(', ') || 'none'}`)
  }
  const next = current.filter((m) => !remove.includes(m.name))
  for (const module of upsert) {
    checkModuleName(module.name)
    const at = next.findIndex((m) => m.name === module.name)
    if (at >= 0) next[at] = module
    else next.push(module)
  }
  if (next.length > MAX_MODULES) throw new CodecError(`A mini app holds at most ${MAX_MODULES} modules; this would make ${next.length}`)
  return next
}

/** A syntax check only. The code is an ES module with top-level await, which
 *  rules out new Function, and it is never run here. */
export function syntaxError(code: string): string | null {
  try {
    new Bun.Transpiler({ loader: 'js' }).transformSync(code)
    return null
  } catch (error) {
    const first = (error as { errors?: { message?: string; position?: { line?: number } }[] }).errors?.[0]
    const where = first?.position?.line ? ` (line ${first.position.line})` : ''
    return (first?.message ?? (error as Error).message ?? 'syntax error') + where
  }
}

/** Stored data as a listing: every key, its size, and a preview short enough
 *  that a large app state does not flood the reply. */
export function describeData(kv: Record<string, unknown>, full: string[]) {
  return Object.entries(kv).map(([key, value]) => {
    const json = JSON.stringify(value) ?? 'null'
    const whole = full.includes(key) || json.length <= 200
    return { key, bytes: json.length, ...(whole ? { value } : { preview: `${json.slice(0, 200)}...` }) }
  })
}
