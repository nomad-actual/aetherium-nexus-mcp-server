import puppeteer from 'puppeteer'
import { JSDOM, VirtualConsole } from 'jsdom'
import { Readability, isProbablyReaderable  } from '@mozilla/readability';
import { capitalizeFirstLetter } from './formatter';
import { ReadableWebpageContent, ScrapeOptions } from '../types';
import logger from './logger';
import axios from 'axios';

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


export async function scrapeReddit(url: string, options: ScrapeOptions): Promise<ReadableWebpageContent[] | null> {
    const startTime = Date.now();

    const resp = await axios.request({
        method: 'GET',
        url,
    })

    if (resp.status !== 200) {
        logger.error(`Failed to fetch Reddit page at ${url}. Status code: ${resp.status}`)
        return null;
    }

    const data = resp.data;

    // determine if reddit data is valid, can always fall back to html
    const mainPosting = data[0]?.data?.children[0]?.data;
    if (!mainPosting) {
        return null
    }

    const author = mainPosting.author;
    const content = mainPosting.selftext;
    const title = `Posted by: ${author}: ${mainPosting.title}`;
    const postedDate = new Date(mainPosting.created_utc * 1000);

    const stuff: ReadableWebpageContent = {
        content,
        title,
        lang: 'Unknown',
        publishedTime: postedDate.toISOString(),
        siteName: 'Reddit',
        url,
        scrapeDuration: `${(Date.now() - startTime) / 1000} seconds`,
    }

    // does not parse replies butmain post is more important for now
    // todo: parse replies
    const comments = data[1]?.data?.children.map((child: any) => {
        const comment = child.data;

        // max length applies here
        const content = comment.body;
        const author = comment.author;
        const commentUrl = `https://www.reddit.com${comment.permalink}`;
        const postedDate = new Date(comment.created_utc * 1000);

        const stuff: ReadableWebpageContent = {
            content,
            title: `Comment author: ${author}`,
            lang: 'Unknown',
            publishedTime: postedDate.toISOString(),
            siteName: 'Reddit',
            url: commentUrl,
            scrapeDuration: `${(Date.now() - startTime) / 1000} seconds`,
        }

        return stuff
    })

    return [stuff, ...comments]



    // so presently
    // there are two listings
    // 0 is main post
    // so
    // content: 0 -> data -> children -> 0 -> selftext
    // title: 0 -> data -> children -> 0 -> title
    
    // 1 is comments which might be useful to send back
}


export async function scrapeWebPage(url: string, options: ScrapeOptions): Promise<ReadableWebpageContent | null> {
    const startTime = Date.now();
    const virtualConsole = new VirtualConsole();
    // to ignore css parsing errors
    virtualConsole.on('error', err => console.log('looool', err))

    const dom = await JSDOM.fromURL(url, { virtualConsole })
    logger.info({ message: `Scraping ${url}...`, dom })

    const reader = new Readability(dom.window.document)

    const html = reader.parse()
    if (!html) {
        logger.error(`No content from ${url} to parse`)
        return null
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    const {
        title,
        lang,
        textContent,
        siteName = '',
        publishedTime = '',
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
        publishedTime: publishedTime || 'Published Date not found',
        scrapeDuration: duration,
    }
}