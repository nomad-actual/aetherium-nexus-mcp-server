import type { AetheriumConfig, McpToolContent, ReadableWebpageContent } from '../../types.ts'
import { type IScraper } from './IScraper.ts'
import { capitalizeFirstLetter } from '../formatter.ts'
import logger from '../logger.ts'
import { fetch as undiciFetch } from 'undici'

type CrwScrapeResponse = {
    success: boolean
    data?: {
        markdown?: string | null
        metadata?: {
            title?: string
            description?: string
            sourceURL?: string
            statusCode?: number
            elapsedMs?: number
        }
        warnings?: string[]
    }
    error?: string
    error_code?: string
}

export default class CrwScraper implements IScraper {
    shouldAttempt(url: string): boolean {
        const lower = url.toLowerCase()
        if (!lower.match(/^https?:\/\//)) return false
        if (lower.match(/\.(pdf|zip|exe|mp3|mp4|webp|svg|jpg|jpeg|png)$/)) return false
        return true
    }

    async scrape(url: string, config: AetheriumConfig, signal: AbortSignal): Promise<any | null> {
        const { host, apiKey, renderJs, onlyMainContent } = config.scraper.crw
        if (!host) return null

        const startTime = Date.now()
        const endpoint = `${host.replace(/\/+$/, '')}/v1/scrape`

        logger.debug(`[CrwScraper] Scrape request for ${url} via ${endpoint}`)

        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

        const body: Record<string, unknown> = {
            url,
            formats: ['markdown'],
            onlyMainContent,
            deadlineMs: config.scraper.timeout,
        }
        if (renderJs !== null) body.renderJs = renderJs

        const resp = await undiciFetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal,
        })

        if (!resp.ok) {
            logger.error(`[CrwScraper] Request failed for ${url}. Status code: ${resp.status}`)
            return null
        }

        const json = (await resp.json()) as CrwScrapeResponse

        if (!json.success || !json.data) {
            const code = json.error_code ? ` (${json.error_code})` : ''
            logger.error(`[CrwScraper] Scrape failed for ${url}: ${json.error || 'unknown error'}${code}`)
            return null
        }

        if (json.data.warnings?.length) {
            logger.warn(`[CrwScraper] Warnings from CRW for ${url}: ${json.data.warnings.join('; ')}`)
        }

        const markdown = (json.data.markdown || '').trim()
        if (!markdown) {
            logger.error(`No content from CRW for ${url}`)
            return null
        }

        const metadata = json.data.metadata || {}
        const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2)
        logger.debug(`[CrwScraper] CRW complete (${totalDuration}s) for ${url}`)

        let content = markdown.replace(/\n{3,}/g, '\n\n')

        const maxContentLength = config.scraper.contentLimit
        if (content.length > maxContentLength) {
            logger.debug(
                `Truncating content to paragraph closest to ${maxContentLength} characters`
            )

            const nextPos = content.indexOf('\n\n', maxContentLength)
            const truncIdx = nextPos === -1 ? maxContentLength : nextPos

            content = content.substring(0, truncIdx)
        }

        content = content.trim()

        const altSiteName = capitalizeFirstLetter(new URL(url).hostname)

        return [{
            url,
            title: metadata.title || '',
            lang: '',
            content,
            siteName: altSiteName,
            publishedTime: 'Published Date not found',
            scrapeDuration: totalDuration,
            meta: {
                description: metadata.description || '',
                sourceURL: metadata.sourceURL || url,
                statusCode: metadata.statusCode,
                elapsedMs: metadata.elapsedMs,
            },
        }]
    }

    async buildResult(contents: ReadableWebpageContent[]): Promise<McpToolContent[]> {
        const [page] = contents

        const meta = page.meta || {}
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
        } CRW Status: ${
            meta.statusCode ?? 'Unknown'
        }`

        return [
            { type: 'text', text: metadata },
            { type: 'text', text: page.content },
        ]
    }
}
