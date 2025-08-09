import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
    buildCurrentWeatherTool,
    buildForecastTool,
} from '../mcp/weather.js'
import type { ToolsDef, AetheriumConfig } from '../types.js'
import { buildTimeTool } from '../mcp/time.js'
import { buildWebSearchTool } from '../mcp/websearch.js'
import { buildPackageTrackingTool } from '../mcp/trackpackage.js'
import { buildWebScraperTool } from '../mcp/website-scraper.js'

const toolsDef: ToolsDef[] = [
    buildCurrentWeatherTool(),
    buildForecastTool(),
    buildTimeTool(),
    buildWebSearchTool(),
    buildPackageTrackingTool(),
    buildWebScraperTool(),
]


export function buildMCPServer(config: AetheriumConfig): McpServer {
    const mcpServerInstance = new McpServer(
        { 
            name: config.mcpServer.title,
            version: '1.0.0',
            title: config.mcpServer.title,
        },
        {
            capabilities: { tools: {} },
        }
    )

    toolsDef.forEach((tool) => {
        // seems like can pass handler for progress updates as well
        mcpServerInstance.registerTool(tool.name, tool.config, tool.handler)
    })

    // todo add resources and such later?

    return mcpServerInstance
}
