import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { config } from './config'

/**
 * The sidecar's own store. It holds OAuth clients, codes and tokens and
 * nothing else; Journals' store.db is never opened here, and every read or
 * write of journal data goes through the Crystal API.
 */

let handle: Database | null = null

export function db(): Database {
  if (handle) return handle
  mkdirSync(dirname(config.dbPath), { recursive: true })
  handle = new Database(config.dbPath, { create: true })
  handle.run('PRAGMA journal_mode = WAL')
  migrate(handle)
  return handle
}

function migrate(d: Database): void {
  d.run(`
    CREATE TABLE IF NOT EXISTS oauth_clients (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      redirect_uris TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    )
  `)
  d.run(`
    CREATE TABLE IF NOT EXISTS oauth_codes (
      code_hash    TEXT PRIMARY KEY,
      client_id    TEXT NOT NULL,
      username     TEXT NOT NULL,
      challenge    TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      scopes       TEXT NOT NULL,
      expires_at   INTEGER NOT NULL
    )
  `)
  d.run(`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      token_hash TEXT PRIMARY KEY,
      kind       TEXT NOT NULL,
      username   TEXT NOT NULL,
      client_id  TEXT NOT NULL,
      scopes     TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `)
}

/** Tokens and codes are stored hashed, so a copy of the database is not a
 *  set of working credentials. */
export function tokenHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function pruneExpired(): void {
  const now = Date.now()
  db().run('DELETE FROM oauth_codes WHERE expires_at < ?', [now])
  db().run('DELETE FROM oauth_tokens WHERE expires_at < ?', [now])
}
