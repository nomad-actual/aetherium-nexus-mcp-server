import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import z from 'zod';

import { AetheriumConfig, ScrapeOptions, ToolsDef } from '../types.js';
import { getConfig } from '../utils/config.js';
import { doWebScrape } from '../utils/webscraper/webscraper.js';
import { abort } from '../utils/promises.js';

type SearXNGResult = {
    url: string,
    title: string,
    content: string // short description
}

// this is specifically for searxng
async function searchForResults(queryArg: string, config: AetheriumConfig, abortSignal: AbortSignal): Promise<SearXNGResult[]> {
    // http2?
    const results = await axios.request({
        method: 'get',
        baseURL: config.search.host,
        timeout: config.search.timeout,
        signal: abortSignal,
        headers: {
            'Content-Type': 'application/json',
        },
        params: {
            q: queryArg,
            format: 'json',
            // support categories or specific engines (these will be neat if working)
            // like search bandcamp for song/artist or something
        }
    })

    return (results.data || {}).results || [] as SearXNGResult[]
}

// omit known bad sites but really this hasn't happened yet often
// we might want to instead 
function filterSites(searchResults: SearXNGResult[], config: AetheriumConfig) {
    // const badSites = [
    //     // 'reddit.com'
    // ]


    // return searchResults.filter(result => {
        //     const tempUrl = new URL(result.url).host
        //     return !badSites.includes(tempUrl)
        // }).slice(0, config.search.maxResults)

    // filter out sites that do not produce good html content for reader mode
    // we will get the top X results and grab the content
    return searchResults.slice(0, config.search.maxResults)
}


export async function search(args: any, config: AetheriumConfig, signal: AbortSignal): Promise<CallToolResult> {
    // crawl each site and retrieve html for summarization
    const start = Date.now()
    const searchResults = await searchForResults(args.query, config, signal)
    const searchDuration = ((Date.now() - start) / 1000)

    const filteredResults = filterSites(searchResults, config)


    const scrapeOpts: ScrapeOptions = {
        maxContentLength: config.search.contentLimit,
        minScore: 20,
        minReadableLength: 140,
        timeout: config.search.timeout,
        signal
    }

    const scrapePromises = filteredResults.map(result => doWebScrape(result.url, scrapeOpts))
    const promisesResults = await Promise.allSettled(scrapePromises)

    const totalScrapeDuration = (((Date.now() - start) / 1000) - searchDuration).toFixed(2)

    const contentArr: any[] = []

    promisesResults.forEach((result) => {
        if (result.status === 'fulfilled' && (result.value !== null || Array.isArray(result.value))) {
            contentArr.push(...result.value)
            return
        }
    })

    if (contentArr.length === 0) {
        return { 
            content: [{ 
                type: 'text', 
                text: 'No results found. Recommend changing query and trying again.',
            }]
        }
    }

    // kinda ghetto but neat metadata to have
    const results = [
        {
            type: 'text',
            text: 
            `Found ${
                contentArr.length
            } results in ${searchDuration.toFixed(2)}s. Scraped in ${totalScrapeDuration}s`
        },
        ...contentArr
    ]

    return {
        content: results
    }
}


export function buildWebSearchTool(): ToolsDef {
    return {
        name: 'web-search',
        config: {
            title: 'Web Search',
            description: 'Searches the web and returns results for summarization',
            inputSchema: {
                query: z
                    .string({ description: 'The query that will be used to search against' })
                    .trim()
                    .nonempty()
            },
            attributes: {
                readOnlyHint: true,
                openWorldHint: true,
            }
        },
        handler: async(args: any, signal: AbortSignal) => {
            const config = getConfig()
            return search(args, config, signal)
        }
    }
}
