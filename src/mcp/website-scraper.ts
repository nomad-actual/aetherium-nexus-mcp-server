import z from 'zod'
import { AetheriumConfig, ScrapeOptions, ToolsDef } from '../types.js'
import { getConfig } from '../utils/config.js'
import logger from '../utils/logger.js'
import { doWebScrape } from '../utils/webscraper/webscraper.js'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { abort } from '../utils/promises.js'

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
