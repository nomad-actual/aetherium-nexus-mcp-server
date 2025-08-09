import { getTracking, TrackingNumber } from "ts-tracking-number";
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import z from 'zod';

import { AetheriumConfig, ToolsDef } from '../types.js';
import { getConfig } from '../utils/config.js';
import logger from '../utils/logger.js';
import { screenshotWebPage } from '../utils/webscraper/webscraper.js';


function trackOnePackage(packageNumber: string, config: AetheriumConfig): TrackingNumber | null {
    const info = getTracking(packageNumber);
    if (!info) return null

    logger.info({ packageNumber, info })

    return info
}


async function trackPakages(args: { packages: string[] }, config: AetheriumConfig): Promise<CallToolResult> {
    const packages = new Set(args.packages || [])

    if (packages.size === 0) {
        return { content: [{ type: 'text', text: 'No packages provided' }] }
    }

    // todo config max of a few (probably 5) packages to track
    const maxPackages = 10

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
        const options = { width: 1280, height: 1200, timeout: 30_000 }
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
        handler: async(args: any) => {
            try {
                const config = getConfig()
                return trackPakages(args, config)
            } catch(err) {
                logger.error(err)
                throw err
            }
            
        }
    }

}

