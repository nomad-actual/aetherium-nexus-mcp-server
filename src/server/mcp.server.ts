import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { buildCurrentWeatherTool } from '../providers/weather';
import { ToolsDef } from '../types';

const toolsDef: ToolsDef[] = [
   buildCurrentWeatherTool(),
]

// builds the mcp server and returns its instance
export function buildMCPServer(): McpServer {
    const server = new McpServer({
        name: 'Aetherium Nexus MCP Server', // todo custom name?
        version: '1.0.0',
        title: 'Aetherium Nexus MCP Server',
    }, {
      capabilities: {
        tools: {}
      }
    });

    toolsDef.forEach((tool) => {
        server.registerTool(tool.name, tool.config, tool.handler)
    })

    // todo add resources and such later

    return server
}