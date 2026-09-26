import test from 'ava'
import http from 'node:http'
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

function startServer(handler: http.RequestListener): Promise<{ url: string; close: () => Promise<void> }> {
    return new Promise((resolve) => {
        const server = http.createServer(handler)
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            const port = address && typeof address === 'object' ? address.port : 0
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () => new Promise<void>((r) => server.close(() => r())),
            })
        })
    })
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// Patches JSDOM.fromURL to record every created window and wrap window.close
// (jsdom does not implement window.closed) so tests can observe when a window
// is closed.
function trackWindows(t: { teardown: (fn: () => void) => void }) {
    const windows: JSDOM[] = []
    const closed: JSDOM[] = []
    const originalFromURL: (...args: any[]) => Promise<JSDOM> = JSDOM.fromURL

    JSDOM.fromURL = (...args: any[]) =>
        originalFromURL(...args).then((dom) => {
            windows.push(dom)
            const originalClose = dom.window.close.bind(dom.window)
            dom.window.close = () => {
                closed.push(dom)
                originalClose()
            }
            return dom
        })

    t.teardown(() => {
        JSDOM.fromURL = originalFromURL
    })

    return { windows, closed }
}

test('scrape closes the JSDOM window after extracting content', async (t) => {
    const { windows, closed } = trackWindows(t)

    const server = await startServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(PAGE)
    })
    t.teardown(() => server.close())

    const result = await new BasicHtmlScraper().scrape(
        server.url,
        getConfig(),
        new AbortController().signal,
    )

    t.truthy(result, 'content was extracted')
    t.is(windows.length, 1)
    t.is(closed.length, 1, 'the JSDOM window was closed')
    t.is(closed[0], windows[0])
})

test('scrape closes the JSDOM window when the signal aborts mid-fetch', async (t) => {
    const { windows, closed } = trackWindows(t)

    // Delay the response so the abort fires while JSDOM is still fetching.
    const server = await startServer((req, res) => {
        setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(PAGE)
        }, 400)
    })
    t.teardown(() => server.close())

    const controller = new AbortController()
    setTimeout(() => controller.abort(new Error('client cancelled')), 100)

    const error = await new BasicHtmlScraper()
        .scrape(server.url, getConfig(), controller.signal)
        .then(
            () => null,
            (e: unknown) => e,
        )

    t.is(error instanceof Error ? error.message : String(error), 'JSDOM aborted')

    // The delayed response still arrives after the abort; the late window must
    // be closed once JSDOM settles.
    const deadline = Date.now() + 3_000
    while (Date.now() < deadline && windows.length === 0) {
        await sleep(50)
    }
    t.is(windows.length, 1, 'the in-flight JSDOM instance settled')
    t.is(closed.length, 1, 'the late JSDOM window was closed')
    t.is(closed[0], windows[0])
})
