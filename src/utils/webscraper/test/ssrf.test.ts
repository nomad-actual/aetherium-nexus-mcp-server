import test from 'ava'
import http from 'node:http'
import net from 'node:net'
import { promises as dnsPromises } from 'node:dns'
import { buildConnector } from 'undici'
import { getBlockedUrlReason, isBlockedIp, assertFetchableUrl, createSsrfSafeConnect } from '../ssrf.ts'
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

test('isBlockedIp fails closed on unparseable input', (t) => {
    t.true(isBlockedIp('not-an-ip'))
    t.true(isBlockedIp('300.1.2.3'))
    t.true(isBlockedIp(':::'))
})

// A base connector that records its calls instead of opening sockets, so
// tests can assert what the safe connector pins without any network.
type ConnectOptions = Parameters<ReturnType<typeof buildConnector>>[0]

function fakeBase(): { calls: ConnectOptions[]; connect: ReturnType<typeof buildConnector> } {
    const calls: ConnectOptions[] = []
    const connect: ReturnType<typeof buildConnector> = (opts, cb) => {
        calls.push(opts)
        cb(null, new net.Socket())
    }
    return { calls, connect }
}

function attemptConnect(
    connect: ReturnType<typeof buildConnector>,
    hostname: string,
    protocol = 'http:',
    servername?: string,
): Promise<{ error: Error | null; socket: unknown }> {
    return new Promise((resolve) => {
        connect(
            { hostname, host: hostname, port: '80', protocol, servername },
            (err, socket) =>
                resolve({
                    error: err instanceof Error ? err : err ? new Error(String(err)) : null,
                    socket,
                }),
        )
    })
}

test('connect refuses a loopback IP literal before any TCP', async (t) => {
    const { calls, connect } = fakeBase()
    const { error, socket } = await attemptConnect(createSsrfSafeConnect(1_000, connect), '127.0.0.1')

    if (error === null) {
        t.fail('the loopback literal should be refused')
        return
    }
    t.regex(error.message, /Refusing to connect to 127\.0\.0\.1/)
    t.regex(error.message, /private or reserved/)
    t.is(socket, null)
    t.is(calls.length, 0, 'the base connector was never reached')
})

test('connect refuses a hostname that resolves only to private addresses', async (t) => {
    mockLookup(t, [
        { address: '127.0.0.1', family: 4 },
        { address: '::1', family: 6 },
    ])
    const { calls, connect } = fakeBase()
    const { error } = await attemptConnect(createSsrfSafeConnect(1_000, connect), 'rebinding.example.com')

    if (error === null) {
        t.fail('a hostname resolving only to private addresses should be refused')
        return
    }
    t.regex(error.message, /Refusing to connect to rebinding\.example\.com/)
    t.regex(error.message, /private or reserved/)
    t.is(calls.length, 0, 'the base connector was never reached')
})

test('connect pins the first valid resolved address', async (t) => {
    mockLookup(t, [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.1', family: 4 },
    ])
    const { calls, connect } = fakeBase()
    const { error } = await attemptConnect(createSsrfSafeConnect(1_000, connect), 'mixed.example.com')

    t.is(error, null)
    t.is(calls.length, 1)
    t.is(calls[0].hostname, '93.184.216.34')
})

test('connect pins a public IP literal and preserves the TLS servername', async (t) => {
    const { calls, connect } = fakeBase()
    const { error, socket } = await attemptConnect(
        createSsrfSafeConnect(1_000, connect),
        '93.184.216.34',
        'https:',
        'example.com',
    )

    t.is(error, null)
    t.truthy(socket)
    t.is(calls.length, 1)
    t.is(calls[0].hostname, '93.184.216.34')
    t.is(calls[0].servername, 'example.com')
})

test('connect surfaces DNS failures', async (t) => {
    mockLookup(t, new Error('getaddrinfo ENOTFOUND nope.example'))
    const { calls, connect } = fakeBase()
    const { error } = await attemptConnect(createSsrfSafeConnect(1_000, connect), 'nope.example')

    if (error === null) {
        t.fail('the DNS failure should surface as an error')
        return
    }
    t.regex(error.message, /ENOTFOUND/)
    t.is(calls.length, 0)
})

test('connect times out a stalled DNS lookup', async (t) => {
    mockLookup(t, new Promise<never>(() => undefined))
    const { calls, connect } = fakeBase()

    const started = Date.now()
    const { error } = await attemptConnect(createSsrfSafeConnect(200, connect), 'stalled.example')
    const elapsed = Date.now() - started

    if (error === null) {
        t.fail('the stalled lookup should time out')
        return
    }
    t.regex(error.message, /timed out/)
    t.true(elapsed < 1_000)
    t.is(calls.length, 0)
})
