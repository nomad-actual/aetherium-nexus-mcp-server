
import z from "zod"
import { AetheriumConfig, ToolsDef } from "../types.js"
import { getConfig } from "../utils/config.js"
import { getRagDatastore } from "../rag/database/datastore.js"
import { search } from "../rag/search.js"
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js"


// this will be an mcp which will search across the sum of 
// the user's knowledge including their own documents and external 
// (aka web via search) sources.

async function searchEverything(args: any, config: AetheriumConfig): Promise<CallToolResult> {
    // ideally lookup web and rag simultaneously
    // if rag enabled
    // const ragSource = await getRagDatastore(config)
    // const webSource = await getWebSearchResults(args.query, config)

    const ragResults = await search(args.query, config)

    const mcpContent: any = ragResults.map((result) => {
        return {
            type: 'text',
            text: result.content,
            _meta: {
                source: 'rag',
                uri: result.metadata.uri // note wouldn't resources be useful here?
            }
        }
    })

    return {
        content: mcpContent
    }
}



export function buildKnowledgeSearchTool(): ToolsDef {
    return {
        name: 'knowledgebase-search',
        config: {
            title: 'Knowledge Search',
            description: 'Searches locally indexed documents for summarization',
            inputSchema: {
                query: z
                    .string({ description: 'The query that will be used' })
                    .trim()
                    .nonempty(),
                semanticSearch: z
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


