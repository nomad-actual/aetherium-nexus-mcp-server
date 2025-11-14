
import z from "zod"
import { AetheriumConfig, ToolsDef } from "../types.js"
import { getConfig } from "../utils/config.js"
import { search } from "../rag/search.js"
import { search as webSearch} from "./websearch.js"
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { formatDate } from "../utils/formatter.js"
import { getTime } from "./time.js"


// this will be an mcp which will search across the sum of 
// the user's knowledge including their own documents and external 
// (aka web via search) sources.
async function doRagSearch(query: string, config: AetheriumConfig) {
    const ragResults = await search(query, config)
    
    const mcpContent: any = ragResults.map((result) => {
        return {
            type: 'text',
            text: result.content,
            _meta: {
                source: 'rag',
                uri: result.metadata.uri // note would resources be useful here?
            }
        }
    })

    return mcpContent
}



async function searchEverything(args: any, config: AetheriumConfig): Promise<CallToolResult> {
    // ideally lookup web and rag simultaneously
    // if rag enabled

    const promises = []

    if (args.useWebSearch) {
        promises.push(webSearch(args, config).then((results) => results.content))
    }
    
    if (args.useRagSearch) {
        promises.push(doRagSearch(args.query, config))
    }

    // for time-related searches like 'most recent', it's helpful to have this context
    const time = await getTime(config.timeserver)
    const day = formatDate(time, config.locale, config.defaultLocation.timezone)

    const results = (await Promise.all(promises)).flat()

    // ideally I imagine an mcp result that can be custom formatted based on the tool 
    // that was called specific to my mcp ui to make it extra special.

    const mcpResultsWith: any = [
        { type: 'text', text: `Today is ${day}.` },
        ...results
    ]

    return {
        content: mcpResultsWith
    }
}



export function buildSearchTool(): ToolsDef {
    return {
        name: 'search',
        config: {
            title: 'Searches everything',
            description: 'Searches locally indexed documents for summarization',
            inputSchema: {
                query: z
                    .string({ description: 'The query that will be used' })
                    .trim()
                    .nonempty(),
                useWebSearch: z
                    .optional(
                        z.boolean({
                            description: 'Include searching the Web',
                            coerce: true
                        })
                        .default(false)
                    ),
                useRagSearch: z
                    .optional(
                        z.boolean({
                            description: 'Include searching the user\'s knowledgebase and information',
                            coerce: true
                        })
                        .default(false)
                    ),
                semanticEvaluation: z
                    .optional(
                        z.boolean({
                            description: 'Whether to use semantic search for better RAG results',
                            coerce: true,
                        })
                        .default(false)
                    )
            },
            attributes: {
                readOnlyHint: true,
                openWorldHint: true,
            }
        },
        handler: async(args: any) => {
            const config = getConfig()
            return searchEverything(args, config)
        }
    }
}

