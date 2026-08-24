import z from 'zod'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.d.ts'
import type { AetheriumConfig, ToolsDef } from '../types.ts'
import { getConfig } from '../utils/config.ts'
import { search } from '../rag/search.ts'

async function ragSearchHandler(
    args: { query: string; resultsLimit?: number },
    config: AetheriumConfig,
    signal: AbortSignal
): Promise<CallToolResult> {
    signal.throwIfAborted()

    const { query, resultsLimit } = args
    const limit = resultsLimit ?? config.rag.limitResults;

    const limitedConfig: AetheriumConfig = {
        ...config,
        rag: {
            ...config.rag,
            limitResults: limit
        }
    }

    const results = await search(query, limitedConfig)

    if (results.length === 0) {
        return {
            content: [{
                type: 'text',
                text: `No results found for query: "${query}"`,
            }],
        }
    }

    const formatted = results.map((r, i) =>
        `#${i + 1} [${r.metadata.uri}] (similarity: ${r.metadata.cosineSimilarityScore.toFixed(4)})\n${r.content}`
    ).join('\n\n---\n\n')

    return {
        content: [
            {
                type: 'text',
                text: `Found ${results.length} result(s) for "${query}":\n\n${formatted}`,
            },
        ],
    }
}

export function buildRagSearchTool(): ToolsDef {
    return {
        name: 'rag-search',
        config: {
            title: 'RAG Search',
            description: 'Searches the local RAG knowledge base for relevant document passages.',
            inputSchema: {
                query: z
                    .string()
                    .describe('The search query against the knowledge base')
                    .trim()
                    .nonempty(),
                resultsLimit: z.optional(
                    z.number().int().positive().max(50).describe('Max results to return')
                ),
            },
            annotations: {
                title: 'RAG Search',
                readOnlyHint: true,
                openWorldHint: false,
            },
        },
        handler: async (args: any, signal: AbortSignal) => {
            const config = getConfig()
            return ragSearchHandler(args, config, signal)
        },
    }
}
