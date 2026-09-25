/**
 * End to end: builds the real image and drives nginx, the Crystal API and the
 * sidecar together, because OAuth, the tools and the refusals in
 * set_table_script only mean something against the API's own behaviour.
 *
 * Needs Docker. Everything it writes lives in a throwaway volume that goes
 * with the container, so no real data is touched. Run with `bun run e2e`.
 */
import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SECRET = randomBytes(24).toString('hex')
const IMAGE = 'journals-mcp-e2e'
const CONTAINER = `journals-mcp-e2e-${process.pid}`
const REPO = `${import.meta.dir}/..`
// Only ever written into pages as the address of an upload. Nothing fetches it.
const PUBLIC_API = 'https://api.journals.test'
// The fake outside service (e2eService.ts). Its network sits in a range kept
// for documentation, which the API's private address check lets through, so
// integrations reach it the way they reach a real service.
const SERVICE = 'https://service.test'
const NETWORK = `journals-mcp-e2e-${process.pid}`
const SERVICE_CONTAINER = `journals-mcp-e2e-service-${process.pid}`

function docker(args: string[], inherit = false): string {
  const result = Bun.spawnSync(['docker', ...args], {
    cwd: REPO,
    stdout: inherit ? 'inherit' : 'pipe',
    stderr: inherit ? 'inherit' : 'pipe',
  })
  if (result.exitCode !== 0) {
    throw new Error(`docker ${args[0]} failed: ${result.stderr?.toString() ?? ''}`)
  }
  return result.stdout?.toString().trim() ?? ''
}

let failed = 0
const ok = (name: string, cond: boolean, detail?: unknown) => {
  if (!cond) failed++
  console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : (JSON.stringify(detail) ?? '').slice(0, 400))
}

async function checks(base: string, api: string) {
  // ---- seed through the real API
  await fetch(api + '/install')
  const json = (token: string | null, method: string, path: string, body?: unknown) =>
    fetch(api + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { Token: token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => r.json() as Promise<any>)

  await json(null, 'POST', '/register', { username: 'flo', password: 'pw' })
  await json(null, 'POST', '/register', { username: 'other', password: 'pw2' })
  const jwt = (await json(null, 'POST', '/login', { username: 'flo', password: 'pw' })).token as string
  const otherJwt = (await json(null, 'POST', '/login', { username: 'other', password: 'pw2' })).token as string
  const nb = (await json(jwt, 'POST', '/notebooks', { notebookName: 'NB', profileId: null })).insertedRowId
  const sec = (await json(jwt, 'POST', '/sections', { notebookId: nb, sectionName: 'Sec' })).insertedRowId
  const mk = async (t: string, type: string, name: string, parent: number | null, section: number) =>
    (await json(t, 'POST', '/pages', { sectionId: section, pageType: type, pageName: name, pageParentId: parent }))
      .insertedRowId as number
  const table = JSON.stringify({
    columns: [
      { name: 'Amount', type: '' },
      { name: 'Double', type: 'Computed', expression: "return dbl(Number(item['Amount']))" },
    ],
    items: [{ Amount: '1' }, { Amount: '<b>2</b>' }, { Amount: '3' }],
    totals: {},
    widths: { Amount: '120px' },
    customFunctions: 'function dbl(x){return x*2}',
  })
  const open = await mk(jwt, 'Table', 'Open', null, sec)
  const readOnly = await mk(jwt, 'Table', 'ReadOnly', null, sec)
  const locked = await mk(jwt, 'Table', 'Locked', null, sec)
  const notes = await mk(jwt, 'FlatPage', 'Notes', null, sec)
  const group = await mk(jwt, 'PageGroup', 'Group', null, sec)
  const inGroup = await mk(jwt, 'Table', 'InRoGroup', group, sec)
  for (const id of [open, readOnly, locked, inGroup]) await json(jwt, 'PUT', `/pages/${id}`, { pageContent: table })
  await json(jwt, 'PUT', `/pages/view-only/${readOnly}`, { viewOnly: true })
  await json(jwt, 'PUT', `/pages/view-only/${group}`, { viewOnly: true })
  await json(jwt, 'PUT', `/pages/password-protect/${locked}`, { password: 'x' })
  // another user's table, to check nothing crosses users
  const onb = (await json(otherJwt, 'POST', '/notebooks', { notebookName: 'ONB', profileId: null })).insertedRowId
  const osec = (await json(otherJwt, 'POST', '/sections', { notebookId: onb, sectionName: 'OSec' })).insertedRowId
  const others = await mk(otherJwt, 'Table', 'Private', null, osec)
  await json(otherJwt, 'PUT', `/pages/${others}`, { pageContent: table })

  const contentOf = async (id: number) => (await json(jwt, 'GET', `/pages/content/${id}`)).content as string
  const historyOf = async (id: number) => ((await json(jwt, 'GET', `/page-history/${id}`)) as unknown[]).length

  // ---- discovery, through nginx
  const unauth = await fetch(base + '/mcp', { method: 'POST' })
  ok(
    '401 + WWW-Authenticate without token',
    unauth.status === 401 &&
      (unauth.headers.get('www-authenticate') ?? '').includes(base + '/.well-known/oauth-protected-resource/mcp'),
    unauth.headers.get('www-authenticate'),
  )
  const meta = (await (
    await fetch(base + '/.well-known/oauth-authorization-server', { headers: { 'x-forwarded-proto': 'https' } })
  ).json()) as any
  ok('behind a TLS proxy the issuer says https', meta.issuer === base.replace('http:', 'https:'), meta.issuer)
  ok('metadata says the redirect carries iss', meta.authorization_response_iss_parameter_supported === true)
  ok('/mcp/ below the exact match is not proxied', (await fetch(base + '/mcp/x', { method: 'POST' })).status !== 401)
  ok('other /.well-known paths still belong to the UI', (await fetch(base + '/.well-known/acme-challenge/x')).status === 404)

  // ---- OAuth
  async function authorize(scope: string) {
    const reg = (await (
      await fetch(base + '/oauth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ redirect_uris: ['http://127.0.0.1:1/cb'], client_name: 'e2e <b>client</b>' }),
      })
    ).json()) as any
    const verifier = randomBytes(32).toString('base64url')
    const q = {
      client_id: reg.client_id as string,
      redirect_uri: 'http://127.0.0.1:53999/cb',
      response_type: 'code',
      state: 'st',
      scope,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }
    const page = await fetch(base + '/oauth/authorize?' + new URLSearchParams(q))
    const post = (password: string) =>
      fetch(base + '/oauth/authorize', {
        method: 'POST',
        redirect: 'manual',
        body: new URLSearchParams({ ...q, username: 'flo', password }),
      })
    const wrong = await post('nope')
    const right = await post('pw')
    const code = new URL(right.headers.get('location') ?? 'http://x').searchParams.get('code') ?? ''
    const tok = (v: string) =>
      fetch(base + '/oauth/token', {
        method: 'POST',
        body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: q.client_id, code_verifier: v }),
      })
    return { reg, page, wrong, right, code, tok, verifier }
  }
  const a = await authorize('read write')
  const html = await a.page.text()
  ok('consent page renders, loopback port ignored, client name escaped', a.page.status === 200 && !html.includes('<b>client</b>'))
  ok('wrong password -> 401, no code', a.wrong.status === 401)
  ok('the consent page cannot be framed, on either answer', [a.page, a.wrong].every((r) => r.headers.get('content-security-policy') === "frame-ancestors 'none'" && r.headers.get('x-frame-options') === 'DENY'))
  const loc = a.right.headers.get('location') ?? ''
  ok('right password -> 302 with code, state, iss', a.right.status === 302 && !!a.code && loc.includes('state=st') && loc.includes('iss='), loc)
  ok('bad PKCE verifier refused', (await a.tok('wrong')).status === 400)
  ok('code is dead after a failed attempt', (await a.tok(a.verifier)).status === 400)
  const b = await authorize('read write')
  const tokens = (await (await b.tok(b.verifier)).json()) as any
  ok('token issued with both scopes', tokens.scope === 'read write' && !!tokens.access_token, tokens)
  const refresh = () =>
    fetch(base + '/oauth/token', {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
    })
  const r1 = (await (await refresh()).json()) as any
  ok('refresh rotates, old refresh dies', !!r1.access_token && (await refresh()).status === 400)
  const ro = await authorize('read')
  const roTok = (await (await ro.tok(ro.verifier)).json()) as any
  ok('read-only grant carries only read', roTok.scope === 'read', roTok.scope)
  const evil = await fetch(
    base +
      '/oauth/authorize?' +
      new URLSearchParams({
        client_id: a.reg.client_id,
        redirect_uri: 'https://evil.example/cb',
        response_type: 'code',
        code_challenge: 'x',
        code_challenge_method: 'S256',
      }),
  )
  ok('unregistered redirect_uri refused', evil.status === 400)
  ok('garbage bearer -> 401', (await fetch(base + '/mcp', { method: 'POST', headers: { authorization: 'Bearer garbage' } })).status === 401)

  // ---- MCP
  let id = 0
  async function rpc(token: string, method: string, params: unknown) {
    const res = await fetch(base + '/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    })
    const text = await res.text()
    const data = text.startsWith('{')
      ? text
      : text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).join('')
    try {
      return JSON.parse(data)
    } catch {
      return { status: res.status, text }
    }
  }
  const call = async (token: string, name: string, args: unknown) => {
    const r = await rpc(token, 'tools/call', { name, arguments: args })
    return {
      err: !!r.result?.isError,
      data: r.result?.structuredContent,
      text: (r.result?.content?.[0]?.text ?? '') as string,
      raw: r,
    }
  }

  const T = r1.access_token as string
  const init = await rpc(T, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '0' } })
  ok('initialize', init.result?.serverInfo?.name === 'journals', init)
  const tools = await rpc(T, 'tools/list', {})
  const toolNames = (tools.result?.tools ?? []).map((t: any) => t.name).sort()
  ok(
    'the tools are the documented twenty-eight',
    toolNames.join() ===
      'call_integration,create_file_download,create_file_upload,create_integration,create_page,delete_integration,delete_page,edit_page,edit_table_columns,edit_table_rows,edit_table_stats,evaluate_table_script,get_mini_app,get_page,get_table_config,get_table_rows,list_integrations,list_page_files,list_pages,list_sections,move_page,rename_page,revoke_integration_grant,search_pages,set_mini_app_data,set_mini_app_files,set_table_script,update_integration',
    toolNames,
  )

  const list = await call(T, 'list_pages', { type: 'Table' })
  const names = (list.data?.pages ?? []).map((p: any) => p.name).sort()
  ok('list_pages: own tables once each, group child as "Group > Page", nobody else\'s', names.join('|') === 'Group > InRoGroup|Locked|Open|ReadOnly', names)
  const cfg = await call(T, 'get_table_config', { page: open })
  ok('get_table_config returns revision, profiles, sample', !!cfg.data?.revision && cfg.data.profiles.length === 2 && cfg.data.sample.length > 0, cfg.raw)
  const evaluateTool = (tools.result?.tools ?? []).find((t: any) => t.name === 'evaluate_table_script')
  ok(
    'the script contracts come with get_table_config, not with every tool listing',
    String(cfg.data?.contracts?.rowStyle).includes('no columnName parameter') && Object.keys(cfg.data?.contracts ?? {}).length === 8 && 'pull' in (cfg.data?.contracts ?? {}) && !evaluateTool.description.includes('new Function'),
    evaluateTool?.description,
  )
  ok('non-Table page refused', (await call(T, 'get_table_config', { page: notes })).err)
  ok('locked page refused', (await call(T, 'get_table_config', { page: locked })).err)
  const foreign = await call(T, 'get_table_config', { page: others })
  ok("another user's page is not readable", foreign.err && !foreign.text.includes('Amount'), foreign.text)
  const ev = await call(T, 'evaluate_table_script', {
    page: open,
    target: 'computed',
    column: 'Double',
    code: "return dbl(Number(String(item['Amount']).replace(/<[^>]*>/g,'')))",
  })
  ok('evaluate_table_script runs over the real rows', ev.data?.rowsEvaluated === 3 && ev.data.sample.map((s: any) => s.output).join() === '2,4,6', ev.raw)
  const leak = await call(roTok.access_token, 'evaluate_table_script', {
    page: open,
    target: 'computed',
    column: 'Double',
    code: "return [items, item, this, console].map(o => o.constructor.constructor('return typeof process === \"undefined\" ? \"none\" : process.env.JWT_SECRET')()).join()",
  })
  ok('evaluate_table_script cannot read JWT_SECRET', !JSON.stringify(leak.raw).includes(SECRET) && leak.data?.sample?.[0]?.output === 'none,none,none,none', leak.raw)

  const before = await contentOf(open)
  const historyBefore = await historyOf(open)
  const save = (token: string, page: number, revision: string, extra: object = {}) =>
    call(token, 'set_table_script', {
      page,
      revision,
      target: 'computed',
      column: 'Double',
      code: "return dbl(Number(item['Amount'])) + 1",
      ...extra,
    })
  const untouched = async (pageId = open) => (await contentOf(pageId)) === (pageId === open ? before : table)

  ok('save without write scope refused', (await save(roTok.access_token, open, cfg.data.revision)).err && (await untouched()))
  ok('save with stale revision refused', (await save(T, open, 'stale')).err && (await untouched()))
  const cfgRo = await call(T, 'get_table_config', { page: readOnly })
  const cfgGr = await call(T, 'get_table_config', { page: inGroup })
  const vo = await save(T, readOnly, cfgRo.data?.revision)
  ok('view-only page is readable but not writable', !cfgRo.err && vo.err && vo.text.includes('view only') && (await untouched(readOnly)), vo.text)
  const vog = await save(T, inGroup, cfgGr.data?.revision, { force: true })
  ok('page in a view-only group not writable, even with force', vog.err && vog.text.includes('view only') && (await untouched(inGroup)), vog.text)
  ok('script that loops forever refused even with force', (await save(T, open, cfg.data.revision, { code: 'while(true){}', force: true })).err && (await untouched()))
  ok('script that throws on every row refused', (await save(T, open, cfg.data.revision, { code: 'return nope()' })).err && (await untouched()))
  const helpers = await call(T, 'set_table_script', { page: open, revision: cfg.data.revision, target: 'customFns', code: 'function renamed(x){return x}' })
  ok('breaking a helper a computed column uses is refused', helpers.err && (await untouched()))

  const good = await save(T, open, cfg.data.revision)
  const stored = JSON.parse(await contentOf(open))
  ok(
    'valid save persists in the API, rest of the document intact',
    !good.err &&
      stored.columns[1].expression.endsWith('+ 1') &&
      stored.items.length === 3 &&
      stored.widths.Amount === '120px' &&
      stored.customFunctions.includes('dbl'),
    good.raw,
  )
  ok('the save wrote a page history entry', (await historyOf(open)) === historyBefore + 1, [historyBefore, await historyOf(open)])
  ok('the old revision is now stale', (await save(T, open, cfg.data.revision)).err)

  await statsWidgetChecks()
  await tableRowChecks()
  await documentChecks()
  await miniAppChecks()
  await createChecks()
  await fileChecks()
  await conflictChecks()
  await pageChecks()
  await mcpIntegrationChecks()
  // Last: it takes T's access away.
  await connectionChecks()
  await integrationChecks()

  // ---- a save made from an older copy of a page is refused by the API itself
  async function conflictChecks() {
    const page = await mk(jwt, 'FlatPage', 'Shared', null, sec)
    const put = (target: number, body: object) =>
      fetch(`${api}/pages/${target}`, { method: 'PUT', headers: { 'content-type': 'application/json', Token: jwt }, body: JSON.stringify(body) })
    const first = await put(page, { pageContent: '<div>typed in a tab</div>' })
    const firstBody = (await first.json()) as any
    // What an open browser tab holds: the content and the revision it came with.
    const tab = (await json(jwt, 'GET', `/pages/content/${page}`)) as { content: string; revision: string }
    const seen = await call(T, 'get_page', { page })
    ok(
      'the API reports a revision with the content and after a save, and it is the one the tools use',
      first.status === 200 && firstBody.revision === tab.revision && seen.data?.revision === tab.revision,
      [firstBody, tab.revision, seen.data?.revision],
    )

    const agent = await call(T, 'edit_page', { page, revision: seen.data?.revision, after: 1, text: 'added by an agent' })
    const stale = await put(page, { pageContent: '<div>typed in a tab</div><div>more typing</div>', baseRevision: tab.revision })
    const staleBody = (await stale.json()) as any
    ok(
      "the tab's next save, made from its older copy, is refused and the agent's line survives",
      !agent.err && stale.status === 409 && staleBody.revision === agent.data?.revision && (await contentOf(page)).includes('added by an agent'),
      [stale.status, staleBody],
    )
    const history = await historyOf(page)
    const fresh = await put(page, { pageContent: (await contentOf(page)) + '<div>after reloading</div>', baseRevision: staleBody.revision })
    ok('a save from the current revision goes through', fresh.status === 200 && (await contentOf(page)).endsWith('<div>after reloading</div>') && (await historyOf(page)) === history + 1)
    ok('a refused save writes no history', (await put(page, { pageContent: 'x', baseRevision: tab.revision })).status === 409 && (await historyOf(page)) === history + 1)
    const same = await put(page, { pageContent: await contentOf(page), baseRevision: tab.revision })
    ok('saving what is already there is not a conflict', same.status === 200)
    const unchecked = await put(page, { pageContent: '<div>an old client</div>' })
    ok('a save that names no revision is not checked', unchecked.status === 200 && (await contentOf(page)) === '<div>an old client</div>')

    // The other way round: the page changes between a tool's read and its write.
    const read = await call(T, 'get_page', { page })
    await put(page, { pageContent: '<div>the tab got there first</div>' })
    const late = await call(T, 'edit_page', { page, revision: read.data?.revision, after: 1, text: 'too late' })
    ok('a tool save from an older read is refused too', late.err && (await contentOf(page)) === '<div>the tab got there first</div>', late.text)

    // A page group holds only which page is open in it. Two tabs switching
    // pages is not a conflict.
    const box = await mk(jwt, 'PageGroup', 'Tabs', null, sec)
    await put(box, { pageContent: '{"activePageId":1}' })
    ok('a page group takes the last save whatever revision it names', (await put(box, { pageContent: '{"activePageId":2}', baseRevision: 'not-the-revision' })).status === 200)
  }

  // ---- finding and managing pages
  async function pageChecks() {
    const sec2 = (await json(jwt, 'POST', '/sections', { notebookId: nb, sectionName: 'Second' })).insertedRowId as number
    const made = await call(T, 'create_page', { name: 'Quarterly zebra report', type: 'FlatPage', section: sec })
    const id = made.data?.id as number
    const page = await call(T, 'get_page', { page: id })
    await call(T, 'edit_page', { page: id, revision: page.data?.revision, after: 0, text: 'the okapi budget is late' })

    const inSection = await call(T, 'list_pages', { section: sec2 })
    const byName = await call(T, 'list_pages', { name: 'ZEBRA' })
    const capped = await call(T, 'list_pages', { limit: 2 })
    ok('list_pages narrows to a section', !inSection.err && inSection.data?.total === 0, inSection.raw)
    ok('list_pages narrows by name, whatever the case', byName.data?.pages?.length === 1 && byName.data.pages[0].id === id, byName.raw)
    ok('list_pages stops at limit and says how many there are', capped.data?.pages?.length === 2 && capped.data.total > 2 && /first 2 of/.test(capped.data.note), capped.raw)
    ok("list_pages refuses another user's section", (await call(T, 'list_pages', { section: osec })).err)

    const named = await call(T, 'search_pages', { query: 'zebra' })
    ok('search_pages finds a page by name and reports its type', named.data?.pages?.[0]?.id === id && named.data.pages[0].type === 'FlatPage' && named.data.pages[0].section === 'Sec', named.raw)
    const said = await call(T, 'search_pages', { query: 'okapi', text: true })
    // The snippet is the page as it reads: no <div> from the stored HTML, and
    // no marker round the match, which would be markup in every line written back.
    ok('search_pages finds a page by what it says, and the snippet is what the page says', said.data?.pages?.[0]?.id === id && said.data.pages[0].snippet === 'the okapi budget is late', said.raw)
    ok("search_pages never reaches another user's pages", ((await call(T, 'search_pages', { query: 'Private' })).data?.pages ?? []).length === 0)

    ok('rename_page without write scope refused', (await call(roTok.access_token, 'rename_page', { page: id, name: 'x' })).err)
    const renamed = await call(T, 'rename_page', { page: id, name: '  Zebra report  ' })
    ok('rename_page renames, trimmed', !renamed.err && renamed.data?.from === 'Quarterly zebra report' && (await json(jwt, 'GET', `/pages/info/${id}`)).name === 'Zebra report', renamed.raw)
    ok('a blank name is refused', (await call(T, 'rename_page', { page: id, name: '   ' })).err)
    ok("another user's page cannot be renamed", (await call(T, 'rename_page', { page: others, name: 'mine now' })).err && (await json(otherJwt, 'GET', `/pages/info/${others}`)).name === 'Private')
    ok('a password protected page is managed in the app', (await call(T, 'rename_page', { page: locked, name: 'x' })).err && (await call(T, 'delete_page', { page: locked })).err)

    const box = await call(T, 'create_page', { name: 'Box', type: 'PageGroup', section: sec })
    const boxId = box.data?.id as number
    const intoGroup = await call(T, 'move_page', { page: id, group: boxId })
    const afterIn = await json(jwt, 'GET', `/pages/info/${id}`)
    ok('move_page puts a page into a page group', !intoGroup.err && afterIn.parent_id === boxId && afterIn.section_id === sec, intoGroup.raw)
    ok('moving it to where it already is, is refused', (await call(T, 'move_page', { page: id, group: boxId })).err)
    ok('a page group cannot go inside a page group', (await call(T, 'move_page', { page: boxId, group })).err)
    ok("a page cannot be moved to another user's section", (await call(T, 'move_page', { page: id, section: osec })).err && (await json(jwt, 'GET', `/pages/info/${id}`)).parent_id === boxId)
    ok('a page cannot be moved into a view-only group', (await call(T, 'move_page', { page: notes, group })).err)

    const groupMoved = await call(T, 'move_page', { page: boxId, section: sec2 })
    const childAfter = await json(jwt, 'GET', `/pages/info/${id}`)
    ok(
      'a page group moves with the pages inside it, which follow it to the new section',
      !groupMoved.err && groupMoved.data?.pagesInside === 1 && childAfter.section_id === sec2 && childAfter.parent_id === boxId && (await json(jwt, 'GET', `/pages/info/${boxId}`)).section_id === sec2,
      groupMoved.raw,
    )

    await fetch(`${api}/pages/${boxId}`, { method: 'PUT', headers: { 'content-type': 'application/json', Token: jwt }, body: JSON.stringify({ pageContent: JSON.stringify({ activePageId: id }) }) })
    const out = await call(T, 'move_page', { page: id, section: sec })
    const afterOut = await json(jwt, 'GET', `/pages/info/${id}`)
    ok(
      'move_page takes a page out of a group, and the group forgets it was the open one',
      !out.err && afterOut.parent_id === null && afterOut.section_id === sec && (await contentOf(boxId)) === '{"activePageId":null}',
      [out.raw, await contentOf(boxId)],
    )

    ok('delete_page without write scope refused', (await call(roTok.access_token, 'delete_page', { page: id })).err)
    await call(T, 'move_page', { page: id, group: boxId })
    const gone = await call(T, 'delete_page', { page: boxId })
    const bin = (await json(jwt, 'GET', '/recycle-bin')).pages.map((p: any) => p.id)
    ok(
      'delete_page sends a page group and the pages inside it to the recycle bin, and erases nothing',
      !gone.err && gone.data?.pagesInsideDeleted?.join() === 'Zebra report' && bin.includes(boxId) && bin.includes(id),
      [gone.raw, bin],
    )
    ok('a deleted page is gone from the tools', (await call(T, 'get_page', { page: id })).err && (await call(T, 'delete_page', { page: id })).err)
    await json(jwt, 'POST', `/recycle-bin/restore/page/${boxId}`, {})
    ok('and the app can restore it', (await json(jwt, 'GET', `/pages/info/${boxId}`)).name === 'Box')
    ok("another user's page cannot be deleted", (await call(T, 'delete_page', { page: others })).err && (await json(otherJwt, 'GET', `/pages/info/${others}`)).name === 'Private')
  }

  // ---- files: up through nginx into the API, onto a page, and back down
  async function fileChecks() {
    const target = await mk(jwt, 'FlatPage', 'With files', null, sec)
    const bytes = new Uint8Array(3000).map((_, i) => (i * 7) % 256)
    const sameBytes = (other: ArrayBuffer) => Buffer.from(other).equals(Buffer.from(bytes))

    ok('create_file_upload without write scope refused', (await call(roTok.access_token, 'create_file_upload', { page: target, filename: 'a.png' })).err)
    const active = await call(T, 'create_file_upload', { page: target, filename: 'page.html' })
    ok('a file a browser would run is refused', active.err && active.text.includes('not accepted'), active.text)
    ok('a file name without an extension is refused', (await call(T, 'create_file_upload', { page: target, filename: 'README' })).err)
    ok('no upload to a view-only page', (await call(T, 'create_file_upload', { page: readOnly, filename: 'a.png' })).err)
    ok("no upload to another user's page", (await call(T, 'create_file_upload', { page: others, filename: 'a.png' })).err)

    const link = await call(T, 'create_file_upload', { page: target, filename: 'photo.png' })
    ok('the upload link is on the address the client used', !link.err && String(link.data?.uploadUrl).startsWith(`${base}/mcp/files/up/`), link.raw)
    const put = await fetch(link.data?.uploadUrl, { method: 'PUT', body: bytes })
    const uploaded = (await put.json()) as any
    ok(
      'a PUT to the link stores the file and answers with the markup to insert',
      put.status === 200 && uploaded.url === `${PUBLIC_API}/uploads/images/${uploaded.filename}` && uploaded.markup === `![](${uploaded.url})` && uploaded.bytes === 3000,
      uploaded,
    )
    ok('the link works once', (await fetch(link.data?.uploadUrl, { method: 'PUT', body: bytes })).status === 404)
    const inApi = await fetch(`${api}/uploads/images/${uploaded.filename}`, { headers: { Token: jwt } })
    ok('the API holds exactly the bytes that were sent', inApi.status === 200 && sameBytes(await inApi.arrayBuffer()))

    const before = await call(T, 'list_page_files', { page: target })
    ok('list_page_files shows the file, not yet used on the page', before.data?.files?.length === 1 && before.data.files[0].usedOnPage === false && before.data.files[0].image === true, before.raw)
    const page = await call(T, 'get_page', { page: target })
    const placed = await call(T, 'edit_page', { page: target, revision: page.data?.revision, after: 0, text: `a photo\n${uploaded.markup}` })
    ok(
      'the markup goes onto the page as the image tag the app writes',
      !placed.err && (await contentOf(target)) === `<div>a photo</div><div><img style="max-width: 100%" loading="lazy" src="${uploaded.url}"></div>`,
      await contentOf(target),
    )
    ok('and the API now counts the file as used', (await call(T, 'list_page_files', { page: target })).data?.files?.[0]?.usedOnPage === true)

    const doc = await call(T, 'create_file_upload', { page: target, filename: 'Q1 report.pdf' })
    const docPut = (await (await fetch(doc.data?.uploadUrl, { method: 'PUT', body: bytes })).json()) as any
    ok('anything that is not an image comes back as a link', docPut.markup === `[Q1 report.pdf](${docPut.url})` && docPut.image === false, docPut)

    const down = await call(roTok.access_token, 'create_file_download', { page: target, file: uploaded.url })
    const got = await fetch(down.data?.downloadUrl)
    ok(
      'a download link, minted from the address in the page with a read-only token, returns the bytes as an attachment',
      !down.err && got.status === 200 && (got.headers.get('content-disposition') ?? '').startsWith('attachment') && got.headers.get('x-content-type-options') === 'nosniff' && sameBytes(await got.arrayBuffer()),
      [down.raw, got.status],
    )
    ok('the download link works once', (await fetch(down.data?.downloadUrl)).status === 404)
    ok('a file that is not on the page gets no link', (await call(T, 'create_file_download', { page: notes, file: uploaded.filename })).err)
    ok('an upload link cannot be used to download', (await fetch(String((await call(T, 'create_file_upload', { page: target, filename: 'b.png' })).data?.uploadUrl).replace('/up/', '/down/'))).status === 404)

    // The way an agent does it: the curl commands the tools print, with a body
    // big enough that curl asks the server to confirm before sending.
    const dir = mkdtempSync(join(tmpdir(), 'journals-e2e-'))
    try {
      const large = new Uint8Array(2 * 1024 * 1024).map((_, i) => (i * 13) % 256)
      writeFileSync(join(dir, 'in.bin'), large)
      const viaCurl = await call(T, 'create_file_upload', { page: target, filename: 'clip.mp4' })
      const sent = Bun.spawnSync(['curl', '-sS', '-X', 'PUT', '--data-binary', `@${join(dir, 'in.bin')}`, viaCurl.data?.uploadUrl])
      const answer = JSON.parse(sent.stdout.toString() || '{}')
      const back = await call(T, 'create_file_download', { page: target, file: answer.filename ?? 'none' })
      Bun.spawnSync(['curl', '-sS', '-o', join(dir, 'out.bin'), back.data?.downloadUrl ?? `${base}/mcp/files/down/none`])
      ok(
        'the printed curl commands move a 2 MB file up and back down intact',
        sent.exitCode === 0 && answer.bytes === large.byteLength && Buffer.from(readFileSync(join(dir, 'out.bin'))).equals(Buffer.from(large)),
        [sent.stderr.toString(), answer, back.text],
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }

    const big = await call(T, 'create_file_upload', { page: target, filename: 'big.bin' })
    const tooBig = await fetch(big.data?.uploadUrl, { method: 'PUT', body: new Uint8Array(25 * 1024 * 1024 + 1) })
    ok('a file over the limit is refused by the sidecar, not by nginx', tooBig.status === 413 && ((await tooBig.json()) as any).error?.includes('limit'), tooBig.status)
    ok('and nothing of it was stored', (await call(T, 'list_page_files', { page: target })).data?.files?.length === 3)
  }

  // ---- new pages, and a table built from nothing
  async function createChecks() {
    const sections = await call(T, 'list_sections', {})
    const mine = (sections.data?.sections ?? []).map((s: any) => s.section)
    ok("list_sections shows own sections and nobody else's", mine.join() === 'Sec' && sections.data.sections[0].sectionId === sec, sections.raw)
    const emptySec = (await json(jwt, 'POST', '/sections', { notebookId: nb, sectionName: 'Empty' })).insertedRowId as number
    const found = await call(T, 'list_sections', {})
    ok('a section with no pages is still found', (found.data?.sections ?? []).some((s: any) => s.sectionId === emptySec))

    ok('create_page without write scope refused', (await call(roTok.access_token, 'create_page', { name: 'x', type: 'FlatPage', section: emptySec })).err)
    const theirs = await call(T, 'create_page', { name: 'x', type: 'FlatPage', section: osec })
    ok("create_page in another user's section refused", theirs.err && theirs.text.includes('No section'), theirs.text)
    ok('an unknown page type is refused', (await call(T, 'create_page', { name: 'x', type: 'Nonsense', section: emptySec })).err)

    const made = await call(T, 'create_page', { name: 'Budget', type: 'Table', section: emptySec })
    const listed = ((await json(jwt, 'GET', `/pages/${emptySec}`)) as { id: number; name: string; type: string }[]).map((p) => `${p.id}:${p.name}:${p.type}`)
    ok('create_page makes the page where the app looks for it', !made.err && listed.join() === `${made.data?.id}:Budget:Table`, [made.raw, listed])

    const budget = made.data?.id as number
    const blank = await call(T, 'get_table_rows', { page: budget })
    ok('a new table reads as empty', blank.data?.rowCount === 0 && blank.data.columns.length === 0, blank.raw)
    const columns = await call(T, 'edit_table_columns', {
      page: budget,
      revision: blank.data?.revision,
      add: [{ name: 'Date' }, { name: 'Amount', align: 'Right', width: '90px' }],
    })
    const badWidth = await call(T, 'edit_table_columns', { page: budget, revision: columns.data?.revision, update: [{ column: 'Date', width: '10px; color: red' }] })
    ok('a width that is more than a length is refused', badWidth.err && badWidth.text.includes('A width is'), badWidth.text)
    const filled = await call(T, 'edit_table_rows', { page: budget, revision: columns.data?.revision, add: [{ Date: '01-May-26', Amount: 5 }, { Date: '02-May-26', Amount: 7 }] })
    const total = await call(T, 'set_table_script', { page: budget, revision: filled.data?.revision, target: 'total', column: 'Amount', code: "return items.reduce((a, r) => a + Number(r['Amount']), 0)" })
    const renamed = await call(T, 'edit_table_columns', { page: budget, revision: (await call(T, 'get_table_config', { page: budget })).data?.revision, update: [{ column: 'Amount', name: 'Spent' }], order: ['Spent', 'Date'] })
    const built = JSON.parse(await contentOf(budget))
    ok(
      'a table built from nothing: columns, rows, a total, then a rename that carries the total and width',
      !columns.err &&
        !filled.err &&
        !total.err &&
        !renamed.err &&
        built.columns.map((c: any) => c.name).join() === 'Spent,Date' &&
        built.items.map((r: any) => `${r.Date}=${r.Spent}`).join() === '01-May-26=5,02-May-26=7' &&
        Object.keys(built.totals).join() === 'Spent' &&
        built.widths.Spent === '90px' &&
        // Every key the app reads without a fallback has to be there.
        ['columns', 'items', 'totals', 'widths', 'rowStyle', 'startupScript', 'customFunctions', 'note'].every((k) => k in built),
      [columns.text, filled.text, total.text, renamed.text, built],
    )
    ok('the rename says the total still reads the old name', renamed.data?.scriptsToCheck?.[0]?.mentionedIn?.join() === 'total Amount', renamed.raw)

    const inGroupPage = await call(T, 'create_page', { name: 'Inside', type: 'TaskList', group })
    ok('a page cannot be added to a view-only page group', inGroupPage.err && inGroupPage.text.includes('view only'), inGroupPage.text)
    const freeGroup = await call(T, 'create_page', { name: 'Projects', type: 'PageGroup', section: emptySec })
    const child = await call(T, 'create_page', { name: 'Todo', type: 'TaskList', group: freeGroup.data?.id })
    const children = ((await json(jwt, 'GET', `/page-group/${freeGroup.data?.id}`)) as { id: number }[]).map((p) => p.id)
    ok('create_page inside a page group, section taken from the group', !child.err && children.join() === String(child.data?.id), [child.raw, children])
    ok('a page group cannot go inside a page group', (await call(T, 'create_page', { name: 'x', type: 'PageGroup', group: freeGroup.data?.id })).err)
    ok('group has to be a page group', (await call(T, 'create_page', { name: 'x', type: 'FlatPage', group: budget })).err)
    const firstTask = await call(T, 'edit_page', { page: child.data?.id, revision: (await call(T, 'get_page', { page: child.data?.id })).data?.revision, start: 1, end: 1, text: '- [ ] first' })
    ok('the new page takes an edit straight away', !firstTask.err, firstTask.raw)
  }

  // ---- stats widgets
  async function statsWidgetChecks() {
    const at = async () => (await call(T, 'get_table_config', { page: open })).data?.revision
    const dry = await call(T, 'evaluate_table_script', { page: open, target: 'statsWidget', code: 'return items.length' })
    ok('a stats widget expression can be dry run before any widget holds it', dry.data?.sample?.[0]?.output === '3', dry.raw)

    const bad = await call(T, 'edit_table_stats', { page: open, revision: await at(), add: [{ title: 'Broken', type: 'stat', expression: 'return nope(' }] })
    ok('a widget whose expression does not compile is refused', bad.err && !JSON.parse(await contentOf(open)).stats?.widgets?.length, bad.text)

    const made = await call(T, 'edit_table_stats', {
      page: open,
      revision: await at(),
      add: [
        { title: 'Rows', type: 'stat', align: 'center', expression: 'return items.length' },
        { title: 'By amount', type: 'bar', colSpan: 6, align: 'center', expression: "return { labels: items.map((r) => String(r['Amount'])), values: items.map((_, i) => i) }" },
      ],
    })
    ok('widgets are created with ids of their own', !made.err && made.data?.added?.length === 2, made.raw)
    const saved = JSON.parse(await contentOf(open)).stats?.widgets ?? []
    ok(
      'what is saved is the shape the app writes',
      saved.length === 2 &&
        saved[0].align === 'center' &&
        saved[0].colSpan === 2 &&
        saved[1].align === undefined &&
        saved[1].colSpan === 6 &&
        saved.every((w: any) => typeof w.id === 'string' && w.id.length > 10),
      saved,
    )

    const id = made.data?.added?.[0]
    const script = await call(T, 'set_table_script', { page: open, revision: await at(), target: 'statsWidget', widgetId: id, code: 'return items.length * 2' })
    ok('set_table_script fills a widget made here', !script.err && (JSON.parse(await contentOf(open)).stats.widgets[0].expression as string).includes('* 2'), script.raw)
    ok('saving a statsWidget with no widgetId says how to make one', (await call(T, 'set_table_script', { page: open, revision: await at(), target: 'statsWidget', code: 'return 1' })).text.includes('edit_table_stats'))

    const second = made.data?.added?.[1]
    const reordered = await call(T, 'edit_table_stats', { page: open, revision: await at(), order: [second, id] })
    const inOrder = async () => JSON.parse(await contentOf(open)).stats.widgets.map((w: any) => w.id).join()
    ok('order puts them in sequence', !reordered.err && (await inOrder()) === `${second},${id}`, reordered.raw)
    const both = await call(T, 'edit_table_stats', { page: open, revision: await at(), add: [{ title: 'Third', type: 'stat', expression: 'return 1' }], order: [second, id] })
    ok(
      'ordering a widget added in the same batch is refused, and adds nothing',
      both.err && both.text.includes('before') && JSON.parse(await contentOf(open)).stats.widgets.length === 2,
      both.text,
    )
    ok('an unknown widget id names the ones that exist', (await call(T, 'edit_table_stats', { page: open, revision: await at(), update: [{ widget: 'nope', title: 'x' }] })).text.includes('Rows'))
    ok('stale revision refused', (await call(T, 'edit_table_stats', { page: open, revision: 'stale', remove: [id] })).err)
    ok('no write scope refused', (await call(roTok.access_token, 'edit_table_stats', { page: open, revision: await at(), remove: [id] })).err)

    const gone = await call(T, 'edit_table_stats', { page: open, revision: await at(), remove: made.data?.added ?? [] })
    ok('removal takes the widgets and leaves the key', !gone.err && JSON.parse(await contentOf(open)).stats.widgets.length === 0, gone.raw)
  }

  // ---- table data
  async function tableRowChecks() {
    const rows = await call(T, 'get_table_rows', { page: open })
    ok(
      'get_table_rows returns cells as text and computed columns as their values',
      rows.data?.rowCount === 3 &&
        rows.data.rows.map((r: any) => r.values.Amount).join() === '1,**2**,3' &&
        rows.data.rows[0].values.Double === '3' &&
        rows.data.columns[1].computed === true,
      rows.raw,
    )
    ok('get_table_rows on a Flat Page points at get_page', (await call(T, 'get_table_rows', { page: notes })).text.includes('get_page'))
    ok('search narrows rows and keeps their numbers', (await call(T, 'get_table_rows', { page: open, search: '3' })).data?.rows?.[0]?.row === 2)

    const revision = rows.data?.revision
    const stored = await contentOf(open)
    ok('edit_table_rows without write scope refused', (await call(roTok.access_token, 'edit_table_rows', { page: open, revision, add: [{ Amount: '9' }] })).err)
    ok('edit_table_rows with a stale revision refused', (await call(T, 'edit_table_rows', { page: open, revision: 'stale', add: [{ Amount: '9' }] })).err)
    const badBatch = await call(T, 'edit_table_rows', { page: open, revision, update: [{ row: 0, values: { Amount: '5' } }], add: [{ Price: '1' }] })
    ok('one bad column refuses the whole batch, page untouched', badBatch.err && badBatch.text.includes('No column named Price') && (await contentOf(open)) === stored, badBatch.text)
    const computedCell = await call(T, 'edit_table_rows', { page: open, revision, update: [{ row: 0, values: { Double: '1' } }] })
    ok('a computed column cannot be set', computedCell.err && computedCell.text.includes('computed'), computedCell.text)
    const foreignCell = await call(T, 'edit_table_rows', { page: open, revision, add: [{ Amount: `[[Theirs|${others}]]` }] })
    ok("a cell linking to another user's page refused, page untouched", foreignCell.err && (await contentOf(open)) === stored, foreignCell.text)
    const frozenRows = await call(T, 'get_table_rows', { page: readOnly })
    const frozenEdit = await call(T, 'edit_table_rows', { page: readOnly, revision: frozenRows.data?.revision, add: [{ Amount: '9' }] })
    ok('a view-only table is readable but its rows cannot be changed', frozenRows.data?.viewOnly === true && frozenEdit.err && frozenEdit.text.includes('view only'), frozenEdit.text)

    const history = await historyOf(open)
    const batch = await call(T, 'edit_table_rows', {
      page: open,
      revision,
      update: [{ row: 1, values: { Amount: 20 } }],
      remove: [0],
      add: [{ Amount: `7 see [[Notes|${notes}]]` }, { Amount: '<i>not italic</i>' }],
    })
    const after = JSON.parse(await contentOf(open))
    ok(
      'one batch updates, removes and adds, stored the way the app stores cells',
      !batch.err &&
        batch.data?.rowCount === 4 &&
        after.items.map((r: any) => r.Amount).join('|') ===
          `20|3|7 see <a data-page-id="${notes}" class="page-link" href="/page/${notes}" target="_blank" contenteditable="false">Notes</a>|&lt;i&gt;not italic&lt;/i&gt;` &&
        !('Double' in after.items[2]) &&
        after.widths.Amount === '120px' &&
        after.columns[1].expression.endsWith('+ 1'),
      [batch.raw, after.items],
    )
    ok('the batch is one page history entry', (await historyOf(open)) === history + 1, [history, await historyOf(open)])
    const links = ((await json(jwt, 'GET', `/pages/links/${open}`)) as { id: number }[]).map((l) => l.id)
    ok('the API synced the page link inside the cell', links.join() === String(notes), links)
    const reread = await call(T, 'get_table_rows', { page: open, start: -2 })
    ok(
      'the new rows read back, computed column included',
      reread.data?.revision === batch.data?.revision &&
        reread.data.rows.map((r: any) => r.row).join() === '2,3' &&
        reread.data.rows[0].values.Amount === `7 see [[Notes|${notes}]]` &&
        reread.data.rows[1].values.Amount === '<i>not italic</i>',
      reread.raw,
    )
  }

  // ---- document pages: Flat Page v2, Flat Page, Task List
  async function documentChecks() {
    const linksOf = async (id: number) => ((await json(jwt, 'GET', `/pages/links/${id}`)) as { id: number }[]).map((l) => l.id)
    const v2 = await mk(jwt, 'FlatPageV2', 'Notes v2', null, sec)
    const cellOf = (text: string) => ({
      type: 'tableCell',
      attrs: { colspan: 1, rowspan: 1, colwidth: [180], align: 'right', nowrap: true },
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })
    const v2Doc = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Log' }] },
        { type: 'table', content: [{ type: 'tableRow', content: [cellOf('a'), cellOf('b')] }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'first entry' }] },
      ],
    })
    await json(jwt, 'PUT', `/pages/${v2}`, { pageContent: v2Doc })

    const read = await call(T, 'get_page', { page: v2 })
    ok(
      'get_page shows a Flat Page v2 as numbered lines with the table read-only',
      read.data?.text === '1\t# Log\n2\t| a | b |\n3\tfirst entry' && read.data.readOnly?.[0]?.why === 'a table',
      read.raw,
    )
    ok('get_page on a Table points at the table tool', (await call(T, 'get_page', { page: open })).text.includes('get_table_config'))
    ok('get_page with a negative start reads from the end', (await call(T, 'get_page', { page: v2, start: -1 })).data?.text === '3\tfirst entry')

    const revision = read.data?.revision
    ok('edit_page without write scope refused', (await call(roTok.access_token, 'edit_page', { page: v2, revision, after: 3, text: 'x' })).err)
    ok('edit_page with a stale revision refused', (await call(T, 'edit_page', { page: v2, revision: 'stale', after: 3, text: 'x' })).err)
    const intoTable = await call(T, 'edit_page', { page: v2, revision, start: 2, end: 3, text: 'gone' })
    ok('edit_page cutting into a table refused, page untouched', intoTable.err && intoTable.text.includes('a table') && (await contentOf(v2)) === v2Doc, intoTable.text)
    const foreignLink = await call(T, 'edit_page', { page: v2, revision, after: 3, text: `[[Theirs|${others}]]` })
    ok("a link to another user's page refused, page untouched", foreignLink.err && (await contentOf(v2)) === v2Doc, foreignLink.text)

    const appended = await call(T, 'edit_page', { page: v2, revision, after: 3, text: `**second** entry, see [[Open|${open}]]\n- [ ] follow up` })
    const v2Stored = JSON.parse(await contentOf(v2))
    ok(
      'edit_page appends, the table is stored exactly as before, the link is a number',
      !appended.err &&
        JSON.stringify(v2Stored.content[1]) === JSON.stringify(JSON.parse(v2Doc).content[1]) &&
        v2Stored.content[3].content[2].attrs.pageId === open &&
        v2Stored.content[4].type === 'taskList',
      appended.raw,
    )
    ok('the API synced the page link from that save', (await linksOf(v2)).join() === String(open), await linksOf(v2))
    const ticked = await call(T, 'edit_page', { page: v2, revision: appended.data?.revision, start: 5, end: 5, text: '- [x] follow up' })
    ok(
      'the revision an edit returns is good for the next edit',
      !ticked.err && JSON.parse(await contentOf(v2)).content[4].content[0].attrs.checked === true,
      ticked.raw,
    )

    const v2ReadOnly = await mk(jwt, 'FlatPageV2', 'Frozen', null, sec)
    await json(jwt, 'PUT', `/pages/view-only/${v2ReadOnly}`, { viewOnly: true })
    const frozen = await call(T, 'get_page', { page: v2ReadOnly })
    const frozenEdit = await call(T, 'edit_page', { page: v2ReadOnly, revision: frozen.data?.revision, after: 0, text: 'x' })
    ok(
      'a view-only page is readable and edit_page refuses it',
      frozen.data?.viewOnly === true && frozenEdit.err && (await contentOf(v2ReadOnly)) === null,
      frozenEdit.text,
    )

    const flat = await mk(jwt, 'FlatPage', 'Notes flat', null, sec)
    const flatRead = await call(T, 'get_page', { page: flat })
    const flatEdit = await call(T, 'edit_page', {
      page: flat,
      revision: flatRead.data?.revision,
      after: 0,
      text: `<b>not bold</b> & [[Open|${open}]]\n    indented`,
    })
    ok(
      'a never-saved Flat Page takes lines, as escaped HTML in the shape the app writes',
      flatRead.data?.lineCount === 0 &&
        !flatEdit.err &&
        (await contentOf(flat)) ===
          `<div>&lt;b&gt;not bold&lt;/b&gt; &amp; <a data-page-id="${open}" class="page-link" href="/page/${open}" target="_blank" contenteditable="false">Open</a></div><div>&nbsp;&nbsp;&nbsp;&nbsp;indented</div>`,
      await contentOf(flat),
    )
    ok('the API synced the Flat Page link too', (await linksOf(flat)).join() === String(open), await linksOf(flat))

    const todo = await mk(jwt, 'TaskList', 'Todo', null, sec)
    const todoRead = await call(T, 'get_page', { page: todo })
    const todoEdit = await call(T, 'edit_page', {
      page: todo,
      revision: todoRead.data?.revision,
      start: 1,
      end: 1,
      text: '- [ ] ship it\n  - [x] write tests\nplain line',
    })
    const todoStored = JSON.parse((await contentOf(todo)) ?? 'null')
    ok(
      'a never-saved Task List reads as one empty task and is stored as a single list',
      todoRead.data?.text === '1\t- [ ] ' &&
        !todoEdit.err &&
        todoStored.content.length === 1 &&
        todoStored.content[0].type === 'taskList' &&
        todoStored.content[0].content.length === 2 &&
        todoStored.content[0].content[0].content[1].content[0].attrs.checked === true,
      todoEdit.raw,
    )
  }

  // ---- Mini App
  async function miniAppChecks() {
    const app = await mk(jwt, 'MiniApp', 'Counter', null, sec)
    const appRead = await call(T, 'get_mini_app', { page: app })
    ok('get_mini_app on a never-saved page says so', appRead.data?.saved === false && appRead.data.template === null, appRead.raw)
    const early = await call(T, 'set_mini_app_data', { page: app, revision: appRead.data?.revision, set: { n: 1 } })
    ok('data cannot be set before there is an app', early.err && (await contentOf(app)) === null, early.text)
    const badJs = await call(T, 'set_mini_app_files', { page: app, revision: appRead.data?.revision, js: 'const x = (' })
    ok('js that does not parse is refused', badJs.err && badJs.text.includes('js:') && (await contentOf(app)) === null, badJs.text)

    const files = await call(T, 'set_mini_app_files', {
      page: app,
      revision: appRead.data?.revision,
      html: '<div id="app"></div>',
      js: "import { label } from './util.js'\nconst n = (await Journals.getItem('n')) ?? 0\ndocument.getElementById('app').textContent = label(n)",
      modules: { upsert: [{ name: 'util.js', code: 'export const label = (n) => "count " + n' }] },
    })
    ok('set_mini_app_files saves code and a module', !files.err && files.data?.modules?.join() === 'util.js', files.raw)
    const badName = await call(T, 'set_mini_app_files', { page: app, revision: files.data?.revision, modules: { upsert: [{ name: 'lib/x.js', code: '' }] } })
    ok('a module name with a path is refused', badName.err, badName.text)

    const data = await call(T, 'set_mini_app_data', { page: app, revision: files.data?.revision, set: { n: 7, big: 'x'.repeat(500) } })
    const css = await call(T, 'set_mini_app_files', { page: app, revision: data.data?.revision, css: 'body { margin: 0 }' })
    const appStored = JSON.parse(await contentOf(app))
    ok(
      'code and data each survive a save of the other, in the shape the app reads',
      !data.err &&
        !css.err &&
        Object.keys(appStored).join() === 'files,kv' &&
        appStored.kv.n === 7 &&
        appStored.files.css === 'body { margin: 0 }' &&
        appStored.files.html === '<div id="app"></div>' &&
        appStored.files.modules[0].name === 'util.js',
      appStored,
    )
    const appAgain = await call(T, 'get_mini_app', { page: app })
    const bigRow = (appAgain.data?.data ?? []).find((d: any) => d.key === 'big')
    ok(
      'large stored values come back as a preview',
      appAgain.data?.saved === true && bigRow?.bytes === 502 && bigRow.value === undefined && typeof bigRow.preview === 'string',
      appAgain.raw,
    )
    const removed = await call(T, 'set_mini_app_data', { page: app, revision: css.data?.revision, remove: ['big'] })
    const missing = await call(T, 'set_mini_app_data', { page: app, revision: removed.data?.revision, remove: ['nope'] })
    ok('a stored key can be removed, and a missing one is an error', !removed.err && removed.data?.keys?.join() === 'n' && missing.err, removed.raw)
  }

  // ---- integrations over MCP: the same as the app can do, never a header value
  async function mcpIntegrationChecks() {
    const RO = roTok.access_token as string
    const made = await call(T, 'create_integration', { name: 'Zen', baseUrl: SERVICE, headers: { 'X-Secret': 'mcp-shh' } })
    const listed = await call(T, 'list_integrations', {})
    const zen = (listed.data?.integrations ?? []).find((i: any) => i.name === 'Zen')
    ok(
      'create_integration saves one, and list_integrations shows its header names but never the values',
      !made.err && zen?.headerNames?.join() === 'X-Secret' && !listed.text.includes('mcp-shh'),
      listed.text.slice(0, 300),
    )

    const answer = await call(T, 'call_integration', { name: 'Zen', path: '/zen' })
    ok('call_integration returns the service status and text', !answer.err && answer.data?.status === 200 && typeof answer.data?.body === 'string', answer.text.slice(0, 300))
    await call(T, 'create_integration', { name: 'McpAvatars', baseUrl: SERVICE })
    const image = await call(T, 'call_integration', { name: 'McpAvatars', path: '/u/1?v=4' })
    ok('a binary answer is described, not dumped', image.data?.binary === true && image.data?.bytes > 0 && image.data?.body === undefined, image.text.slice(0, 300))

    ok(
      'a read-only token can list and GET, but not add or send anything else',
      !(await call(RO, 'list_integrations', {})).err &&
        !(await call(RO, 'call_integration', { name: 'Zen', path: '/zen' })).err &&
        (await call(RO, 'create_integration', { name: 'Nope', baseUrl: 'https://example.com' })).text.includes('scope') &&
        (await call(RO, 'call_integration', { name: 'Zen', method: 'POST', path: '/zen' })).text.includes('scope'),
    )

    const renamed = await call(T, 'update_integration', { name: 'Zen', newName: 'Zen2' })
    ok('update_integration renames and keeps the saved headers when none are given', !renamed.err && renamed.data?.integration?.headerNames?.join() === 'X-Secret', renamed.text.slice(0, 300))
    ok('a missing integration is named in the refusal', (await call(T, 'call_integration', { name: 'Zen', path: '/zen' })).err)

    const app = (await json(jwt, 'POST', '/pages', { sectionId: sec, pageType: 'MiniApp', pageName: 'McpGranted', pageParentId: null })).insertedRowId as number
    await fetch(`${api}/integration-grants/${app}/${zen.id}`, { method: 'PUT', headers: { Token: jwt } })
    const revoked = await call(T, 'revoke_integration_grant', { name: 'Zen2', page: app })
    const after = (await call(T, 'list_integrations', {})).data?.integrations.find((i: any) => i.name === 'Zen2')
    ok('revoke_integration_grant takes a Mini App permission back', !revoked.err && after?.grants?.length === 0, revoked.text)

    const deleted = await call(T, 'delete_integration', { name: 'Zen2' })
    await call(T, 'delete_integration', { name: 'McpAvatars' })
    const bin = (await json(jwt, 'GET', '/recycle-bin')).integrations as any[]
    ok(
      'delete_integration sends it to the recycle bin',
      !deleted.err && !(await call(T, 'list_integrations', {})).data?.integrations.some((i: any) => i.name === 'Zen2') && bin.some((i) => i.name === 'Zen2'),
      bin,
    )
  }

  // ---- the app's Connect AI apps screen: what is connected, and taking it back
  async function connectionChecks() {
    const connections = (token: string | null) => fetch(base + '/oauth/connections', { headers: token ? { Token: token } : {} })
    const disconnect = (token: string, id: string) => fetch(`${base}/oauth/connections/${id}`, { method: 'DELETE', headers: { Token: token } })
    const usable = async () => (await fetch(base + '/mcp', { method: 'POST', headers: { authorization: `Bearer ${T}` } })).status !== 401

    ok('connections need the app login', (await connections(null)).status === 401 && (await connections('nope')).status === 401)
    const mine = (await (await connections(jwt)).json()) as any[]
    ok(
      'connections lists each app the user let in, with its access',
      mine.length === 2 && mine.find((c) => c.id === b.reg.client_id)?.canWrite === true && mine.find((c) => c.id === ro.reg.client_id)?.canWrite === false && !Number.isNaN(Date.parse(mine[0].since)),
      mine,
    )
    ok("and none of another user's", ((await (await connections(otherJwt)).json()) as any[]).length === 0)
    ok("another user cannot disconnect it", (await disconnect(otherJwt, b.reg.client_id)).status === 404 && (await usable()))

    const gone = await disconnect(jwt, b.reg.client_id)
    const after = (await (await connections(jwt)).json()) as any[]
    const refreshed = await fetch(base + '/oauth/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: r1.refresh_token }) })
    ok('disconnecting kills the access token and the refresh token, and only that app', gone.status === 200 && !(await usable()) && refreshed.status === 400 && after.length === 1 && after[0].id === ro.reg.client_id, after)
    ok('disconnecting it again finds nothing', (await disconnect(jwt, b.reg.client_id)).status === 404)
  }
  // ---- integrations: secrets kept in the API, requests made by it
  async function integrationChecks() {
    const call = (token: string, method: string, path: string, body?: unknown) =>
      fetch(api + path, {
        method,
        headers: { 'content-type': 'application/json', Token: token },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    const listOf = async (token: string) => (await (await call(token, 'GET', '/integrations')).json()) as any[]
    // As helpers/integrations.js sends it: what to do in headers, the body as bytes.
    type Outgoing = { name: string; method?: string; path: string; headers?: Record<string, string>; body?: Uint8Array }
    const request = (token: string, r: Outgoing) =>
      fetch(api + '/integration-requests', {
        method: 'POST',
        headers: {
          Token: token,
          'Content-Type': 'application/octet-stream',
          'X-Integration-Name': encodeURIComponent(r.name),
          'X-Integration-Method': encodeURIComponent(r.method ?? 'GET'),
          'X-Integration-Path': encodeURIComponent(r.path),
          'X-Integration-Headers': encodeURIComponent(JSON.stringify(r.headers ?? {})),
        },
        body: r.body,
      })
    const answerOf = async (response: Response) => ({
      status: Number(response.headers.get('x-integration-status')),
      headers: JSON.parse(decodeURIComponent(response.headers.get('x-integration-headers') ?? '%7B%7D')),
      bytes: new Uint8Array(await response.arrayBuffer()),
    })

    const made = await call(jwt, 'POST', '/integrations', {
      name: 'Service',
      baseUrl: SERVICE + '/',
      headers: { 'X-Secret': 'shh' },
    })
    const id = ((await made.json()) as any).id as number
    const listed = await listOf(jwt)
    ok(
      'an integration is listed with its header names and never its values',
      made.status === 200 && listed.length === 1 && listed[0].baseUrl === SERVICE &&
        listed[0].headerNames.join() === 'X-Secret' && !JSON.stringify(listed).includes('shh'),
      listed,
    )
    ok("and not in another user's list", (await listOf(otherJwt)).length === 0)
    ok(
      'a second one with the same name is refused',
      (await call(jwt, 'POST', '/integrations', { name: 'Service', baseUrl: 'https://example.com' })).status === 400,
    )
    ok(
      'a header with no value is refused, since it would still be sent',
      (await call(jwt, 'POST', '/integrations', { name: 'Blank', baseUrl: 'https://example.com', headers: { Authorization: '' } })).status === 400,
    )
    ok(
      'a base address that is not http or https is refused',
      (await call(jwt, 'POST', '/integrations', { name: 'Files', baseUrl: 'file:///etc' })).status === 400,
    )

    // A null value keeps the saved secret, a name left out drops it.
    await call(jwt, 'PUT', `/integrations/${id}`, {
      name: 'Service',
      baseUrl: SERVICE,
      headers: { 'X-Secret': null, Accept: 'application/json' },
    })
    ok('an edit that leaves a secret blank keeps it', (await listOf(jwt))[0].headerNames.sort().join() === 'Accept,X-Secret')

    const zen = await request(jwt, { name: 'Service', method: 'GET', path: '/zen' })
    const zenAnswer = await answerOf(zen)
    ok(
      'a request goes out over https and comes back as the service answered',
      zen.status === 200 && zenAnswer.status === 200 && zenAnswer.bytes.length > 0 &&
        String(zenAnswer.headers['content-type']).startsWith('text/plain') && !('set-cookie' in zenAnswer.headers),
      { status: zenAnswer.status, headers: zenAnswer.headers },
    )
    ok(
      'the answer can never be read as a page on the API origin',
      zen.headers.get('content-type') === 'application/octet-stream' && zen.headers.get('x-content-type-options') === 'nosniff' &&
        zen.headers.get('content-disposition') === 'attachment' && zen.headers.get('content-security-policy') === 'sandbox',
      Object.fromEntries(zen.headers),
    )
    ok(
      'the browser is allowed to send and read the integration headers',
      (zen.headers.get('access-control-expose-headers') ?? '').includes('X-Integration-Headers') &&
        ((await fetch(api + '/integration-requests', { method: 'OPTIONS' })).headers.get('access-control-allow-headers') ?? '').includes('X-Integration-Name'),
    )
    const notFound = await answerOf(await request(jwt, { name: 'Service', path: '/this-does-not-exist-anywhere' }))
    ok("the service's own error status is passed back, not raised", notFound.status === 404, notFound.status)

    // Bytes both ways: an image comes back as it was, and bytes sent arrive as they were.
    await call(jwt, 'POST', '/integrations', { name: 'Avatars', baseUrl: SERVICE })
    const avatar = await answerOf(await request(jwt, { name: 'Avatars', path: '/u/1?v=4' }))
    ok(
      'a binary answer comes back byte for byte',
      avatar.status === 200 && avatar.headers['content-type'] === 'image/png' &&
        [...avatar.bytes.slice(0, 4)].join() === '137,80,78,71',
      { status: avatar.status, type: avatar.headers['content-type'], first: [...avatar.bytes.slice(0, 4)] },
    )
    await call(jwt, 'POST', '/integrations', { name: 'Echo', baseUrl: SERVICE })
    const echoed = await answerOf(
      await request(jwt, {
        name: 'Echo',
        method: 'POST',
        path: '/anything',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array([0x00, 0xff, 0x10, 0x89]),
      }),
    )
    const echo = JSON.parse(new TextDecoder().decode(echoed.bytes))
    ok('a binary body arrives at the service byte for byte', echo.data === 'data:application/octet-stream;base64,AP8QiQ==', echo.data)
    const sentJson = await answerOf(
      await request(jwt, { name: 'Echo', method: 'POST', path: '/anything', headers: { 'Content-Type': 'application/json' }, body: new TextEncoder().encode('{"a":1}') }),
    )
    ok(
      'a JSON body is sent as it is, not swallowed by the API',
      JSON.parse(new TextDecoder().decode(sentJson.bytes)).json?.a === 1,
      new TextDecoder().decode(sentJson.bytes).slice(0, 300),
    )
    ok(
      "another user cannot use it by name",
      (await request(otherJwt, { name: 'Service', path: '/zen' })).status === 404,
    )
    ok(
      'a path that leaves the base address is refused',
      (await request(jwt, { name: 'Service', path: 'https://example.com/' })).status === 400 &&
        (await request(jwt, { name: 'Service', path: 'zen' })).status === 400,
    )

    for (const [name, baseUrl] of [
      ['Loopback', 'http://127.0.0.1:9900'],
      ['Localhost', 'http://localhost:9900'],
      ['Private', 'http://10.1.2.3'],
      ['Metadata', 'http://169.254.169.254'],
    ] as [string, string][]) {
      await call(jwt, 'POST', '/integrations', { name, baseUrl })
      const refused = await request(jwt, { name, path: '/' })
      const text = await refused.text()
      ok(`${name} addresses are refused`, refused.status === 400 && text.includes('private address'), text)
    }

    // Grants: which Mini Apps may use it, and a template pull takes them away.
    const app = await mk(jwt, 'MiniApp', 'Integrated', null, sec)
    await json(jwt, 'PUT', `/pages/${app}`, { pageContent: JSON.stringify({ files: { html: '', css: '', js: '', modules: [] }, kv: {} }) })
    ok(
      "a grant needs the user's own Mini App",
      (await call(otherJwt, 'PUT', `/integration-grants/${app}/${id}`)).status === 404 &&
        (await call(jwt, 'PUT', `/integration-grants/${open}/${id}`)).status === 404,
    )
    await call(jwt, 'PUT', `/integration-grants/${app}/${id}`)
    const granted = (await (await call(jwt, 'GET', `/integration-grants/${app}`)).json()) as string[]
    const grantsListed = (await listOf(jwt)).find((i) => i.id === id).grants
    ok(
      'a grant shows on the page and under the integration',
      granted.join() === 'Service' && grantsListed.length === 1 && grantsListed[0].pageName === 'Integrated',
      { granted, grantsListed },
    )
    const template = (await json(jwt, 'POST', '/miniapp/templates', { name: 'T', description: '', isPublic: false, pageId: app })) as any
    if (template.insertedRowId) {
      await json(jwt, 'POST', `/miniapp/templates/${template.insertedRowId}/apply-to-page`, { pageId: app })
      const after = (await (await call(jwt, 'GET', `/integration-grants/${app}`)).json()) as string[]
      ok('applying a template takes the grant away', after.length === 0, after)
    } else {
      ok('a template could be made to test grant removal', false, template)
    }
    await call(jwt, 'PUT', `/integration-grants/${app}/${id}`)
    await call(jwt, 'DELETE', `/integration-grants/${app}/${id}`)
    ok('a grant can be taken back', ((await (await call(jwt, 'GET', `/integration-grants/${app}`)).json()) as string[]).length === 0)

    await call(jwt, 'DELETE', `/integrations/${id}`)
    ok(
      'a deleted integration is gone from the list and cannot be called',
      !(await listOf(jwt)).some((i) => i.id === id) && (await request(jwt, { name: 'Service', path: '/zen' })).status === 404,
    )
    const binOf = async (token: string) => ((await (await call(token, 'GET', '/recycle-bin')).json()) as any).integrations as any[]
    const binned = await binOf(jwt)
    ok(
      'it waits in the Recycle Bin, without its header values',
      binned.some((i) => i.id === id && i.name === 'Service') && !JSON.stringify(binned).includes('shh') && (await binOf(otherJwt)).length === 0,
      binned,
    )
    ok(
      'another user cannot restore or remove it',
      (await call(otherJwt, 'POST', `/recycle-bin/restore/integration/${id}`)).status === 404 &&
        (await call(otherJwt, 'DELETE', `/recycle-bin/permanent/integration/${id}`)).status === 200 &&
        (await binOf(jwt)).some((i) => i.id === id),
    )

    // A new one under the same name, then the old one cannot come back beside it.
    const replacement = ((await (await call(jwt, 'POST', '/integrations', { name: 'Service', baseUrl: SERVICE })).json()) as any).id
    ok('its name can be used again', typeof replacement === 'number')
    const clash = await call(jwt, 'POST', `/recycle-bin/restore/integration/${id}`)
    ok('restoring it beside another of the same name is refused', clash.status === 409 && (await clash.text()).includes('already have'))

    await call(jwt, 'DELETE', `/integrations/${replacement}`)
    await call(jwt, 'DELETE', `/recycle-bin/permanent/integration/${replacement}`)
    const restored = await call(jwt, 'POST', `/recycle-bin/restore/integration/${id}`)
    const back = (await listOf(jwt)).find((i) => i.id === id)
    ok(
      'restoring brings it back with its saved headers, and it works again',
      restored.status === 200 && back?.headerNames.sort().join() === 'Accept,X-Secret' &&
        (await request(jwt, { name: 'Service', path: '/zen' })).status === 200,
      back,
    )

    // Emptying the bin is what finally removes it, secrets included.
    await call(jwt, 'PUT', `/integration-grants/${app}/${id}`)
    await call(jwt, 'DELETE', `/integrations/${id}`)
    await call(jwt, 'DELETE', '/recycle-bin/permanent/all')
    ok(
      'emptying the Recycle Bin removes it for good',
      !(await binOf(jwt)).some((i) => i.id === id) && (await call(jwt, 'POST', `/recycle-bin/restore/integration/${id}`)).status === 404,
    )
  }
}

console.log('building the image (slow the first time, cached after)')
docker(['build', '-q', '-t', IMAGE, '.'], true)
const certs = mkdtempSync(join(tmpdir(), 'journals-e2e-'))
try {
  // The first documentation range free, so a second run, or one left behind by
  // a killed run, does not stop this one.
  const subnets = ['203.0.113.0/24', '198.51.100.0/24', '192.0.2.0/24']
  for (const [i, subnet] of subnets.entries()) {
    try {
      docker(['network', 'create', '--subnet', subnet, NETWORK])
      break
    } catch (error) {
      if (i === subnets.length - 1) throw error
    }
  }
  // The API trusts only this certificate, so a call that slips past the fake
  // to a real service fails instead of going out.
  const serviceHost = new URL(SERVICE).hostname
  docker([
    'run', '--rm', '-v', `${certs}:/e2e`, 'crystallang/crystal:1.17',
    'openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', `/CN=${serviceHost}`,
    '-addext', `subjectAltName=DNS:${serviceHost}`, '-keyout', '/e2e/service.key', '-out', '/e2e/service.crt',
  ])
  docker([
    'run', '-d', '--name', SERVICE_CONTAINER, '--network', NETWORK, '--network-alias', serviceHost,
    '-v', `${certs}:/e2e:ro`, '-v', `${join(import.meta.dir, 'e2eService.ts')}:/e2eService.ts:ro`, 'oven/bun:1-alpine', 'bun', '/e2eService.ts',
  ])
  // Ports are picked by Docker and bound to loopback, so a run cannot collide
  // with a dev server or be reached from the network.
  docker([
    'run', '-d', '--name', CONTAINER, '--network', NETWORK, '-v', '/app/data', '-v', `${certs}:/e2e:ro`,
    '-e', `JWT_SECRET=${SECRET}`, '-e', 'ALLOWED_ORIGINS=http://localhost', '-e', `JOURNALS_PUBLIC_API_URL=${PUBLIC_API}`,
    '-e', 'SSL_CERT_FILE=/e2e/service.crt',
    '-p', '127.0.0.1::80', '-p', '127.0.0.1::9900', IMAGE,
  ])
  const portOf = (port: number) => docker(['port', CONTAINER, String(port)]).split('\n')[0]!.split(':').pop()
  const base = `http://localhost:${portOf(80)}`
  const api = `http://localhost:${portOf(9900)}`

  const up = async (url: string) => (await fetch(url).catch(() => null))?.ok ?? false
  let ready = false
  for (let i = 0; i < 60 && !ready; i++) {
    ready = (await up(api + '/')) && (await up(base + '/.well-known/oauth-authorization-server')) &&
      docker(['logs', SERVICE_CONTAINER]).includes('ready')
    if (!ready) await Bun.sleep(500)
  }
  if (!ready) {
    throw new Error('the containers did not come up:\n' + docker(['logs', '--tail', '30', CONTAINER]) + '\n' + docker(['logs', '--tail', '30', SERVICE_CONTAINER]))
  }

  await checks(base, api)
  if (failed) console.log('\ncontainer log tail:\n' + docker(['logs', '--tail', '30', CONTAINER]))
} finally {
  Bun.spawnSync(['docker', 'rm', '-fv', CONTAINER, SERVICE_CONTAINER])
  Bun.spawnSync(['docker', 'network', 'rm', NETWORK])
  rmSync(certs, { recursive: true, force: true })
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
