import { Agent } from 'undici'
import { getConfig } from '../config.ts'

// Budget for the TCP handshake. A host we cannot reach within this window is
// dead; the per-scraper budget (SCRAPER_REQUEST_TIMEOUT) bounds the rest of
// the request.
const CONNECT_TIMEOUT_MS = 5_000

let dispatcher: Agent | null = null

/**
 * Shared undici dispatcher for all scraper network traffic. JSDOM routes the
 * document and every subresource through it, and CrwScraper uses it for its
 * API calls, so its socket-level timeouts guarantee no request can hang
 * forever: when one fires, undici aborts the request and destroys the socket.
 *
 * headersTimeout and bodyTimeout track the per-scraper budget so a stalled
 * response fails on its own before the scrape is abandoned by abortTimeout.
 */
export function getScrapeDispatcher(): Agent {
    if (dispatcher) return dispatcher

    const { timeout } = getConfig().scraper
    dispatcher = new Agent({
        connectTimeout: CONNECT_TIMEOUT_MS,
        headersTimeout: timeout,
        bodyTimeout: timeout,
    })

    return dispatcher
}
