import test from 'ava'
import http from 'node:http'
import { promises as dnsPromises } from 'node:dns'
import { getBlockedUrlReason, isBlockedIp, assertFetchableUrl } from '../ssrf.ts'
import { doWebScrape } from '../webscraper.ts'
import { getConfig } from '../../config.ts'

test('isBlockedIp rejects loopback, RFC1918, link-local, CGNAT, and reserved IPv4', (t) => {
    t.true(isBlockedIp('127.0.0.1'))
    t.true(isBlockedIp('127.8.9.10'))
    t.true(isBlockedIp('10.1.2.3'))
    t.true(isBlockedIp('172.16.0.1'))
    t.true(isBlockedIp('172.31.255.255'))
    t.true(isBlockedIp('192.168.0.1'))
    t.true(isBlockedIp('169.254.169.254'))
    t.true(isBlockedIp('100.64.0.1'))
    t.true(isBlockedIp('100.127.255.255'))
    t.true(isBlockedIp('0.0.0.0'))
    t.true(isBlockedIp('224.0.0.1'))
    t.true(isBlockedIp('255.255.255.255'))
})

test('isBlockedIp allows public IPv4', (t) => {
    t.false(isBlockedIp('8.8.8.8'))
    t.false(isBlockedIp('93.184.216.34'))
    t.false(isBlockedIp('172.15.0.1'))
    t.false(isBlockedIp('172.32.0.1'))
    t.false(isBlockedIp('100.63.255.255'))
    t.false(isBlockedIp('100.128.0.1'))
})

test('isBlockedIp rejects loopback, link-local, ULA, multicast, and IPv4-mapped IPv6', (t) => {
    t.true(isBlockedIp('::1'))
    t.true(isBlockedIp('::'))
    t.true(isBlockedIp('fe80::1'))
    t.true(isBlockedIp('fc00::1'))
    t.true(isBlockedIp('fd12:3456::1'))
    t.true(isBlockedIp('ff02::1'))
    t.true(isBlockedIp('::ffff:127.0.0.1'))
    t.true(isBlockedIp('::ffff:192.168.1.1'))
    t.true(isBlockedIp('::ffff:169.254.169.254'))
})

test('isBlockedIp allows public IPv6', (t) => {
    t.false(isBlockedIp('2001:4860:4860::8888'))
    t.false(isBlockedIp('2606:4700:4700::1111'))
    t.false(isBlockedIp('::ffff:8.8.8.8'))
})

test('getBlockedUrlReason rejects private and non-http(s) URLs', (t) => {
    t.truthy(getBlockedUrlReason('http://127.0.0.1/'))
    t.truthy(getBlockedUrlReason('http://127.0.0.1:8080/admin'))
    t.truthy(getBlockedUrlReason('http://169.254.169.254/latest/meta-data/'))
    t.truthy(getBlockedUrlReason('http://192.168.1.1/'))
    t.truthy(getBlockedUrlReason('http://[::1]/'))
    t.truthy(getBlockedUrlReason('http://[::ffff:10.0.0.1]/'))
    t.truthy(getBlockedUrlReason('http://[fe80::1]/'))
    t.truthy(getBlockedUrlReason('http://localhost/'))
    t.truthy(getBlockedUrlReason('http://internal.LOcalhost./'))
    t.truthy(getBlockedUrlReason('file:///etc/passwd'))
    t.truthy(getBlockedUrlReason('gopher://127.0.0.1:25/'))
    t.truthy(getBlockedUrlReason('not a url'))
})

test('getBlockedUrlReason allows public http(s) URLs', (t) => {
    t.is(getBlockedUrlReason('http://example.com/page'), null)
    t.is(getBlockedUrlReason('https://example.com:8443/page?q=1'), null)
    t.is(getBlockedUrlReason('http://8.8.8.8/'), null)
    t.is(getBlockedUrlReason('https://[2001:4860:4860::8888]/'), null)
})

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

test('assertFetchableUrl rejects blocked URLs', async (t) => {
    await t.throwsAsync(() => assertFetchableUrl('http://127.0.0.1/'), {
        message: /Refusing to fetch.*private or reserved address 127\.0\.0\.1/,
    })
    await t.throwsAsync(() => assertFetchableUrl('http://localhost/'), {
        message: /Refusing to fetch.*localhost/,
    })
    await t.throwsAsync(() => assertFetchableUrl('file:///etc/passwd'), {
        message: /Refusing to fetch.*disallowed scheme/,
    })
})

test('assertFetchableUrl blocks hostnames that resolve to private addresses', async (t) => {
    mockLookup(t, [{ address: '127.0.0.1', family: 4 }])
    await t.throwsAsync(() => assertFetchableUrl('http://rebinding.example.com/'), {
        message: /rebinding\.example\.com resolves to private or reserved address 127\.0\.0\.1/,
    })
})

test('assertFetchableUrl blocks when any resolved address is private', async (t) => {
    mockLookup(t, [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.1', family: 4 },
    ])
    await t.throwsAsync(() => assertFetchableUrl('http://mixed.example.com/'), {
        message: /resolves to private or reserved address 10\.0\.0\.1/,
    })
})

test('assertFetchableUrl passes hostnames that resolve to public addresses', async (t) => {
    mockLookup(t, [{ address: '93.184.216.34', family: 4 }])
    await assertFetchableUrl('http://example.com/')
    t.pass()
})

test('assertFetchableUrl lets DNS failures surface as fetch errors', async (t) => {
    mockLookup(t, new Error('getaddrinfo ENOTFOUND nope.example'))
    await assertFetchableUrl('http://nope.example/')
    t.pass()
})

function startServer(handler: http.RequestListener): Promise<{ url: string; close: () => Promise<void>; hits: () => number }> {
    let hits = 0
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            hits++
            handler(req, res)
        })
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            const port = address && typeof address === 'object' ? address.port : 0
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () => new Promise<void>((r) => server.close(() => r())),
                hits: () => hits,
            })
        })
    })
}

test('doWebScrape refuses loopback URLs before any network request', async (t) => {
    const server = await startServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><body>internal page</body></html>')
    })
    t.teardown(() => server.close())

    const error = await doWebScrape(server.url, getConfig(), new AbortController().signal)
        .then(
            () => null,
            (e: unknown) => e,
        )

    t.true(error instanceof Error)
    t.regex((error as Error).message, /Refusing to fetch/)
    t.is(server.hits(), 0, 'no request reached the loopback server')
})

test('doWebScrape refuses hostnames that resolve to private addresses', async (t) => {
    mockLookup(t, [{ address: '192.168.0.10', family: 4 }])

    const error = await doWebScrape('http://intranet.example/', getConfig(), new AbortController().signal)
        .then(
            () => null,
            (e: unknown) => e,
        )

    t.true(error instanceof Error)
    t.regex((error as Error).message, /intranet\.example resolves to private or reserved address 192\.168\.0\.10/)
})
