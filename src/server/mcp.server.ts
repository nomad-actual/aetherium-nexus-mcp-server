import { McpServer, type ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
    buildCurrentWeatherTool,
    buildForecastTool,
} from '../tools/weather.ts'
import type { ToolsDef, AetheriumConfig } from '../types.ts'
import { buildTimeTool } from '../tools/time.ts'
import { buildWebSearchTool } from '../tools/websearch.ts'
import { buildPackageTrackingTool } from '../tools/trackpackage.ts'
import { buildWebScraperTool } from '../tools/website-scraper.ts'

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
            version: config.mcpServer.version,
            title: config.mcpServer.title,
        },
        {
            capabilities: { tools: {} },
        }
    )

    toolsDef.forEach((tool) => {
        // seems like can pass handler for progress updates as well
        // ToolsDef.config is typed `any`, so registerTool infers the zero-arg
        // ToolCallback type; the SDK actually invokes schema-registered tools as
        // (args, extra), so the two-arg handler is cast to the SDK's callback type.
        mcpServerInstance.registerTool(
            tool.name,
            tool.config,
            (async (args: any, extra: { signal: AbortSignal }) => {
                // Combine the SDK's request signal (fires on client disconnect/cancel)
                // with the global per-call timeout so either one aborts the handler.
                const abortSignal = AbortSignal.any([
                    extra.signal,
                    AbortSignal.timeout(config.mcpServer.toolCallRequestTimeout),
                ])
                return tool.handler(args, abortSignal)
            }) as ToolCallback)
    })

    // todo add resources and such later?

    return mcpServerInstance
}
