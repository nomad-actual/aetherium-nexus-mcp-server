import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
    buildCurrentWeatherTool,
    buildForecastTool,
} from '../providers/weather.js'
import type { ToolsDef, AetheriumConfig } from '../types.js'
import { buildTimeTool } from '../providers/time.js'
import { buildWebSearchTool } from '../providers/websearch.js'

const toolsDef: ToolsDef[] = [
    buildCurrentWeatherTool(),
    buildForecastTool(),
    buildTimeTool(),
    buildWebSearchTool(),
]

export function buildMCPServer(config: AetheriumConfig): McpServer {
    const server = new McpServer(
        {
            name: config.mcpServer.title,
            version: '1.0.0', // todo config?
            title: config.mcpServer.title,
        },
        {
            capabilities: { tools: {} },
        }
    )

    toolsDef.forEach((tool) => {
        // seems like can pass handler for progress updates as well
        server.registerTool(tool.name, tool.config, tool.handler)
    })

    // todo add resources and such later?

    return server
}
