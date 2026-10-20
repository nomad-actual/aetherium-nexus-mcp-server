import type { AetheriumConfig, McpToolContent, ReadableWebpageContent } from '../../types.ts'
import { type IScraper } from './IScraper.ts'
import { capitalizeFirstLetter } from '../formatter.ts'
import logger from '../logger.ts'
import { fetch as undiciFetch } from 'undici'
import { normalizeWhitespace } from './normalizeWhitespace.ts'
import { getApiDispatcher, wrapBodyWithSizeLimit } from './dispatcher.ts'
import { assertFetchableUrl, stripUrlUserinfo } from './ssrf.ts'

/**
 * Best-effort read of at most `limit` bytes of a response body, for logging.
 * Never throws: an error body must not break the scrape, and a slow-drip body
 * is bounded by the api dispatcher's bodyTimeout.
 */
async function readErrorBodySnippet(
    body: ReadableStream<Uint8Array>,
    limit: number,
): Promise<string> {
    const chunks: Uint8Array[] = []
    let received = 0
    try {
        const reader = body.getReader()
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
            received += value.byteLength
            if (received >= limit) {
                await reader.cancel()
                break
            }
        }
    } catch {
        // Keep whatever was read so far.
    }
    return Buffer.concat(chunks).toString('utf8').slice(0, limit)
}

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

        // Strip credentials from the URL before logging (F5).
        const safeUrl = stripUrlUserinfo(url)

        const startTime = Date.now()
        const endpoint = `${host.replace(/\/+$/, '')}/v1/scrape`

        logger.debug(`[CrwScraper] Scrape request for ${safeUrl} via ${endpoint}`)

        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

        const body: Record<string, unknown> = {
            url: safeUrl,
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
            // Error bodies exist only for logging: cap at a few KB (never
            // config.scraper.maxBytes) and never let parsing break the scrape.
            const snippet = await readErrorBodySnippet(resp.body as ReadableStream<Uint8Array>, 8192)
            let errMsg = `Status ${resp.status}`
            try {
                const parsed: unknown = JSON.parse(snippet)
                if (parsed !== null && typeof parsed === 'object') {
                    const obj = parsed as Record<string, unknown>
                    errMsg =
                        (typeof obj.error === 'string' && obj.error !== '' ? obj.error : undefined) ??
                        (typeof obj.error_code === 'string' && obj.error_code !== '' ? obj.error_code : undefined) ??
                        errMsg
                }
            } catch {
                // Not JSON (HTML proxy page, plain text): log a trimmed snippet.
                const raw = snippet.trim()
                if (raw !== '') errMsg = `Status ${resp.status}: ${raw.slice(0, 200)}`
            }
            logger.error({ status: resp.status, error: errMsg }, `[CrwScraper] Request failed for ${safeUrl}`)
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
            logger.error(`[CrwScraper] Scrape failed for ${safeUrl}: ${json.error || 'unknown error'}${code}`)
            return null
        }

        if (json.data.warnings?.length) {
            logger.warn(`[CrwScraper] Warnings from CRW for ${safeUrl}: ${json.data.warnings.join('; ')}`)
        }

        const markdown = (json.data.markdown || '').trim()
        if (!markdown) {
            logger.error(`No content from CRW for ${safeUrl}`)
            return null
        }

        const metadata = json.data.metadata || {}
        const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2)
        logger.debug(`[CrwScraper] CRW complete (${totalDuration}s) for ${safeUrl}`)

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

        const altSiteName = capitalizeFirstLetter(new URL(safeUrl).hostname)

        return [{
            url: safeUrl,
            title: metadata.title || '',
            lang: metadata.language || '',
            content,
            siteName: altSiteName,
            publishedTime: metadata.publishedTime || 'Published Date not found',
            scrapeDuration: totalDuration,
            meta: {
                description: metadata.description || '',
                sourceURL: metadata.sourceURL || safeUrl,
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
