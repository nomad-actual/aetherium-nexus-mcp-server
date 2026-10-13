import { Agent } from 'undici'
import { getConfig } from '../config.ts'
import { createSsrfSafeConnect } from './ssrf.ts'

let scrapeDispatcher: Agent | null = null
let apiDispatcher: Agent | null = null

/**
 * Dispatcher for scraping untrusted URLs. JSDOM routes the document, its
 * redirects, and every subresource through it, so its protections cover all
 * of them:
 *
 * - socket-level timeouts (connectTimeout, headersTimeout, bodyTimeout)
 *   guarantee no request can hang forever: when one fires, undici aborts the
 *   request and destroys the socket. headersTimeout/bodyTimeout track the
 *   per-scraper budget so a stalled response fails on its own before the
 *   scrape is abandoned by abortTimeout.
 * - the SSRF-safe connector re-resolves DNS at connect time, refuses private
 *   and reserved addresses, and pins the first valid one — a redirect or
 *   subresource cannot reach an internal address, and DNS rebinding is
 *   impossible.
 */
export function getScrapeDispatcher(): Agent {
    if (scrapeDispatcher) return scrapeDispatcher

    const { timeout, connectTimeout } = getConfig().scraper
    scrapeDispatcher = new Agent({
        connect: createSsrfSafeConnect(connectTimeout),
        connectTimeout,
        headersTimeout: timeout,
        bodyTimeout: timeout,
    })

    return scrapeDispatcher
}

/**
 * Dispatcher for operator-configured API endpoints (the CRW client).
 * Timeouts only — no SSRF connector: the endpoint is trusted configuration
 * and may be localhost (self-hosted CRW).
 */
export function getApiDispatcher(): Agent {
    if (apiDispatcher) return apiDispatcher

    const { timeout, connectTimeout } = getConfig().scraper
    apiDispatcher = new Agent({
        connectTimeout,
        headersTimeout: timeout,
        bodyTimeout: timeout,
    })

    return apiDispatcher
}
