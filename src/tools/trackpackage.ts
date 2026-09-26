import { getTracking, type TrackingNumber } from "ts-tracking-number";
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.d.ts';
import z from 'zod';

import type { AetheriumConfig, McpToolContent, ToolsDef } from '../types.ts';
import { getConfig } from '../utils/config.ts';
import logger from '../utils/logger.ts';
import { doWebScrape } from '../utils/webscraper/webscraper.ts';

function trackOnePackage(packageNumber: string, config: AetheriumConfig): TrackingNumber | null {
    const info = getTracking(packageNumber);
    if (!info) return null

    logger.info({ packageNumber, info })

    return info
}


type ScrapeFn = (url: string, config: AetheriumConfig, signal: AbortSignal) => Promise<McpToolContent[]>

export async function trackPakages(args: { packages: string[] }, config: AetheriumConfig, abortSignal: AbortSignal, scrape: ScrapeFn = doWebScrape): Promise<CallToolResult> {
    const packages = new Set(args.packages || [])

    if (packages.size === 0) {
        return { content: [{ type: 'text', text: 'No packages provided' }] }
    }

    // todo config max of a few (probably 5) packages to track
    const maxPackages = 20

    if (packages.size > maxPackages) {
        return { content: [{ type: 'text', text: `Too many packages (${packages.size}) provided. Please provide up to ${maxPackages} packages.` }] }
    }

    const results: any[] = []
    let foundPackages = 0

    // Scrape all packages concurrently so the total is bounded by the slowest
    // single scrape (~2 x scraper.timeout) instead of the sum of all scrapes,
    // which for several packages always exceeded the tool call timeout.
    const settled = await Promise.allSettled(
        [...packages].map(async (p) => {
            const trackingInfo = trackOnePackage(p, config)

            if (!trackingInfo || !trackingInfo.trackingUrl) {
                // no drama at all, just log it
                logger.info({ result: p, message: `No tracking information found for ${p}` })
                return null
            }

            const urlToScrape = trackingInfo.trackingUrl.replace('%s', trackingInfo.trackingNumber)

            const trackingContent = {
                trackingNumber: trackingInfo.trackingNumber,
                courier: trackingInfo.courier,
                name: trackingInfo.name,
            }

            const scraped: McpToolContent[] = await scrape(urlToScrape, config, abortSignal)

            if (scraped.length === 0) {
                logger.info({ result: p, message: `No tracking content found at ${urlToScrape}` })
                return null
            }

            return { trackingContent, scraped }
        }),
    )

    for (const outcome of settled) {
        if (outcome.status !== 'fulfilled' || outcome.value === null) continue
        foundPackages++
        results.push({ type: 'text', text: JSON.stringify(outcome.value.trackingContent) })
        results.push(...outcome.value.scraped)
    }

    return {
        content: [
            { type: 'text', text: `Found ${foundPackages} of ${packages.size} packages` },
            ...results,
        ]
    }
}




export function buildPackageTrackingTool(): ToolsDef {
    return {
        name: 'track-package',
        config: {
            title: 'Package Tracking',
            description: 'Tracks the status of a package using tracking numbers',
            inputSchema: {
                packages: z.array(
                    z.string()
                        .describe('A tracking number')
                        .trim()
                        .nonempty()
                    )
                    .min(1, 'At least one tracking number is required'),
            },
            annotations: {
                readOnlyHint: true,
                openWorldHint: true,
            }
        },
        handler: async(args: any, abortSignal: AbortSignal) => {
            try {
                const config = getConfig()
                return trackPakages(args, config, abortSignal)
            } catch(err) {
                logger.error(err)
                throw err
            }
            
        }
    }

}

