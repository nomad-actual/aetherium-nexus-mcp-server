import type { CallToolResult } from '@modelcontextprotocol/sdk/types.d.ts';
import { fetch as undiciFetch } from 'undici';
import z from 'zod';

import type { AetheriumConfig, ToolsDef } from '../types.ts';
import { getConfig } from '../utils/config.ts';
import { doWebScrape } from '../utils/webscraper/webscraper.ts';
import { wrapBodyWithSizeLimit } from '../utils/webscraper/dispatcher.ts';

type SearXNGResult = {
    url: string,
    title: string,
    content: string // short description
}

// this is specifically for searxng
async function searchForResults(queryArg: string, config: AetheriumConfig, abortSignal: AbortSignal): Promise<SearXNGResult[]> {
    // http2?
    const base = config.search.host.replace(/\/+$/, '')
    const url = new URL(`${base}/search`)
    url.searchParams.set('q', queryArg)
    url.searchParams.set('format', 'json')
    // support categories or specific engines (these will be neat if working)
    // like search bandcamp for song/artist or something

    const resp = await undiciFetch(url, {
        signal: AbortSignal.any([abortSignal, AbortSignal.timeout(config.search.timeout)]),
    })
    if (!resp.ok) {
        throw new Error(`SearXNG search failed with status ${resp.status}`)
    }

    // Cap the SearXNG response body to prevent OOM from a slow-drip or
    // compromised search backend (F8).  CRW already has this cap.
    const sizeController = new AbortController()
    const limitedBody = wrapBodyWithSizeLimit(
        resp.body as ReadableStream<Uint8Array>,
        config.scraper.maxBytes,
        sizeController,
    )

    const chunks: Uint8Array[] = []
    const reader = limitedBody.getReader()
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) chunks.push(value)
    }
    const bodyBuffer = Buffer.concat(chunks)
    const data = JSON.parse(bodyBuffer.toString()) as { results?: SearXNGResult[] }
    return data?.results ?? []
}

function filterSites(searchResults: SearXNGResult[], config: AetheriumConfig) {
    // filter out sites that do not produce good html content for reader mode
    // we will get the top X results and grab the content
    return searchResults.slice(0, config.search.maxResults)
}


export async function search(args: any, config: AetheriumConfig, signal: AbortSignal): Promise<CallToolResult> {
    // Validate that a search backend is configured before attempting a request.
    // SEARCH_HOST defaults to '' which makes the URL construction below fail
    // with no actionable hint for the operator.
    if (!config.search.host) {
        return {
            content: [{
                type: 'text',
                text: 'Web search is not configured. Set SEARCH_HOST to a SearXNG instance URL (e.g. http://localhost:8080).',
            }],
            isError: true,
        }
    }

    // crawl each site and retrieve html for summarization
    const start = Date.now()
    const searchResults = await searchForResults(args.query, config, signal)
    const searchDuration = ((Date.now() - start) / 1000)

    const filteredResults = filterSites(searchResults, config)

    const scrapePromises = filteredResults.map(result => doWebScrape(result.url, config, signal))
    const promisesResults = await Promise.allSettled(scrapePromises)

    const totalScrapeDuration = (((Date.now() - start) / 1000) - searchDuration).toFixed(2)

    const contentArr: any[] = []

    promisesResults.forEach((result) => {
        // Blocked (SSRF refusal) and empty results contribute nothing.
        if (result.status === 'fulfilled' && result.value.status === 'content') {
            contentArr.push(...result.value.contents)
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
                    .string()
                    .describe('The query that will be used to search against')
                    .trim()
                    .nonempty()
            },
            annotations: {
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
