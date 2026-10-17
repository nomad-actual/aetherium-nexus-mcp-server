import test from 'ava'
import { promises as dnsPromises } from 'node:dns'
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

test('scrape-website explains the outcome when no content is found', async (t) => {
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
})
