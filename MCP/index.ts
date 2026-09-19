import { Hono } from 'hono'
import { config } from './src/config'
import { fileRoutes } from './src/fileRoutes'
import { createTablesMcp } from './src/mcp'
import { bearerIdentity, oauthRoutes, origin, wwwAuthenticate } from './src/oauth'

/**
 * MCP sidecar for Journals.
 *
 * It adds nothing to the Crystal API and touches none of its tables: journal
 * reads and writes go over HTTP with a short-lived JWT the sidecar mints using
 * the shared JWT_SECRET, exactly as POST /login does. Its own database holds
 * only OAuth clients, codes and tokens.
 */

const app = new Hono()
const mcp = createTablesMcp()

app.route('/', oauthRoutes())
app.route('/', fileRoutes())

app.all('/mcp', async (c) => {
  const identity = bearerIdentity(c.req.header('authorization'))
  if (!identity) {
    return c.json({ error: 'unauthorized' }, 401, {
      'WWW-Authenticate': wwwAuthenticate(c.req.url, c.req.header('x-forwarded-proto')),
    })
  }
  // The address the client used, for the one-time file links the tools hand out.
  return mcp.fetch(c.req.raw, { ...identity, origin: origin(c.req.url, c.req.header('x-forwarded-proto')) })
})

export default { port: config.port, fetch: app.fetch }

console.log(`Journals MCP on http://localhost:${config.port}/mcp`)
console.log(`  upstream API: ${config.apiUrl}`)
console.log(
  `  connect: claude mcp add --scope user journals --transport http http://localhost:${config.port}/mcp`,
)
