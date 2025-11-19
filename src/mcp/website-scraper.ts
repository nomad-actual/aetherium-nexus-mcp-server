import z from 'zod'
import type { AetheriumConfig, ScrapeOptions, ToolsDef } from '../types.ts'
import { getConfig } from '../utils/config.ts'
import logger from '../utils/logger.ts'
import { doWebScrape } from '../utils/webscraper/webscraper.ts'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.d.ts'

async function scrape(args: { url: string }, config: AetheriumConfig, abortSignal: AbortSignal): Promise<CallToolResult> {
    try {
        logger.info(`Scraping webpage ${args.url}...`)

        // todo change this to one much larger since it's just a single page
        // adjust as needed but can't find hacker news?

        const scrapeOpts: ScrapeOptions = {
            maxContentLength: config.search.contentLimit,
            // not used
            minScore: 20,
            minReadableLength: 140,
            timeout: config.search.timeout,
            signal: abortSignal
        }

        const contents = await doWebScrape(args.url, scrapeOpts) as any

        return { content: contents }
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
                    .string({ description: 'The url to scrape' })
                    .trim()
                    .url({ message: 'Enter a valid URL' })
                    .nonempty(),
            },
            attributes: {
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
