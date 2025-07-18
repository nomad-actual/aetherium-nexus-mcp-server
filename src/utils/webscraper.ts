import puppeteer from 'puppeteer'
import { JSDOM, VirtualConsole } from 'jsdom'
import { Readability, isProbablyReaderable  } from '@mozilla/readability';
import { capitalizeFirstLetter } from './formatter';
import { ReadableWebpageContent, ScrapeOptions } from '../types';
import logger from './logger';

type ScreenShotOptions = {
    width: number;
    height: number;
    timeout: number;
    quality?: number; // only applies to jpg
    format?: 'jpeg' | 'png';
}

export async function screenshotBrowser(url: string, screenshotOptions: ScreenShotOptions) {
    let browser = null
    
    try {
        browser = await puppeteer.launch()
        const page = await browser.newPage()
        await page.setViewport({
            width: screenshotOptions.width,
            height: screenshotOptions.height
        })

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.109 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle0', timeout: screenshotOptions.timeout })
        await page.content()

        const data = await page.screenshot({
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

export async function scrapeWebPage(url: string, options: ScrapeOptions): Promise<ReadableWebpageContent | null> {
    const virtualConsole = new VirtualConsole();
    // to ignore css parsing errors
    virtualConsole.on('error', err => console.log('looool', err))

    const dom = await JSDOM.fromURL(url, { virtualConsole })
    const reader = new Readability(dom.window.document)

    const readableOpts = {
        minContentLength: options.minReadableLength,
        minScore: options.minScore
    }

    if (!isProbablyReaderable(dom.window.document, readableOpts)) {
        logger.warn(`Skipping non-readerable page ${url}`)
        return null
    }

    const html = reader.parse()
    if (!html) {
        logger.error(`Failed to parse HTML from ${url}`)
        return null
    }

    const {
        title,
        lang,
        textContent,
        siteName = '',
        publishedTime = ''
    } = html

    // cleanup content
    let processedTextContent = (textContent || '')
        .replaceAll(/\n/g, ' ')
        .replaceAll(/\s{2,}/g, ' ')
        .trim()
        
    const maxContentLength = options.maxContentLength

    if (processedTextContent.length > maxContentLength) {
        logger.debug(`Truncating content to sentence closest to ${maxContentLength} characters`)

        // find the end of the sentence closest to maxContentLength characters
        const nextPos = processedTextContent.indexOf('.', maxContentLength)
        const truncIdx = nextPos === -1 ? maxContentLength : nextPos + 1

        processedTextContent = processedTextContent.substring(0, truncIdx)
    }

    const altSiteName = capitalizeFirstLetter(new URL(url).hostname)

    return {
        url,
        title: title || '',
        lang: lang || '', 
        content: processedTextContent,
        siteName: siteName || altSiteName,
        publishedTime: publishedTime || 'Published Date not found'
    }
}