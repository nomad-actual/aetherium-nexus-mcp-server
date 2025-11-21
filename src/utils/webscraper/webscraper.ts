import puppeteer from 'puppeteer'
import type { AetheriumConfig, McpToolContent } from '../../types.ts';
import logger from '../logger.ts';
import BasicHtmlScraper from './BasicHtmlScraper.ts';
import RedditScraper from './RedditScraper.ts';
import { abort } from '../promises.ts';

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
    let browser: puppeteer.Browser
    
    const { width, height, timeout, signal } = screenshotOptions;

    try {
        browser = await abortWrapper(puppeteer.launch(), signal)
        const page = await abortWrapper(browser.newPage(), signal)
        await page.setViewport({ width, height })

        // get around bot detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.109 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle0', timeout, signal })
        await abortWrapper(page.content(), signal)

        const data = await abortWrapper(
            page.screenshot({
                type: screenshotOptions.format || 'png',
                quality: screenshotOptions.quality || 70, // really only applies to jpgs
                optimizeForSpeed: true,
                captureBeyondViewport: true,
                encoding: 'base64',
            }),
            signal
        )

        await browser.close();

        return data
    } catch (error) {
        logger.error({ msg: 'Error taking screenshot', error })
        throw error;
    }
    finally {
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

    // todo - failure handling - retry logic
    for (const scraper of scrapers) {
        const contents = await scraper.scrape(url, config, signal)

        if (Array.isArray(contents)) {
            logger.info(`Content found using scraper ${scraper.constructor.name}`)

            const results = await scraper.buildResult(contents)

            return results
        }

    }

    logger.warn(`No content found on webpage ${url}`)
    return []
}
