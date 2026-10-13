import { Agent } from 'undici'
import { getConfig } from '../config.ts'

let dispatcher: Agent | null = null

/**
 * Shared undici dispatcher for all scraper network traffic. JSDOM routes the
 * document and every subresource through it, and CrwScraper uses it for its
 * API calls, so its socket-level timeouts guarantee no request can hang
 * forever: when one fires, undici aborts the request and destroys the socket.
 *
 * connectTimeout (SCRAPER_CONNECT_TIMEOUT, default 2000 ms) bounds the TCP
 * handshake. headersTimeout and bodyTimeout track the per-scraper budget so a
 * stalled response fails on its own before the scrape is abandoned by
 * abortTimeout.
 */
export function getScrapeDispatcher(): Agent {
    if (dispatcher) return dispatcher

    const { timeout, connectTimeout } = getConfig().scraper
    dispatcher = new Agent({
        connectTimeout,
        headersTimeout: timeout,
        bodyTimeout: timeout,
    })

    return dispatcher
}
