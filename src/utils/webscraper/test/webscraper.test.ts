import test from 'ava'
import { JSDOM } from 'jsdom'
import { doWebScrape } from '../webscraper.ts'
import { getConfig } from '../../config.ts'

// No text at all: Readability returns null (a charThreshold miss only
// triggers relaxed retries — any non-empty text survives them).
const EMPTY_PAGE = '<!DOCTYPE html><html><head><title>Empty</title></head><body><div></div></body></html>'

// Long enough for Readability's charThreshold (140 by default) to pass.
const CONTENT_PAGE = `<!DOCTYPE html>
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
    and final delivery. The package arrived in good condition according to
    the carrier's scan notes.</p>
  </article>
  <footer id="footer">Test site</footer>
</body>
</html>`

// The SSRF-safe dispatcher refuses loopback addresses a local test server
// would use, so the lifecycle is driven through a stubbed JSDOM.fromURL.
function fakeFromUrl(t: { teardown: (fn: () => void) => void }, page: string) {
    const originalFromURL: typeof JSDOM.fromURL = JSDOM.fromURL

    JSDOM.fromURL = (..._args: any[]) => new Promise<JSDOM>((resolve) => {
        setTimeout(() => resolve(new JSDOM(page)), 0)
    })

    t.teardown(() => {
        JSDOM.fromURL = originalFromURL
    })
}

// Serial: the tests stub JSDOM.fromURL, and a concurrent test's stub would
// win the race for the fetch.
test.serial('doWebScrape returns empty when the page has no readable content', async (t) => {
    fakeFromUrl(t, EMPTY_PAGE)

    const outcome = await doWebScrape('http://example.com/empty', getConfig(), new AbortController().signal)

    t.is(outcome.status, 'empty')
})

test.serial('doWebScrape returns content when readability finds an article', async (t) => {
    fakeFromUrl(t, CONTENT_PAGE)

    const outcome = await doWebScrape('http://example.com/article', getConfig(), new AbortController().signal)

    t.is(outcome.status, 'content')
    if (outcome.status !== 'content') return
    t.true(outcome.contents.length >= 1)
})
