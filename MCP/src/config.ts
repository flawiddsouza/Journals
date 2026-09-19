/**
 * Config for the MCP sidecar. JWT_SECRET is the same secret the Crystal API
 * signs its login tokens with: the sidecar mints a short-lived JWT per
 * upstream call, so the API needs no changes to accept us.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

export const config = {
  port: Number(process.env.MCP_PORT ?? 9901),
  /** Crystal API, reached over loopback inside the container. */
  apiUrl: (process.env.JOURNALS_API_URL ?? 'http://127.0.0.1:9900').replace(/\/$/, ''),
  jwtSecret: required('JWT_SECRET'),
  dbPath: process.env.MCP_DB ?? './data/mcp.db',
  /** The API's public URL, the same value as baseURL in the UI's config.js.
   *  An uploaded file is referenced from a page by this address,
   *  so without it uploads are refused rather than left unreferenced. */
  publicApiUrl: process.env.JOURNALS_PUBLIC_API_URL?.replace(/\/$/, '') || null,
  maxUploadBytes: 25 * 1024 * 1024,
  /** Lifetime of the JWTs we mint for upstream calls. Short on purpose: it
   *  bounds what a leaked one is worth, and we mint a fresh one per request. */
  upstreamTokenTtlSeconds: 300,
}
