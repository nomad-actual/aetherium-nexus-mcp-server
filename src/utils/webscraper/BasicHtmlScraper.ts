import { McpToolContent, ReadableWebpageContent, ScrapeOptions } from '../../types.js'
import { IScraper } from './IScraper.js'
import { Readability } from '@mozilla/readability'
import { capitalizeFirstLetter } from '../formatter.js'
import logger from '../logger.js'
import { JSDOM, VirtualConsole } from 'jsdom'


export default class BasicHtmlScraper implements IScraper {
    async scrape(url: string, scrapeOpts: ScrapeOptions): Promise<any | null> {
        const startTime = Date.now()
        const virtualConsole = new VirtualConsole()
        // to ignore css parsing errors
        virtualConsole.on('error', (err) => console.log('looool', err))

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

        const maxContentLength = scrapeOpts.maxContentLength

        if (processedTextContent.length > maxContentLength) {
            logger.debug(
                `Truncating content to sentence closest to ${maxContentLength} characters`
            )

            // find the end of the sentence closest to maxContentLength characters
            const nextPos = processedTextContent.indexOf('.', maxContentLength)
            const truncIdx = nextPos === -1 ? maxContentLength : nextPos + 1

            processedTextContent = processedTextContent.substring(0, truncIdx)
        }

        const altSiteName = capitalizeFirstLetter(new URL(url).hostname)

        return [{
            url,
            title: title || '',
            lang: lang || '',
            content: processedTextContent,
            siteName: siteName || altSiteName,
            publishedTime: publishedTime || 'Published Date not found',
            scrapeDuration: duration,
        }]
    }

    async buildResult(contents: ReadableWebpageContent[], scrapeOpts: ScrapeOptions): Promise<McpToolContent[]> {
        const [page] = contents

        const metadata = 
        `Content for: ${
            page.url
        } Language: ${
            page.lang || '(Not found)'
        } Date Published: ${
            page.publishedTime
        } Site Name: ${
            page.siteName
        } Title: ${
            page.title
        } Scrape Duration (sec): ${
            page.scrapeDuration || 'Unknown'
        }`

        return [
            { type: 'text', text: metadata },
            { type: 'text', text: page.content },
        ]
    }

    // just everything is ok
    shouldAttempt(url: string): boolean {
        return !!url
    }
}
