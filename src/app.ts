import express, { Request, Response } from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'

import { randomUUID } from 'node:crypto';
import { buildMCPServer } from './server/mcp.server';

function buildMcpServerLol() {
    const server = buildMCPServer()

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
  origin: ['https://homelab.ist'],
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

app.listen(
  { port: 3000, host: '0.0.0.0' }, // todo config
  (error: Error| null) => console.log(`Server is running! ${new Date().toLocaleTimeString()}`, error)
)
