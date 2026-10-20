import 'dotenv/config'
import express, { type NextFunction, type Request, type Response } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { buildMCPServer } from './server/mcp.server.ts'
import { createBearerAuthMiddleware, hostValidationMiddleware } from './server/guards.ts'
import { getConfig } from './utils/config.ts'
import type { AetheriumConfig } from './types.ts'
import logger from './utils/logger.ts'
import { handleUncaughtErrors } from './utils/crashGuard.ts'
import { closeDispatchers } from './utils/webscraper/dispatcher.ts'

// Safety net before any other work: an uncaught exception (e.g. an unhandled
// 'error' event from undici's HTTP/2 client) or an unhandled promise
// rejection must not take the whole server down. See crashGuard.ts.
handleUncaughtErrors()

const config: AetheriumConfig = getConfig()

const app = express()

// DNS rebinding protection: reject disallowed Host headers before the body is
// even read. Defaults to localhost-only for localhost binds (see guards.ts).
const hostValidation = hostValidationMiddleware(config)
if (hostValidation) {
    app.use(hostValidation)
}

// Bearer auth for /mcp MUST run before body parsing so unauthenticated
// clients cannot waste CPU/memory on large bodies. /health stays open.
if (config.mcpServer.authToken) {
    app.use('/mcp', createBearerAuthMiddleware(config.mcpServer.authToken))
} else {
    logger.warn(
        'MCP_SERVER_AUTH_TOKEN is not set; /mcp is unauthenticated. '
        + 'Set it for any server reachable beyond your own machine.'
    )
}

// Explicit body limit (default is 100 KB).  Larger payloads are rejected
// with a JSON-RPC error instead of the default Express HTML 413 page.
const BODY_LIMIT = '1mb'
app.use(express.json({ limit: BODY_LIMIT }))

app.post('/mcp', async (req: Request, res: Response) => {
    // In stateless mode, create a new instance of transport and server for each request
    // to ensure complete isolation. A single instance would cause request ID collisions
    // when multiple clients connect concurrently.

    try {
        // Log only what identifies the request; the full request object
        // carries every header (credentials, cookies) and must not go to logs.
        logger.info({ method: req.method, path: req.path }, 'MCP request')

        const server = buildMCPServer(config)

        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableDnsRebindingProtection: true,
            // Host header is enforced by hostValidationMiddleware above
            // (port-agnostic, before body parsing); the transport-level
            // allowedHosts check is a raw exact match and would 403 on
            // 'host:port' headers. Origin is checked only when the operator
            // sets MCP_SERVER_CORS_ALLOWED_ORIGINS.
            allowedOrigins: config.mcpServer.corsAllowedOrigins,
        })

        res.on('close', () => {
            logger.info('Request closed')
            transport.close()
            server.close()
        })

        await server.connect(transport)
        await transport.handleRequest(req, res, req.body)
    } catch (error) {
        logger.error({ message: 'Error handling MCP request', error })

        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: null,
            })
        }
    }
})

// SSE notifications not supported in stateless mode
app.get('/mcp', async (req: Request, res: Response) => {
    logger.info('Received GET MCP request')
    res.status(405).json({
        jsonrpc: '2.0',
        error: {
            code: -32000,
            message: 'Method not allowed.',
        },
        id: null,
    })
})



// Session termination not needed in stateless mode
app.delete('/mcp', async (req: Request, res: Response) => {
    logger.info('Received DELETE MCP request')
    res.status(405).json({
        jsonrpc: '2.0',
        error: {
            code: -32000,
            message: 'Method not allowed.',
        },
        id: null,
    })
})

app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() })
})

// Catch-all error handler for /mcp — returns JSON-RPC error objects
// instead of Express's default HTML error pages (which leak stack traces).
app.use('/mcp', (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.warn({ message: err.message }, 'MCP request error')

    const status = err instanceof SyntaxError ? 400 : 500
    const code = err instanceof SyntaxError ? -32700 : -32603
    const message = err instanceof SyntaxError ? 'Parse error' : 'Internal server error'

    if (!res.headersSent) {
        res.status(status).json({
            jsonrpc: '2.0',
            error: { code, message },
            id: null,
        })
    }
})

const { port, host } = config.mcpServer

// Refuse to bind to a non-localhost address without auth — prevents the
// common mistake of accidentally exposing an unauthenticated MCP server
// (and its scrape/search tools) as an open outbound HTTP proxy.
const NON_LOCALHOST_HOSTS = ['0.0.0.0', '::']
if (NON_LOCALHOST_HOSTS.includes(host) && !config.mcpServer.authToken) {
    logger.error(
        'MCP_SERVER_HOST is set to a non-localhost address without ' +
        'MCP_SERVER_AUTH_TOKEN. Refusing to start. Set MCP_SERVER_AUTH_TOKEN ' +
        'or change MCP_SERVER_HOST to 127.0.0.1.',
    )
    process.exit(1)
}

// Explicit maxHeaderSize so oversized headers get an HTTP 431 instead
// of a raw TCP reset (F14).  Node's default is 16 KB; bump to 64 KB
// to accommodate legitimate clients with large cookies / auth tokens
// while still bounding the attack surface.
app.listen({ port, host, maxHeaderSize: 64 * 1024 }, (error: Error | undefined) => {
    if (error) {
        logger.error(error, 'Error starting MCP server')
        process.exit(1)
    }

    logger.info(`MCP Server listening on http://${host}:${port}`)
})

/**
 * Graceful shutdown: stop accepting new requests, drain in-flight ones
 * with a short deadline, close shared undici agents, then exit.
 */
async function shutdown(signal: string) {
    logger.info(`Received ${signal}, shutting down gracefully...`)

    // Undici agents will abort in-flight requests when destroyed,
    // so we just close them after a brief drain window.
    setTimeout(async () => {
        try {
            await closeDispatchers()
            logger.info('Dispatchers closed')
        } catch (err) {
            logger.error(err, 'Error closing dispatchers')
        }
        process.exit(0)
    }, 2_000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
