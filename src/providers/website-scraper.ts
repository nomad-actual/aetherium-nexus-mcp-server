import z from 'zod'
import { AetheriumConfig, ToolsDef } from '../types'
import { getConfig } from '../utils/config'
import { scrapeWebPage } from '../utils/webscraper'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import logger from '../utils/logger'

async function scrape(
    args: { url: string },
    config: AetheriumConfig
): Promise<CallToolResult> {
    try {
        logger.info(`Scraping webpage ${args.url}...`)

        // todo change this to one much larger since it's just a single page
        // adjust as needed but can't find hacker news?
        const scrapeOpts = {
            maxContentLength: config.search.contentLimit,
            minScore: 20,
            minReadableLength: 140,
        }
        
        const webContent = await scrapeWebPage(args.url, scrapeOpts)

        if (!webContent) {
            logger.warn('No content found on webpage:', args.url)
            return {
                content: [{ type: 'text', text: `No content found for webpage: ${args.url}` }],
            }
        }

        const metadata = 
        `Content for: ${
            webContent.url
        }\nLanguage: ${
            webContent.lang || '(Not found)'
        }\nDate Published: ${
            webContent.publishedTime
        }\nSite Name: ${
            webContent.siteName
        }\nTitle: ${webContent.title}`


        return {
            content: [
                { type: 'text', text: metadata },
                { type: 'text', text: webContent.content },
            ]
        }



    } catch (error) {
        // handle errors better
        logger.error('Error scraping web page:', error)
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
        handler: async (args: any) => {
            const config = getConfig()
            return scrape(args, config)
        },
    }
}
