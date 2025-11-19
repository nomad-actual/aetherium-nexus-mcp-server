import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
    buildCurrentWeatherTool,
    buildForecastTool,
} from '../mcp/weather.ts'
import type { ToolsDef, AetheriumConfig } from '../types.ts'
import { buildTimeTool } from '../mcp/time.ts'
import { buildWebSearchTool } from '../mcp/websearch.ts'
import { buildPackageTrackingTool } from '../mcp/trackpackage.ts'
import { buildWebScraperTool } from '../mcp/website-scraper.ts'
// import { buildSearchTool } from '../mcp/search.ts'

const toolsDef: ToolsDef[] = [
    buildCurrentWeatherTool(),
    buildForecastTool(),
    buildTimeTool(),
    // buildSearchTool(),
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
        mcpServerInstance.registerTool(
            tool.name,
            tool.config,
            async (args: any) => {
                const abortSignal = AbortSignal.timeout(config.mcpServer.toolCallRequestTimeout)
                return tool.handler(args, abortSignal)
            })
    })

    // todo add resources and such later?

    return mcpServerInstance
}
