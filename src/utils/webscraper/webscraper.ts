import puppeteer from 'puppeteer'
import { McpToolContent, ScrapeOptions } from '../../types.js';
import logger from '../logger.js';
import BasicHtmlScraper from './BasicHtmlScraper.js';
import RedditScraper from './RedditScraper.js';

type ScreenShotOptions = {
    width: number;
    height: number;
    timeout: number;
    quality?: number; // only applies to jpg
    format?: 'jpeg' | 'png' | 'webp';
}

export async function screenshotWebPage(url: string, screenshotOptions: ScreenShotOptions) {
    let browser = null
    
    try {
        browser = await puppeteer.launch()
        const page = await browser.newPage()
        await page.setViewport({
            width: screenshotOptions.width,
            height: screenshotOptions.height
        })

        // get around bot detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.109 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle0', timeout: screenshotOptions.timeout })
        await page.content()

        const data = await page.screenshot({
            type: screenshotOptions.format || 'png',
            quality: screenshotOptions.quality || 70, // really only applies to jpgs
            optimizeForSpeed: true,
            captureBeyondViewport: true,
            encoding: 'base64',
        })

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

export async function doWebScrape(url: string, scrapeOpts: ScrapeOptions): Promise<McpToolContent[]> {
    const scrapers = getScrapers(url)

    // todo - failure handling - retry logic
    for (const scraper of scrapers) {
        if (scrapeOpts.signal?.aborted) {
            logger.warn('Aborted due to signal')
            break
        }

        const contents = await scraper.scrape(url, scrapeOpts)

        if (Array.isArray(contents)) {
            logger.info(`Content found using scraper ${scraper.constructor.name}`)

            const results = await scraper.buildResult(contents, scrapeOpts)

            return results
        }

    }

    logger.warn(`No content found on webpage ${url}`)
    return []
}
