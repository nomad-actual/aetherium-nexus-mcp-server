import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import z from 'zod';
import { JSDOM, VirtualConsole } from 'jsdom'
import { Readability, isProbablyReaderable  } from '@mozilla/readability';

import { AetheriumConfig, ReadableWebpageContent, ToolsDef } from '../types';
import { getConfig } from '../utils/config';
import logger from '../utils/logger';
import { scrapeWebPage } from '../utils/webscraper';

type SearXNGResult = {
    url: string,
    title: string,
    content: string // short description
}

// this is specifically for searxng
async function searchForResults(queryArg: string, config: AetheriumConfig): Promise<SearXNGResult[]> {
    // http2?
    const results = await axios.request({
        method: 'get',
        baseURL: config.search.host,
        timeout: config.search.timeout,
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
    const results = await searchForResults(args.query, config)

    const filteredResults = filterSites(results, config)

    const scrapeOpts = {
        maxContentLength: config.search.contentLimit,
        minScore: 20,
        minReadableLength: 140
    }

    const scrapePromises = filteredResults.map(result => scrapeWebPage(result.url, scrapeOpts))
    const promisesResults = await Promise.allSettled(scrapePromises)
    
    const duration = ((Date.now() - start) / 1000).toFixed(2)
    const contentArr: any[] = [{
        type: 'text',
        text: `Found the following results in ${duration} seconds.`
    }]

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
            
            contentArr.push({ type: 'text', text: JSON.stringify(toolResult) })
        }
    })

    return { content: contentArr }
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
        handler: async(args: any) => {
            const config = getConfig()
            return search(args, config)
        }
    }
}
