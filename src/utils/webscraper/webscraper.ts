import type { AetheriumConfig, McpToolContent, ReadableWebpageContent } from '../../types.ts';
import type { IScraper } from './IScraper.ts';
import logger from '../logger.ts';
import BasicHtmlScraper from './BasicHtmlScraper.ts';
import CrwScraper from './CrwScraper.ts';
import { abortTimeout } from '../promises.ts';
import { assertFetchableUrl, getSsrfRefusalReason } from './ssrf.ts';
import { withScrapeSlot } from './scrapeSlots.ts';
import { stripUrlUserinfo } from '../url.ts';

// What a scrape produced. 'blocked' is the SSRF guard refusing the URL
// (pre-check or connect time); 'empty' means every scraper ran and found
// no readable content.
export type ScrapeOutcome =
    | { status: 'content'; contents: McpToolContent[] }
    | { status: 'blocked'; reason: string }
    | { status: 'empty' }

function getScrapers(url: string) {
    return [
        new CrwScraper(),
        new BasicHtmlScraper()
    ].filter((scraper) => scraper.shouldAttempt(url))
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

export async function doWebScrape(rawUrl: string, config: AetheriumConfig, signal: AbortSignal): Promise<ScrapeOutcome> {
    // Strip userinfo (username:password@) once at the entry, before it can
    // reach log lines, SSRF refusal messages, or the scrapers (F5).
    const url = stripUrlUserinfo(rawUrl)

    try {
        assertFetchableUrl(url)
    } catch (err) {
        const reason = errorMessage(err)
        logger.warn(`[Scraper] ${reason}`)
        return { status: 'blocked', reason }
    }

    const scrapers = getScrapers(url)

    const startTime = Date.now();

    for (const scraper of scrapers) {
        logger.debug(`[Scraper] Attempting ${scraper.constructor.name} on ${url}`)

        try {
            const contents = await attemptScrape(scraper, url, config, signal)

            if (contents && Array.isArray(contents) && contents.length > 0) {
                const duration = ((Date.now() - startTime) / 1000).toFixed(2)
                logger.info(`Content found using scraper ${scraper.constructor.name} (${duration}s)`)

                const results = await scraper.buildResult(contents)
                return { status: 'content', contents: results }
            }

            logger.debug(`[Scraper] ${scraper.constructor.name} returned null/empty on ${url}, trying next...`)
        } catch (err) {
            // A connect-time SSRF refusal hits every scraper the same way,
            // so stop instead of burning the remaining attempts.
            const refusalReason = getSsrfRefusalReason(err)
            if (refusalReason !== null) {
                logger.warn(`[Scraper] ${refusalReason}`)
                return { status: 'blocked', reason: refusalReason }
            }
            const message = errorMessage(err)
            logger.warn(`[Scraper] ${scraper.constructor.name} failed on ${url}: ${message}, trying next...`)
        }
    }

    logger.warn(`No content found on webpage ${url}`)
    return { status: 'empty' }
}

// One scrape attempt: a slot from the bounded pool plus the per-scraper
// budget. When the budget abandons the scrape, the slot is freed immediately;
// the abandoned work is bounded by the dispatcher socket timeouts.
async function attemptScrape(
    scraper: IScraper,
    url: string,
    config: AetheriumConfig,
    signal: AbortSignal,
): Promise<ReadableWebpageContent[] | null> {
    return withScrapeSlot(() =>
        abortTimeout<ReadableWebpageContent[] | null>(
            scraper.scrape(url, config, signal),
            config.scraper.timeout,
            `${scraper.constructor.name} on ${url}`,
        ),
    )
}
