import express, { type Request, type Response } from 'express'
import cors from 'cors'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { buildMCPServer } from './server/mcp.server.js'
import { getConfig } from './utils/config.js'
import type { AetheriumConfig } from './types.js'
import logger from './utils/logger.js'

const config: AetheriumConfig = getConfig()

const app = express()
app.use(express.json())
app.use(
    cors({
        origin: config.mcpServer.cors,
        exposedHeaders: ['Mcp-Session-Id'],
        allowedHeaders: ['Content-Type', 'mcp-session-id'],
    })
)

app.post('/mcp', async (req: Request, res: Response) => {
    // In stateless mode, create a new instance of transport and server for each request
    // to ensure complete isolation. A single instance would cause request ID collisions
    // when multiple clients connect concurrently.

    try {
        logger.info(req)

        const server = buildMCPServer(config)

        const transport: StreamableHTTPServerTransport =
            new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
            })

        res.on('close', () => {
            logger.info('Request closed')
            transport.close()
            server.close()
        })

        await server.connect(transport)
        await transport.handleRequest(req, res, req.body)
    } catch (error) {
        logger.error('Error handling MCP request:', error)

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
