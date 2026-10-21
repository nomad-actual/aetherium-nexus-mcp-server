import test from 'ava'
import { promises as dnsPromises } from 'node:dns'
import { JSDOM } from 'jsdom'
import { buildWebScraperTool } from '../website-scraper.ts'

type Teardown = { teardown: (fn: () => void) => void }

function mockLookup(t: Teardown, result: unknown) {
    const original = dnsPromises.lookup
    const lookup = result instanceof Error
        ? (async () => { throw result }) as typeof dnsPromises.lookup
        : (async () => result) as typeof dnsPromises.lookup
    ;(dnsPromises as Record<string, unknown>).lookup = lookup
    t.teardown(() => {
        ;(dnsPromises as Record<string, unknown>).lookup = original
    })
}

// Serial: the empty-page test below stubs JSDOM.fromURL, and a concurrent
// real fetch would pick up that stub.
test.serial('scrape-website explains the outcome when no content is found', async (t) => {
    // The hostname resolves to loopback, so the connect-time SSRF check
    // refuses it and every scraper fails. The tool must still tell the
    // caller what happened instead of returning an empty content array.
    mockLookup(t, [{ address: '127.0.0.1', family: 4 }])

    const tool = buildWebScraperTool()
    const result = await tool.handler(
        { url: 'http://intranet.example/' },
        new AbortController().signal,
    )

    const [item] = result.content ?? []
    t.is(item?.type, 'text', `expected a text item, got ${JSON.stringify(result.content)}`)
    if (item?.type !== 'text') return
    t.regex(item.text, /intranet\.example/)
    t.regex(item.text, /Refusing to connect/, 'the refusal reason, not a generic empty result')
})

test.serial('scrape-website reports a page with no readable content', async (t) => {
    // A page with no text: the scrapers run and find nothing (Readability
    // returns null). The SSRF-safe dispatcher refuses loopback, so drive
    // JSDOM.fromURL with a stub.
    const originalFromURL: typeof JSDOM.fromURL = JSDOM.fromURL
    JSDOM.fromURL = (..._args: any[]) =>
        new Promise<JSDOM>((resolve) => {
            setTimeout(() => resolve(new JSDOM('<html><body><div></div></body></html>')), 0)
        })
    t.teardown(() => {
        JSDOM.fromURL = originalFromURL
    })

    const tool = buildWebScraperTool()
    const result = await tool.handler(
        { url: 'http://example.com/empty' },
        new AbortController().signal,
    )

    const [item] = result.content ?? []
    t.is(item?.type, 'text', `expected a text item, got ${JSON.stringify(result.content)}`)
    if (item?.type !== 'text') return
    t.regex(item.text, /No readable content found at http:\/\/example\.com\/empty/)
})

test.serial('scrape-website keeps URL credentials out of the blocked-outcome message', async (t) => {
    // F5: userinfo (username:password@) must not reach tool output. An IP
    // literal makes the SSRF pre-check refuse before any fetch, and that
    // refusal message — returned verbatim to the caller — carries the URL.
    const tool = buildWebScraperTool()
    const result = await tool.handler(
        { url: 'http://fuzzuser:Sup3rS3cret!@127.0.0.1/' },
        new AbortController().signal,
    )

    const [item] = result.content ?? []
    t.is(item?.type, 'text', `expected a text item, got ${JSON.stringify(result.content)}`)
    if (item?.type !== 'text') return
    t.false(item.text.includes('fuzzuser'), 'username must not appear in the refusal message')
    t.false(item.text.includes('Sup3rS3cret!'), 'password must not appear in the refusal message')
    t.regex(item.text, /127\.0\.0\.1/, 'the refusal still names the address')
})

test.serial('scrape-website keeps URL credentials out of the empty-outcome message', async (t) => {
    // F5: the "No readable content found at <url>" text is built before
    // doWebScrape's stripping, so it needs its own. Drive JSDOM.fromURL with
    // a stub (the SSRF-safe dispatcher refuses loopback; this host is public).
    const originalFromURL: typeof JSDOM.fromURL = JSDOM.fromURL
    JSDOM.fromURL = (..._args: any[]) =>
        new Promise<JSDOM>((resolve) => {
            setTimeout(() => resolve(new JSDOM('<html><body><div></div></body></html>')), 0)
        })
    t.teardown(() => {
        JSDOM.fromURL = originalFromURL
    })

    const tool = buildWebScraperTool()
    const result = await tool.handler(
        { url: 'http://fuzzuser:Sup3rS3cret!@example.com/page' },
        new AbortController().signal,
    )

    const [item] = result.content ?? []
    t.is(item?.type, 'text', `expected a text item, got ${JSON.stringify(result.content)}`)
    if (item?.type !== 'text') return
    t.false(item.text.includes('fuzzuser'), 'username must not appear in the empty message')
    t.false(item.text.includes('Sup3rS3cret!'), 'password must not appear in the empty message')
    t.regex(item.text, /example\.com\/page/, 'the sanitized URL stays in the message')
})
