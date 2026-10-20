import type { AetheriumConfig, McpToolContent, ReadableWebpageContent } from '../../types.ts'
import { type IScraper } from './IScraper.ts'
import { capitalizeFirstLetter } from '../formatter.ts'
import logger from '../logger.ts'
import { fetch as undiciFetch } from 'undici'
import { normalizeWhitespace } from './normalizeWhitespace.ts'
import { getApiDispatcher, wrapBodyWithSizeLimit } from './dispatcher.ts'
import { assertFetchableUrl } from './ssrf.ts'

type CrwScrapeResponse = {
    success: boolean
    data?: {
        markdown?: string | null
        metadata?: {
            title?: string
            description?: string
            sourceURL?: string
            language?: string
            publishedTime?: string
            statusCode?: number
            renderedWith?: string
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

        // Validate the URL server-side before sending it to CRW.  CRW performs
        // its own fetch from its network, so MCP-level SSRF pre-checks (which
        // protect BasicHtmlScraper's direct connections) do not apply here.
        // This prevents the CRW host from being used as an SSRF proxy to
        // private/reserved addresses or cloud metadata endpoints.
        assertFetchableUrl(url)

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
            // Socket timeouts so a stalled CRW host cannot hold a socket
            // forever. The endpoint is operator config (may be localhost),
            // so this uses the plain api dispatcher, not the SSRF-safe one.
            dispatcher: getApiDispatcher(),
        })

        if (!resp.ok) {
            // Read the error body (with size cap) for better debuggability (F10).
            const errSizeController = new AbortController()
            const errLimitedBody = wrapBodyWithSizeLimit(
                resp.body as ReadableStream<Uint8Array>,
                config.scraper.maxBytes,
                errSizeController,
            )
            const errChunks: Uint8Array[] = []
            const errReader = errLimitedBody.getReader()
            while (true) {
                const { done, value } = await errReader.read()
                if (done) break
                if (value) errChunks.push(value)
            }
            const errBody = errChunks.length > 0 ? JSON.parse(Buffer.concat(errChunks).toString()) : null
            const errMsg = errBody?.error || errBody?.error_code || `Status ${resp.status}`
            logger.error({ status: resp.status, error: errMsg }, `[CrwScraper] Request failed for ${url}`)
            return null
        }

        // Cap the response body to prevent OOM from a slow-drip response.
        // The CRW API returns JSON (small), but the endpoint is user-configured
        // and could be replaced by a malicious server.
        const sizeController = new AbortController()
        const limitedBody = wrapBodyWithSizeLimit(
            resp.body as ReadableStream<Uint8Array>,
            config.scraper.maxBytes,
            sizeController,
        )
        const chunks: Uint8Array[] = []
        const reader = limitedBody.getReader()
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) chunks.push(value)
        }
        const bodyBuffer = Buffer.concat(chunks)
        const json = JSON.parse(bodyBuffer.toString()) as CrwScrapeResponse

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

        let content = normalizeWhitespace(markdown)

        const maxContentLength = config.scraper.contentLimit
        if (content.length > maxContentLength) {
            logger.debug(
                `Truncating content to paragraph closest to ${maxContentLength} characters`
            )

            const nextPos = content.indexOf('\n\n', maxContentLength)
            const truncIdx = nextPos === -1 ? maxContentLength : nextPos

            content = content.substring(0, truncIdx)
        }

        const altSiteName = capitalizeFirstLetter(new URL(url).hostname)

        return [{
            url,
            title: metadata.title || '',
            lang: metadata.language || '',
            content,
            siteName: altSiteName,
            publishedTime: metadata.publishedTime || 'Published Date not found',
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
