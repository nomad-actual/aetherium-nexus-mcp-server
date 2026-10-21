import z from 'zod'
import type { AetheriumConfig, ToolsDef } from '../types.ts'
import { getConfig } from '../utils/config.ts'
import logger from '../utils/logger.ts'
import { doWebScrape } from '../utils/webscraper/webscraper.ts'
import { stripUrlUserinfo } from '../utils/url.ts'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.d.ts'

async function scrape(args: { url: string }, config: AetheriumConfig, abortSignal: AbortSignal): Promise<CallToolResult> {
    try {
        // Structured field: pino's redaction strips userinfo at
        // serialization time, so the raw URL is safe to pass (F5).
        logger.info({ url: args.url }, 'Scraping webpage...')

        const outcome = await doWebScrape(args.url, config, abortSignal)

        switch (outcome.status) {
            case 'content':
                return { content: outcome.contents }
            case 'blocked':
                // Distinguish a security refusal from a genuinely empty
                // page — the LLM needs to know the URL was not scraped.
                return {
                    content: [{ type: 'text', text: outcome.reason }],
                }
            default:
                // An empty content array gives the LLM no signal about what
                // happened. Say so explicitly (scraper failures are logged).
                return {
                    content: [{ type: 'text', text: `No readable content found at ${stripUrlUserinfo(args.url)}` }],
                }
        }
    } catch (error) {
        // todo: handle errors better (aka the mcp way)
        logger.error({ message: 'Error scraping web page:', error })
        throw error
    }
}

export function buildWebScraperTool(): ToolsDef {
    return {
        name: 'scrape-website',
        config: {
            title: 'Scrape Website',
            description:
                'Scrapes the website content and returns the primary readable content, if any',
            inputSchema: {
                url: z
                    .string()
                    .describe('The url to scrape')
                    .trim()
                    .url({ message: 'Enter a valid URL' })
                    .nonempty(),
            },
            annotations: {
                readOnlyHint: true,
                openWorldHint: true,
            },
        },
        handler: async (args: any, signal: AbortSignal) => {
            const config = getConfig()
            return scrape(args, config, signal)
        },
    }
}
