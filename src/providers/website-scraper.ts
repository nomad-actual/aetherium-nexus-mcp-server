import z from 'zod'
import { AetheriumConfig, ToolsDef } from '../types'
import { getConfig } from '../utils/config'
import { scrapeReddit, scrapeWebPage } from '../utils/webscraper'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import logger from '../utils/logger'

function augmentScrapingUrl(url: string): string {
    logger.info(`Augmenting URL ${url}...`)

    if (
        url.startsWith('https://www.reddit.com') &&
        url.includes('/comments/')
    ) {
        // remove trailing slash if present at final character
        if (url.endsWith('/')) {
            url = url.slice(0, -1)
        }
        return `${url}.json`
    }

    return url
}

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

            // not used
            minScore: 20,
            minReadableLength: 140,
        }

        // augment reddit here
        const augmentedUrl = augmentScrapingUrl(args.url)

        // todo: hacky
        if (args.url !== augmentedUrl) {
            const redditResp = (await scrapeReddit(augmentedUrl, scrapeOpts)) || []

            // todo hacky again but fine for now
            if (Array.isArray(redditResp)) {
                const [redditData] = redditResp
                const comments = redditResp.slice(1)

                const metadata = `Main Content for: ${args.url} Language: ${
                    redditData?.lang || '(Not found)'
                } Date Published: ${redditData?.publishedTime} Site Name: ${
                    redditData?.siteName
                } Title: ${redditData?.title}`

                const content: any = [
                    { type: 'text', text: metadata },
                    { type: 'text', text: JSON.stringify(redditData || '') },
                ]

                const formattedContent = comments.map((comment) => {
                    const commentContent = `Reddit comment for: ${comment.url} Date Published: ${comment?.publishedTime} Comment Content: ${comment.content}`

                    return { type: 'text', text: commentContent }
                })

                content.push(
                    {
                        type: 'text',
                        text: 'Comments for post follow from here---',
                    },
                    ...formattedContent
                )

                return {
                    content,
                }
            }
        }

        const webContent = await scrapeWebPage(augmentedUrl, scrapeOpts)

        if (!webContent) {
            logger.warn('No content found on webpage:', augmentedUrl)
            return {
                content: [
                    {
                        type: 'text',
                        text: `No content found for webpage: ${augmentedUrl}`,
                    },
                ],
            }
        }

        const metadata = `Content for: ${webContent.url}\nLanguage: ${
            webContent.lang || '(Not found)'
        }\nDate Published: ${webContent.publishedTime}\nSite Name: ${
            webContent.siteName
        }\nTitle: ${webContent.title}`

        return {
            content: [
                { type: 'text', text: metadata },
                { type: 'text', text: webContent.content },
            ],
        }
    } catch (error) {
        // handle errors better
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
        handler: async (args: any) => {
            const config = getConfig()
            return scrape(args, config)
        },
    }
}
