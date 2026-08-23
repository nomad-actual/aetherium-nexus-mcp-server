import type { AetheriumConfig, McpToolContent, ReadableWebpageContent } from '../../types.ts';
import logger from '../logger.ts';
import BasicHtmlScraper from './BasicHtmlScraper.ts';
import CrwScraper from './CrwScraper.ts';
import { abortTimeout } from '../promises.ts';

function getScrapers(url: string) {
    return [
        new CrwScraper(),
        new BasicHtmlScraper()
    ].filter((scraper) => scraper.shouldAttempt(url))
}

export async function doWebScrape(url: string, config: AetheriumConfig, signal: AbortSignal): Promise<McpToolContent[]> {
    const scrapers = getScrapers(url)

    const startTime = Date.now();

    for (const scraper of scrapers) {
        logger.debug(`[Scraper] Attempting ${scraper.constructor.name} on ${url}`)

        try {
            const contents = await abortTimeout<ReadableWebpageContent[] | null>(
                scraper.scrape(url, config, signal),
                config.scraper.timeout,
                `${scraper.constructor.name} on ${url}`,
            )

            if (contents && Array.isArray(contents) && contents.length > 0) {
                const duration = ((Date.now() - startTime) / 1000).toFixed(2)
                logger.info(`Content found using scraper ${scraper.constructor.name} (${duration}s)`)

                const results = await scraper.buildResult(contents)
                return results
            }

            logger.debug(`[Scraper] ${scraper.constructor.name} returned null/empty on ${url}, trying next...`)
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            logger.warn(`[Scraper] ${scraper.constructor.name} failed on ${url}: ${message}, trying next...`)
        }
    }

    logger.warn(`No content found on webpage ${url}`)
    return []
}
