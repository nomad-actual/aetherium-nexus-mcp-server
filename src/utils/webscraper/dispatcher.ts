import { Agent, type Dispatcher } from 'undici'
import { getConfig } from '../config.ts'
import { createSsrfSafeConnect } from './ssrf.ts'

/**
 * Wrap a ReadableStream body with a byte counter.  Throws `AbortError`
 * when the body exceeds `maxBytes`.  Returns a new ReadableStream that
 * mirrors the original but aborts on overflow.
 */
export function wrapBodyWithSizeLimit(
    body: ReadableStream<Uint8Array>,
    maxBytes: number,
    abortController: AbortController,
): ReadableStream<Uint8Array> {
    let received = 0
    let aborted = false

    return new ReadableStream<Uint8Array>({
        start(controller) {
            const reader = body.getReader()
            pump()

            async function pump() {
                try {
                    while (true) {
                        const { done, value } = await reader.read()
                        if (done) {
                            controller.close()
                            return
                        }
                        received += value.byteLength
                        if (received > maxBytes && !aborted) {
                            aborted = true
                            const err = new Error(
                                `Response body exceeds ${maxBytes} bytes`,
                            )
                            controller.error(err)
                            reader.cancel(err)
                            abortController.abort()
                            return
                        }
                        controller.enqueue(value)
                    }
                } catch (err) {
                    if (!aborted) controller.error(err)
                }
            }
        },
        cancel() {
            body.cancel()
        },
    })
}

let scrapeDispatcher: Agent | null = null
let apiDispatcher: Agent | null = null

/**
 * Create a dispatcher that only allows requests to the document URL.
 * All other requests (subresources: CSS, images, etc.) are short-circuited
 * with a 403 response. Readability only needs the HTML document.
 */
export function getScrapeDispatcher(documentUrl: string): Dispatcher {
    const base = getScrapeDispatcherBase()
    const docUrl = new URL(documentUrl)

    return {
        dispatch(opts: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler) {
            const reqUrl = new URL(opts.origin + (opts.path || ''))
            // Allow only the exact document URL (same origin + same path)
            if (
                reqUrl.origin === docUrl.origin &&
                reqUrl.pathname === docUrl.pathname &&
                reqUrl.search === docUrl.search
            ) {
                return base.dispatch(opts, handler)
            }
            // Short-circuit subresource requests with 403
            handler.onResponseStart?.({} as any, 403, {} as any, 'Forbidden')
            handler.onResponseEnd?.({} as any, {})
            return true
        },
        destroy(err: Error | null = null, cb?: () => void): void | Promise<void> {
            return base.destroy(err)
        },
        close(cb?: () => void): void | Promise<void> {
            return cb ? base.close(cb) : base.close()
        },
        connect() {
            throw new Error('Not implemented')
        },
        upgrade() {
            throw new Error('Not implemented')
        },
    } as unknown as Dispatcher
}

/**
 * Lazy singleton for the base scrape dispatcher (shared across requests).
 */
function getScrapeDispatcherBase(): Agent {
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
