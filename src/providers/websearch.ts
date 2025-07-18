import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import z from 'zod';
import { JSDOM, VirtualConsole } from 'jsdom'
import { Readability, isProbablyReaderable  } from '@mozilla/readability';

import { AetheriumConfig, ToolsDef } from '../types';
import { getConfig } from '../utils/config';
import logger from '../utils/logger';
import { capitalizeFirstLetter } from '../utils/formatter';

type SearXNGResult = {
    url: string,
    title: string,
    content: string // short description
}

// this is specifically for searxng
async function searchForResults(queryArg: string, timerange: any, config: AetheriumConfig): Promise<SearXNGResult[]> {
    const query = queryArg.replaceAll(/\s+/gi, '+')
    const timeRangeArr = timerange ? [timerange.days, timerange.months, timerange.years] : undefined

    // http2?
    const results = await axios.request({
        method: 'get',
        baseURL: config.search.host,
        timeout: config.search.timeout,
        headers: {
            'Content-Type': 'application/json',
            // more?
        },
        params: {
            q: query,
            format: 'json',
            time_range: timeRangeArr,

            // support categories or specific engines (these will be neat if working)
            // like search bandcamp for song/artist or something
        }
    })

    return (results.data || {}).results || [] as SearXNGResult[]
}

type ReadableWebpageContent = {
    title: string;
    url: string;
    content: string;
    siteName: string;
    lang: string;
    publishedTime: string;
}

async function getHtmlContent(url: string, contentLimit: number): Promise<ReadableWebpageContent | null> {
    const content: any[] = []

    const virtualConsole = new VirtualConsole();
    // to ignore css parsing errors
    virtualConsole.on('error', (err) => {console.log('looool', err) })

    const dom = await JSDOM.fromURL(url, { virtualConsole })
    const reader = new Readability(dom.window.document)

    if (!isProbablyReaderable(dom.window.document)) {
        logger.warn(`Skipping non-readerable page ${url}`)
        return null
    }

    const html = reader.parse()
    if (!html) {
        logger.error(`Failed to parse HTML from ${url}`)
        return null
    }

    const {
        title,
        lang,
        textContent,
        siteName = '',
        publishedTime = ''
    } = html

    // cleanup content
    let processedTextContent = (textContent || '')
        .replaceAll(/\n/g, ' ')
        .replaceAll(/\s{2,}/g, ' ')
        .trim()
        
    const maxContentLength = contentLimit

    if (processedTextContent.length > maxContentLength) {
        logger.debug(`Truncating content to sentence closest to ${maxContentLength} characters`)

        // find the end of the sentence closest to maxContentLength characters
        const nextPos = processedTextContent.indexOf('.', maxContentLength)
        const truncIdx = nextPos === -1 ? maxContentLength : nextPos + 1

        processedTextContent = processedTextContent.substring(0, truncIdx)
    }

    const altSiteName = capitalizeFirstLetter(new URL(url).hostname)

    return {
        url,
        title: title || '',
        lang: lang || '', 
        content: processedTextContent,
        siteName: siteName || altSiteName,
        publishedTime: publishedTime || 'Published Date not found'
    }
}

// omit known bad sites but really this hasn't happened yet often
// we might want to instead 
function filterSites(searchResults: SearXNGResult[], config: AetheriumConfig) {
    // const badSites = [
    //     // 'reddit.com'
    //     'ttettsdgsgsdgsdgsadsdfajhdf23487234'
    // ]


    // return searchResults.filter(result => {
        //     const tempUrl = new URL(result.url).host
        //     return !badSites.includes(tempUrl)
        // }).slice(0, config.search.maxResults)

    // filter out sites that do not produce good html content for reader mode
    // we will get the top X results and grab the content
    return searchResults.slice(0, config.search.maxResults)
}


export async function search(args: any, config: AetheriumConfig): Promise<CallToolResult> {
    // crawl each site and retrieve html for summarization
    const start = Date.now()
    const results = await searchForResults(args.query, args.timeRange, config)

    const filteredResults = filterSites(results, config)

    const scrapePromises = filteredResults.map((result: SearXNGResult) => getHtmlContent(result.url, config.search.contentLimit))
    const promisesResults = await Promise.allSettled(scrapePromises)

    const contentArr: any[] = []

    promisesResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value !== null) {
            const content = result.value

            const toolResult = {
                title: content.title,
                siteName: content.siteName,
                url: content.url,
                content: content.content,
                published: content.publishedTime,
            }
            
            contentArr.push({
                type: 'text',
                text: JSON.stringify(toolResult)
            })
        }
    })

    const duration = ((Date.now() - start) / 1000).toFixed(2)
    contentArr.unshift({
        type: 'text',
        text: `We found the following ${contentArr.length} results in ${duration} seconds.`
    })

    return {
        content: contentArr
    }
}



export function buildWebSearchTool(): ToolsDef {
    return {
        name: 'web-search',
        config: {
            title: 'Web Search',
            description: 'Searches the web and returns results for summarization',
            inputSchema: {
                query: z.string({ description: 'The query that will be used to search against' }),
                timeRange: z.optional(
                    z.object({
                        days: z.number().positive(),
                        months: z.number().positive(),
                        years: z.number().positive(),
                    }, {
                        description: 'Time range for search results for engines that support it'
                    })
                )
            },
            attributes: {
                title: 'Web Searcher',
                readOnlyHint: true,
                openWorldHint: true,
            }
        },
        handler: async(args: any) => {
            const config = getConfig()
            return search(args, config)
        }
    }
}
