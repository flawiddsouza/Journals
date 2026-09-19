import { randomBytes, createHash } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { verify } from 'hono/jwt'
import { config } from './config'
import { db, tokenHash, pruneExpired } from './db'
import { verifyCredentials } from './journals'

/**
 * OAuth 2.1 for /mcp, per the MCP authorization spec. This process is both the
 * authorization server and the resource server, so the authorize page is the
 * Journals login plus a consent click, and tokens are opaque ids looked up in
 * the sidecar's own database. PKCE (S256) is required.
 *
 * Ported from ui-designer's server/oauth.ts. Two differences: Journals keeps no
 * server-side session, so the consent page always asks for credentials, and
 * tokens carry scopes.
 *
 * Client registration is DCR. The 2026-07-28 spec deprecates it in favour of
 * Client ID Metadata Documents, but DCR is still what current clients send.
 */

const CODE_TTL = 10 * 60 * 1000
const ACCESS_TTL = 60 * 60 * 1000
const REFRESH_TTL = 30 * 24 * 60 * 60 * 1000

export const SCOPES = { read: 'read', write: 'write' } as const
const ALL_SCOPES = [SCOPES.read, SCOPES.write]

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

/**
 * The origin as the client sees it. Behind a TLS proxy the request arrives as
 * plain http, but the issuer, the metadata URLs and `iss` must all say https or
 * clients reject the mismatch. The proxy has to forward Host and set
 * X-Forwarded-Proto for this to hold.
 */
export function origin(reqUrl: string, forwardedProto?: string | null): string {
  const url = new URL(reqUrl)
  const proto = forwardedProto?.split(',')[0]?.trim()
  if (proto === 'https' || (!proto && reqUrl.startsWith('https:'))) url.protocol = 'https:'
  return url.origin
}

const ctxOrigin = (c: Context) => origin(c.req.url, c.req.header('x-forwarded-proto'))

/** Loopback redirects match ignoring port, per RFC 8252 section 7.3: CLI
 *  clients bind an ephemeral one. Everything else must match exactly. */
function redirectAllowed(registered: string[], uri: string): boolean {
  if (registered.includes(uri)) return true
  try {
    const u = new URL(uri)
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost' && u.hostname !== '[::1]') {
      return false
    }
    return registered.some((r) => {
      try {
        const reg = new URL(r)
        return reg.hostname === u.hostname && reg.protocol === u.protocol && reg.pathname === u.pathname
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

function getClient(id: string): { id: string; name: string; redirectUris: string[] } | null {
  const row = db()
    .query('SELECT id, name, redirect_uris FROM oauth_clients WHERE id = ?')
    .get(id) as { id: string; name: string; redirect_uris: string } | null
  return row ? { id: row.id, name: row.name, redirectUris: JSON.parse(row.redirect_uris) } : null
}

function requestedScopes(raw: string | null): string[] {
  const asked = (raw ?? '').split(/\s+/).filter(Boolean)
  const granted = asked.filter((s) => ALL_SCOPES.includes(s as never))
  // read is the floor: a token with nothing readable cannot do anything at all.
  return granted.length ? [...new Set([SCOPES.read, ...granted])] : [SCOPES.read]
}

function issueTokens(username: string, clientId: string, scopes: string[]) {
  const access = randomBytes(32).toString('base64url')
  const refresh = randomBytes(32).toString('base64url')
  const scopeText = scopes.join(' ')
  db().run(
    `INSERT INTO oauth_tokens (token_hash, kind, username, client_id, scopes, expires_at)
     VALUES (?, 'access', ?, ?, ?, ?), (?, 'refresh', ?, ?, ?, ?)`,
    [
      tokenHash(access), username, clientId, scopeText, Date.now() + ACCESS_TTL,
      tokenHash(refresh), username, clientId, scopeText, Date.now() + REFRESH_TTL,
    ],
  )
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TTL / 1000),
    refresh_token: refresh,
    scope: scopeText,
  }
}

export type BearerIdentity = { username: string; scopes: string[] }

/** Resolves an Authorization header to the user and scopes it was issued for. */
export function bearerIdentity(authorization: string | undefined | null): BearerIdentity | null {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return null
  const row = db()
    .query(
      "SELECT username, scopes, expires_at FROM oauth_tokens WHERE token_hash = ? AND kind = 'access'",
    )
    .get(tokenHash(token)) as
    | { username: string; scopes: string; expires_at: number }
    | null
  if (!row || row.expires_at < Date.now()) return null
  return { username: row.username, scopes: row.scopes.split(' ').filter(Boolean) }
}

/** Who the app is signed in as: the login token it sends the API in its Token
 *  header, signed with the secret this process shares with the API. */
async function appUser(c: Context): Promise<string | null> {
  const payload = await verify(c.req.header('token') ?? '', config.jwtSecret, 'HS256').catch(() => null)
  return typeof payload?.username === 'string' ? payload.username : null
}

export function wwwAuthenticate(reqUrl: string, forwardedProto?: string | null): string {
  return `Bearer resource_metadata="${origin(reqUrl, forwardedProto)}/.well-known/oauth-protected-resource/mcp"`
}

function authorizePage(
  params: URLSearchParams,
  clientName: string,
  scopes: string[],
  error?: string,
): string {
  const hidden = [
    'client_id', 'redirect_uri', 'response_type', 'state',
    'code_challenge', 'code_challenge_method', 'resource', 'scope',
  ]
    .filter((k) => params.has(k))
    .map((k) => `<input type="hidden" name="${k}" value="${esc(params.get(k)!)}">`)
    .join('\n      ')
  const permissions = scopes.includes(SCOPES.write)
    ? 'read your pages and change them'
    : 'read your pages'
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Authorize - Journals</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #111318; color: #e6e8ee; font: 15px/1.5 system-ui, sans-serif; }
  form { background: #1a1d24; border: 1px solid #2a2e38; border-radius: 12px;
         padding: 28px 32px; width: 320px; display: grid; gap: 14px; }
  h1 { font-size: 17px; margin: 0; }
  p { margin: 0; color: #9aa1b0; font-size: 13px; }
  label { display: grid; gap: 4px; font-size: 13px; color: #9aa1b0; }
  input { background: #111318; border: 1px solid #2a2e38; border-radius: 6px;
          color: #e6e8ee; padding: 8px 10px; font-size: 14px; }
  button { background: #4f7cff; border: 0; border-radius: 6px; color: white;
           padding: 10px; font-size: 14px; cursor: pointer; }
  .error { color: #ff7a7a; }
</style></head><body>
  <form method="post" action="/oauth/authorize">
      <h1>Journals</h1>
      <p><b>${esc(clientName)}</b> is asking to ${permissions}.</p>
      ${error ? `<p class="error">${esc(error)}</p>` : ''}
      ${hidden}
      <label>Username <input name="username" autofocus autocomplete="username"></label>
      <label>Password <input name="password" type="password" autocomplete="current-password"></label>
      <button type="submit">Authorize</button>
  </form>
</body></html>`
}

export function oauthRoutes(): Hono {
  const app = new Hono()

  // Never in a frame. The app shares this origin, so a password manager fills
  // the form in, and a framing page would need only one disguised click on
  // Authorize to get a token for a client of its own.
  const consent = (c: Context, page: string, status: 200 | 401 = 200) =>
    c.html(page, status, { 'Content-Security-Policy': "frame-ancestors 'none'", 'X-Frame-Options': 'DENY' })

  const resourceMetadata = (c: Context) => ({
    resource: `${ctxOrigin(c)}/mcp`,
    authorization_servers: [ctxOrigin(c)],
    scopes_supported: ALL_SCOPES,
    bearer_methods_supported: ['header'],
  })
  app.get('/.well-known/oauth-protected-resource', (c) => c.json(resourceMetadata(c)))
  app.get('/.well-known/oauth-protected-resource/mcp', (c) => c.json(resourceMetadata(c)))

  app.get('/.well-known/oauth-authorization-server', (c) => {
    const base = ctxOrigin(c)
    return c.json({
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      scopes_supported: ALL_SCOPES,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    })
  })

  app.post('/oauth/register', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      redirect_uris?: string[]
      client_name?: string
    }
    if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
      return c.json(
        { error: 'invalid_client_metadata', error_description: 'redirect_uris is required' },
        400,
      )
    }
    const id = randomBytes(16).toString('base64url')
    db().run(
      'INSERT INTO oauth_clients (id, name, redirect_uris, created_at) VALUES (?, ?, ?, ?)',
      [
        id,
        body.client_name?.slice(0, 100) || 'MCP client',
        JSON.stringify(body.redirect_uris),
        Date.now(),
      ],
    )
    return c.json(
      {
        client_id: id,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        redirect_uris: body.redirect_uris,
        client_name: body.client_name,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
      201,
    )
  })

  app.get('/oauth/authorize', (c) => {
    const params = new URLSearchParams(new URL(c.req.url).search)
    const client = getClient(params.get('client_id') ?? '')
    if (!client) return c.text('unknown client_id', 400)
    if (!redirectAllowed(client.redirectUris, params.get('redirect_uri') ?? '')) {
      return c.text('redirect_uri is not registered for this client', 400)
    }
    if (params.get('response_type') !== 'code') return c.text('response_type must be code', 400)
    if (!params.get('code_challenge') || params.get('code_challenge_method') !== 'S256') {
      return c.text('PKCE with S256 is required', 400)
    }
    return consent(c, authorizePage(params, client.name, requestedScopes(params.get('scope'))))
  })

  app.post('/oauth/authorize', async (c) => {
    const form = await c.req.parseBody()
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(form)) if (typeof v === 'string') params.set(k, v)

    const client = getClient(params.get('client_id') ?? '')
    if (!client) return c.text('unknown client_id', 400)
    const redirectUri = params.get('redirect_uri') ?? ''
    if (!redirectAllowed(client.redirectUris, redirectUri)) {
      return c.text('redirect_uri is not registered for this client', 400)
    }
    const challenge = params.get('code_challenge') ?? ''
    if (!challenge || params.get('code_challenge_method') !== 'S256') {
      return c.text('PKCE with S256 is required', 400)
    }

    const scopes = requestedScopes(params.get('scope'))
    const username = params.get('username') ?? ''
    if (!(await verifyCredentials(username, params.get('password') ?? ''))) {
      return consent(c, authorizePage(params, client.name, scopes, 'Wrong username or password'), 401)
    }

    const code = randomBytes(32).toString('base64url')
    db().run(
      `INSERT INTO oauth_codes (code_hash, client_id, username, challenge, redirect_uri, scopes, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tokenHash(code), client.id, username, challenge, redirectUri, scopes.join(' '), Date.now() + CODE_TTL],
    )
    const target = new URL(redirectUri)
    target.searchParams.set('code', code)
    if (params.get('state')) target.searchParams.set('state', params.get('state')!)
    target.searchParams.set('iss', ctxOrigin(c)) // RFC 9207
    return c.redirect(target.toString(), 302)
  })

  app.post('/oauth/token', async (c) => {
    pruneExpired()
    const form = await c.req.parseBody()

    if (form.grant_type === 'authorization_code') {
      const code = typeof form.code === 'string' ? form.code : ''
      const row = db()
        .query('SELECT * FROM oauth_codes WHERE code_hash = ?')
        .get(tokenHash(code)) as
        | {
            client_id: string
            username: string
            challenge: string
            redirect_uri: string
            scopes: string
            expires_at: number
          }
        | null
      // Single use, even when the checks below fail.
      db().run('DELETE FROM oauth_codes WHERE code_hash = ?', [tokenHash(code)])
      if (!row || row.expires_at < Date.now()) {
        return c.json({ error: 'invalid_grant', error_description: 'unknown or expired code' }, 400)
      }
      if (form.client_id !== row.client_id) {
        return c.json({ error: 'invalid_grant', error_description: 'client_id mismatch' }, 400)
      }
      if (typeof form.redirect_uri === 'string' && form.redirect_uri !== row.redirect_uri) {
        return c.json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' }, 400)
      }
      const verifier = typeof form.code_verifier === 'string' ? form.code_verifier : ''
      if (createHash('sha256').update(verifier).digest('base64url') !== row.challenge) {
        return c.json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400)
      }
      return c.json(issueTokens(row.username, row.client_id, row.scopes.split(' ').filter(Boolean)))
    }

    if (form.grant_type === 'refresh_token') {
      const refresh = typeof form.refresh_token === 'string' ? form.refresh_token : ''
      const row = db()
        .query(
          "SELECT username, client_id, scopes, expires_at FROM oauth_tokens WHERE token_hash = ? AND kind = 'refresh'",
        )
        .get(tokenHash(refresh)) as
        | { username: string; client_id: string; scopes: string; expires_at: number }
        | null
      // Rotation: the old refresh token dies whether or not this succeeds.
      db().run('DELETE FROM oauth_tokens WHERE token_hash = ?', [tokenHash(refresh)])
      if (!row || row.expires_at < Date.now()) {
        return c.json(
          { error: 'invalid_grant', error_description: 'unknown or expired refresh token' },
          400,
        )
      }
      if (typeof form.client_id === 'string' && form.client_id !== row.client_id) {
        return c.json({ error: 'invalid_grant', error_description: 'client_id mismatch' }, 400)
      }
      return c.json(issueTokens(row.username, row.client_id, row.scopes.split(' ').filter(Boolean)))
    }

    return c.json({ error: 'unsupported_grant_type' }, 400)
  })

  // What the app's "Connect AI apps" screen lists and revokes: the clients
  // holding a refresh token for the signed-in user. A client is registered
  // just before it is first authorized, so its own date is the "since".
  app.get('/oauth/connections', async (c) => {
    const username = await appUser(c)
    if (!username) return c.json({ error: 'unauthorized' }, 401)
    const rows = db()
      .query(
        `SELECT t.client_id AS id, c.name, c.created_at AS since, t.scopes
         FROM oauth_tokens t JOIN oauth_clients c ON c.id = t.client_id
         WHERE t.username = ? AND t.kind = 'refresh' AND t.expires_at > ?
         ORDER BY t.expires_at DESC`,
      )
      .all(username, Date.now()) as { id: string; name: string; since: number; scopes: string }[]
    const newest = new Map(rows.reverse().map((row) => [row.id, row]))
    return c.json(
      [...newest.values()]
        .sort((a, b) => b.since - a.since)
        .map((row) => ({ id: row.id, name: row.name, since: new Date(row.since).toISOString(), canWrite: row.scopes.split(' ').includes(SCOPES.write) })),
    )
  })

  app.delete('/oauth/connections/:id', async (c) => {
    const username = await appUser(c)
    if (!username) return c.json({ error: 'unauthorized' }, 401)
    // Only this user's grant to the client. Its tokens and any code not yet
    // exchanged all go, so the client has nothing left to come back with.
    const id = c.req.param('id')
    db().run('DELETE FROM oauth_codes WHERE username = ? AND client_id = ?', [username, id])
    const { changes } = db().run('DELETE FROM oauth_tokens WHERE username = ? AND client_id = ?', [username, id])
    if (!changes) return c.json({ error: 'No such connection' }, 404)
    return c.json({ disconnected: true })
  })

  return app
}
