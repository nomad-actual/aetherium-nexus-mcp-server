import puppeteer from 'puppeteer'
import type { AetheriumConfig, McpToolContent, ReadableWebpageContent } from '../../types.ts';
import logger from '../logger.ts';
import BasicHtmlScraper from './BasicHtmlScraper.ts';
import RedditScraper from './RedditScraper.ts';
import { abort, abortTimeout } from '../promises.ts';

type ScreenShotOptions = {
    width: number;
    height: number;
    timeout: number;
    signal: AbortSignal;
    quality?: number; // only applies to jpg
    format?: 'jpeg' | 'png' | 'webp';
}

async function abortWrapper<T>(fn: Promise<T>, signal: AbortSignal) {
    return abort(fn, signal, '')
}

export async function screenshotWebPage(url: string, screenshotOptions: ScreenShotOptions) {
    let browser: puppeteer.Browser | undefined
    
    const { width, height, timeout, signal } = screenshotOptions;
    const effectiveTimeout = timeout || 30_000;
    
    try {
        browser = await abortWrapper(puppeteer.launch(), signal)
        const page = await abortWrapper(browser.newPage(), signal)
        await page.setViewport({ width, height })

        // get around bot detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.109 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle0', timeout: effectiveTimeout })
        await abortWrapper(page.content(), signal)

        const data = await abortWrapper(
            page.screenshot({
                type: screenshotOptions.format || 'png'
            }),
            signal
        )


        await browser.close();

        return data
    } catch (error) {
        logger.error({ msg: 'Error taking screenshot', error })
        throw error;
    } finally {
        if (browser) await browser.close()
    }
}


function getScrapers(url: string) {
    return [
        new RedditScraper(),
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
