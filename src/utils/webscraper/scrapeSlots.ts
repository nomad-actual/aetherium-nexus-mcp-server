import { getConfig } from '../config.ts'

// Bound on in-flight scrapes. A scrape can hold sockets open for the full
// per-scraper budget (SCRAPER_REQUEST_TIMEOUT), so this caps the connections
// a burst of tool calls (web-search, track-package) can force on the process.
// Configurable via SCRAPER_MAX_CONCURRENT (default 10).

let activeScrapes = 0
const scrapeWaiters: Array<() => void> = []

function acquireScrapeSlot(): Promise<void> {
    if (activeScrapes < getConfig().scraper.maxConcurrent) {
        activeScrapes++
        return Promise.resolve()
    }
    return new Promise<void>((resolve) => scrapeWaiters.push(resolve))
}

function releaseScrapeSlot(): void {
    const next = scrapeWaiters.shift()
    if (next) {
        // Hand the slot straight to the next waiter; the counter is unchanged.
        next()
        return
    }
    activeScrapes--
}

/**
 * Run `fn` while holding one of the scrape permits
 * (SCRAPER_MAX_CONCURRENT). Waiters are served FIFO. The permit is released
 * when `fn` settles, so a scrape abandoned by its budget no longer blocks the
 * queue — its sockets are bounded by the dispatcher timeouts instead.
 */
export async function withScrapeSlot<T>(fn: () => Promise<T>): Promise<T> {
    await acquireScrapeSlot()
    try {
        return await fn()
    } finally {
        releaseScrapeSlot()
    }
}
