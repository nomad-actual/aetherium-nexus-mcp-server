import { getTracking, type TrackingNumber } from "ts-tracking-number";
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.d.ts';
import z from 'zod';

import type { AetheriumConfig, ToolsDef } from '../types.ts';
import { getConfig } from '../utils/config.ts';
import logger from '../utils/logger.ts';
import { screenshotWebPage } from '../utils/webscraper/webscraper.ts';

function trackOnePackage(packageNumber: string, config: AetheriumConfig): TrackingNumber | null {
    const info = getTracking(packageNumber);
    if (!info) return null

    logger.info({ packageNumber, info })

    return info
}


async function trackPakages(args: { packages: string[] }, config: AetheriumConfig, abortSignal: AbortSignal): Promise<CallToolResult> {
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

    for (const p of packages) {
        const trackingInfo = trackOnePackage(p, config)

        if (!trackingInfo || !trackingInfo.trackingUrl) {
            // no drama at all, just log it
            logger.info({ result: p, message: `No tracking information found for ${p}` })
            continue;
        }

        const urlToScrape = trackingInfo.trackingUrl.replace('%s', trackingInfo.trackingNumber)

        // some websites take a long time to render...
        const options = { width: 1280, height: 1200, timeout: 30_000, signal: abortSignal }
        const screenshot = await screenshotWebPage(urlToScrape, options)

        const trackingContent = {
            trackingNumber: trackingInfo.trackingNumber,
            courier: trackingInfo.courier,
            name: trackingInfo.name,
        }

        results.push({ type: 'text', text: JSON.stringify(trackingContent) })
        results.push({
            type: 'image',
            data: screenshot, // base64 encoded image data
            mimeType: 'image/png', // todo: config + function to convert
            annotations: {
                'audience': ['user'],
                'priority': 0.9,
            }
        })
    }

    return {
        content: [
            { type: 'text', text: `Found ${packages.size} packages` },
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
                    z.string({ description: 'A tracking number' })
                        .trim()
                        .nonempty()
                    )
                    .min(1, 'At least one tracking number is required'),
            },
            attributes: {
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

