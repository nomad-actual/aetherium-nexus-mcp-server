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
 * - allowH2: undici 8.x negotiates HTTP/2 by default (ALPN) and its h2
 *   keep-alive idle-timeout path can emit 'error' on a stream whose listeners
 *   were already removed, which crashes the process as an uncaught exception
 *   (see crashGuard.ts for the safety net). Scrapes gain nothing from h2
 *   multiplexing, so force HTTP/1.1 and stay out of that code path.
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
        allowH2: false,
        connectTimeout,
        headersTimeout: timeout,
        bodyTimeout: timeout,
    })

    return scrapeDispatcher
}

/**
 * Dispatcher for operator-configured API endpoints (the CRW client).
 * Timeouts only — no SSRF connector: the endpoint is trusted configuration
 * and may be localhost (self-hosted CRW). allowH2: false for the same reason
 * as the scrape dispatcher (see getScrapeDispatcher).
 */
export function getApiDispatcher(): Agent {
    if (apiDispatcher) return apiDispatcher

    const { timeout, connectTimeout } = getConfig().scraper
    apiDispatcher = new Agent({
        allowH2: false,
        connectTimeout,
        headersTimeout: timeout,
        bodyTimeout: timeout,
    })

    return apiDispatcher
}
