// Low per-scraper budget so the dispatcher socket timeouts (which track
// SCRAPER_REQUEST_TIMEOUT) fire within a few seconds. Must be set before the
// first getConfig() call in this worker.
process.env.SCRAPER_REQUEST_TIMEOUT = '1000'

import test from 'ava'
import { JSDOM } from 'jsdom'
import BasicHtmlScraper from '../BasicHtmlScraper.ts'
import { getConfig } from '../../config.ts'

// Long enough for Readability's charThreshold (140 by default) to pass.
const PAGE = `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <nav class="navbar"><a href="/">Home</a></nav>
  <article>
    <h1>Package delivered</h1>
    <p>The tracked package has been delivered to the front porch. The carrier
    scanned the delivery at the local depot and confirmed the recipient
    signature. No further action is required for this shipment.</p>
    <p>Tracking history shows pickup at the origin facility, two transit scans,
    and final delivery. The package arrived in good condition according to the
    carrier's scan notes.</p>
  </article>
  <footer id="footer">Test site</footer>
</body>
</html>`

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// Replaces JSDOM.fromURL with a fake that resolves a real JSDOM after a
// delay, and tracks window creation/close (jsdom does not implement
// window.closed). No network is involved: the SSRF-safe dispatcher refuses
// the loopback addresses a local test server would use, so lifecycle tests
// drive the promise directly.
function fakeFromUrl(t: { teardown: (fn: () => void) => void }, page: string, delayMs: number) {
    const windows: JSDOM[] = []
    const closed: JSDOM[] = []
    const originalFromURL: typeof JSDOM.fromURL = JSDOM.fromURL

    JSDOM.fromURL = (..._args: any[]) =>
        new Promise<JSDOM>((resolve) => {
            setTimeout(() => {
                const dom = new JSDOM(page)
                windows.push(dom)
                const originalClose = dom.window.close.bind(dom.window)
                dom.window.close = () => {
                    closed.push(dom)
                    originalClose()
                }
                resolve(dom)
            }, delayMs)
        })

    t.teardown(() => {
        JSDOM.fromURL = originalFromURL
    })

    return { windows, closed }
}

// The fake fromURL patches a global, so these tests must not run
// concurrently with each other.

test.serial('scrape closes the JSDOM window after extracting content', async (t) => {
    const { windows, closed } = fakeFromUrl(t, PAGE, 10)

    const result = await new BasicHtmlScraper().scrape(
        'http://test.example/page',
        getConfig(),
        new AbortController().signal,
    )

    t.truthy(result, 'content was extracted')
    t.is(windows.length, 1)
    t.is(closed.length, 1, 'the JSDOM window was closed')
    t.is(closed[0], windows[0])
})

test.serial('scrape closes the JSDOM window when the signal aborts mid-fetch', async (t) => {
    // Delay the resolution so the abort fires while the fetch is in flight.
    const { windows, closed } = fakeFromUrl(t, PAGE, 400)

    const controller = new AbortController()
    setTimeout(() => controller.abort(new Error('client cancelled')), 100)

    const error = await new BasicHtmlScraper()
        .scrape('http://test.example/page', getConfig(), controller.signal)
        .then(
            () => null,
            (e: unknown) => e,
        )

    t.is(error instanceof Error ? error.message : String(error), 'JSDOM aborted')

    // The delayed resolution still arrives after the abort; the late window
    // must be closed once it settles.
    const deadline = Date.now() + 3_000
    while (Date.now() < deadline && windows.length === 0) {
        await sleep(50)
    }
    t.is(windows.length, 1, 'the in-flight JSDOM instance settled')
    t.is(closed.length, 1, 'the late JSDOM window was closed')
    t.is(closed[0], windows[0])
})

test.serial('scrape refuses loopback URLs at connect', async (t) => {
    // No server needed: the SSRF-safe connector refuses before any TCP
    // connection, so a dead port is fine (just not a port jsdom itself
    // restricts, like 9). This also proves jsdom document fetches route
    // through the safe connector (redirects and subresources share it).
    const error = await new BasicHtmlScraper()
        .scrape('http://127.0.0.1:41234/', getConfig(), new AbortController().signal)
        .then(
            () => null,
            (e: unknown) => e,
        )

    if (!(error instanceof Error)) {
        t.fail(`expected an Error, got: ${String(error)}`)
        return
    }
    t.regex(error.message, /private or reserved/)
})
