import express, { Request, Response } from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMCPServer } from './server/mcp.server.js';
import { getConfig } from './utils/config.js';
import { AetheriumConfig } from './types.js';

const config: AetheriumConfig = getConfig()

function buildMcpServerLol() {
    const server = buildMCPServer(config)

    server.registerTool(
        'fetch-current-time',
        {
            title: 'Current Time Fetcher',
            description: 'Gets the time from NTP',
            inputSchema: {
            }
        },
        async (args: any) => {
            console.log('ntp time tool called', args)
            
            // const time = await getTime()
            const result = `Current time: ${new Date().toLocaleString()}`
            // console.log('ntp time tool result', result)

            return { content: [{ type: 'text', text: result }] }
        }
    )

    return server;
}



const app = express();
app.use(express.json());
app.use(cors({
  origin: config.mcpServer.cors,
  exposedHeaders: ['Mcp-Session-Id'],
  allowedHeaders: ['Content-Type', 'mcp-session-id'],
}));

app.post('/mcp', async (req: Request, res: Response) => {
  // In stateless mode, create a new instance of transport and server for each request
  // to ensure complete isolation. A single instance would cause request ID collisions
  // when multiple clients connect concurrently.
  
  try {
    console.log('MCP tool called', req.body, req.params, req.query)

    const server = buildMcpServerLol(); 
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      console.log('Request closed');
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.log('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

// SSE notifications not supported in stateless mode
app.get('/mcp', async (req: Request, res: Response) => {
  console.log('Received GET MCP request');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed.'
    },
    id: null
  }));
});

// Session termination not needed in stateless mode
app.delete('/mcp', async (req: Request, res: Response) => {
  console.log('Received DELETE MCP request');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed.'
    },
    id: null
  }));
});

const { port, host } = config.mcpServer

app.listen({ port, host }, (error: Error| null) => {
  console.log(`MCP Server listening on http://${host}:${port}`, error || '')
})
