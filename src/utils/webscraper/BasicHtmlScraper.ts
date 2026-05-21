import type { AetheriumConfig, McpToolContent, ReadableWebpageContent } from '../../types.ts'
import { type IScraper } from './IScraper.ts'
import { Readability } from '@mozilla/readability'
import { capitalizeFirstLetter } from '../formatter.ts'
import logger from '../logger.ts'
import { JSDOM, VirtualConsole } from 'jsdom'

// jsdom v29+ no longer exports NodeFilter directly; use the numeric constants
const SHOW_ELEMENT = 1
const FILTER_ACCEPT = 1
const FILTER_REJECT = 2
import { abort } from '../promises.ts'
import { fetch as undiciFetch } from 'undici'

const DEFAULT_TIMEOUT = 10_000

function buildJsdomResources(url: string, timeoutMs: number) {
    if (!/^https?:/i.test(url)) return undefined

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error(`JSDOM fetch timeout after ${timeoutMs}ms`)), timeoutMs)
    controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true })

    const fetchWithTimeout = (info: string | URL, init: Record<string, unknown> = {}) =>
        undiciFetch(info, { signal: controller.signal, ...init } as Parameters<typeof undiciFetch>[1])

    return {
        userAgent: 'Mozilla/5.0 (compatible; AetheriumScraper)',
        fetch: fetchWithTimeout,
    }
}

export default class BasicHtmlScraper implements IScraper {
    shouldAttempt(url: string): boolean {
        // Reject obviously non-HTML endpoints
        const lower = url.toLowerCase();
        if (lower.match(/\.(pdf|zip|exe|mp3|mp4|webp|svg|jpg|jpeg|png)$/)) return false;
        // Skip known SPAs / JS-heavy sites that JSDOM can't parse
        if (lower.match(/instagram\.com|tiktok\.com|twitter\.com|x\.com/)) return false;
        return true;
    }
    async scrape(url: string, config: AetheriumConfig, signal: AbortSignal): Promise<any | null> {
        const startTime = Date.now()

        logger.debug(`[BasicHtmlScraper] Starting JSDOM fetch for ${url}`)

        const virtualConsole = new VirtualConsole({ captureRejections: true })
        virtualConsole.on('error', (err) => logger.error({ message: 'JSDOM CSS error (non-fatal)', err }))
        virtualConsole.on('jsdomError', (err) => logger.error({ message: 'JSDOM parse error (non-fatal)', err }))

        const resources = buildJsdomResources(url, Math.min(config.scraper.timeout, DEFAULT_TIMEOUT))

        const dom = await abort(
            JSDOM.fromURL(url, { virtualConsole, resources }),
            signal,
            'JSDOM aborted',
        )

        const parseStart = Date.now()
        logger.debug(`[BasicHtmlScraper] HTML downloaded, trimming DOM before Readability`)

        trimInPlace(dom.window.document)
        logger.debug(`[BasicHtmlScraper] DOM trimmed, running Readability`)

        // Pass configurable thresholds to Readability:
        //   charThreshold: minimum character count needed for a result (from config.minReadableLength)
        //   Note: minScore was a config option defined in the project but no longer supported
        //   in Readability 0.6.0 — it is ignored silently at runtime.
        const reader = new Readability(dom.window.document, {
            charThreshold: config.scraper.basicHtmlReader.minReadableLength,
            debug: false,
            maxElemsToParse: 250_000,
        } as Record<string, unknown>)

        const html = reader.parse()
        if (!html) {
            logger.error(`No content from ${url} to parse`)
            return null
        }

        const parseDuration = ((Date.now() - parseStart) / 1000).toFixed(2)
        const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2)
        logger.debug(`[BasicHtmlScraper] Readability complete (${parseDuration}s) for ${url}`)

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

        const maxContentLength = config.scraper.contentLimit
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
            scrapeDuration: totalDuration,
        }]
    }

    async buildResult(contents: ReadableWebpageContent[]): Promise<McpToolContent[]> {
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
}

const UNNECESSARY_ELEMENTS = new Set([
    'script', 'style', 'noscript', 'iframe',
    'link', 'meta', 'svg',
    'form', 'button', 'input', 'select', 'textarea',
])

const UNNECESSARY_CLASSES = [
    /nav/i, /sidebar/i, /footer/i, /header.*menu/i,
    /cookie/i, /banner/i, /popup/i, /modal/i,
    /ad[rt]?/i, /advertisement/i, /companion/i,
    /share[-_ ]?button/i, /social[-_ ]?media/i,
    /comment[-_ ]?form/i, /related[-_ ]?articl/i,
    /breadcrumb/i, /sitema[i|p]/i,
    /top[-_ ]?bar/i,
    /bottom[-_ ]?bar/i, /toolbar/i, /menu/i,
]

const UNNECESSARY_IDS = [
    /sidebar/i, /footer/i, /header/i, /nav/i,
    /cookie/i, /banner/i, /popup/i, /modal/i,
    /ad[rt]?/i, /advertisement/i,
    /share[-_ ]?button/i, /social[-_ ]?media/i,
    /comment[-_ ]?form/i, /related[-_ ]?articl/i,
    /breadcrumb/i, /sitema[i|p]/i,
    /print/i, /top[-_ ]?bar/i,
    /bottom[-_ ]?bar/i, /toolbar/i, /menu/i,
    /newsletter/i, /subscribe/i, /signup/i,
]

function trimInPlace(doc: Document): void {
    const walker = doc.createTreeWalker(doc.body || doc.documentElement, SHOW_ELEMENT, {
        acceptNode(node) {
            const el = node as Element
            const tag = el.tagName.toLowerCase()

            if (UNNECESSARY_ELEMENTS.has(tag)) return FILTER_REJECT

            if (el.className) {
                for (const pattern of UNNECESSARY_CLASSES) {
                    if (pattern.test(el.className)) return FILTER_REJECT
                }
            }

            if (el.id) {
                for (const pattern of UNNECESSARY_IDS) {
                    if (pattern.test(el.id)) return FILTER_REJECT
                }
            }

            return FILTER_ACCEPT
        },
    })

    const toRemove: Element[] = []
    let node = walker.nextNode() as Element | null
    while (node) {
        toRemove.push(node)
        node = walker.nextNode() as Element | null
    }

    const initialNodeCount = doc.body?.querySelectorAll('*').length || 0
    for (const el of toRemove) {
        el.remove()
    }

    const finalNodeCount = doc.body?.querySelectorAll('*').length || 0

    if (toRemove.length > 0) {
        logger.debug(
            `[BasicHtmlScraper] Trimmed ${toRemove.length} elements (${initialNodeCount} → ${finalNodeCount} nodes)`
        )
    }
}
