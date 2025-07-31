import express, { type Request, type Response } from 'express'
import cors from 'cors'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { buildMCPServer } from './server/mcp.server.js'
import { getConfig } from './utils/config.js'
import type { AetheriumConfig } from './types.js'
import logger from './utils/logger.js'

const config: AetheriumConfig = getConfig()

const corsAllowed = [
    '127.0.0.1',
    'localhost',
    'https://homelab.ist',
    'https://ai.homelab.ist',
]

const app = express()
app.use(express.json())
app.use(
    cors({
        origin: function (origin: string | undefined, callback) {
            const safeOrigin = origin || ''
            const allowed = corsAllowed.findIndex(o => o === safeOrigin || safeOrigin.includes(o || ''))
            console.log(origin || 'jlhsafldjfhljhdsflasldjh')

            if (allowed >= 0) {
                callback(null, true)
            } else {
                callback(new Error('Not allowed by CORS'))
            }
        },
        exposedHeaders: ['Mcp-Session-Id'],
        allowedHeaders: ['Content-Type', 'mcp-session-id', 'mcp-protocol-version'],
    })
)

app.post('/mcp', async (req: Request, res: Response) => {
    // In stateless mode, create a new instance of transport and server for each request
    // to ensure complete isolation. A single instance would cause request ID collisions
    // when multiple clients connect concurrently.

    try {
        logger.info(req)

        const server = buildMCPServer(config)

        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableDnsRebindingProtection: true,
            allowedHosts: ['127.0.0.1', 'localhost:3000', 'http://localhost', 'https://ai.homelab.ist'],
            allowedOrigins: ['https://ai.homelab.ist', 'http://localhost', 'http://localhost:5173']
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
    res.writeHead(405).end(
        JSON.stringify({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Method not allowed.',
            },
            id: null,
        })
    )
})

// Session termination not needed in stateless mode
app.delete('/mcp', async (req: Request, res: Response) => {
    logger.info('Received DELETE MCP request')
    res.writeHead(405).end(
        JSON.stringify({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Method not allowed.',
            },
            id: null,
        })
    )
})

const { port, host } = config.mcpServer

app.listen({ port, host }, (error: Error | undefined) => {
    if (error) {
        logger.error('Error starting MCP server:', error)
        process.exit(1)
    }

    logger.info(`MCP Server listening on http://${host}:${port}`, error || '')
})
