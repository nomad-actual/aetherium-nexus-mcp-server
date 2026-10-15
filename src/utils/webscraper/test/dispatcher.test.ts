// Low per-scraper budget so the dispatcher's headers/body timeouts (which
// track SCRAPER_REQUEST_TIMEOUT) fire within a few seconds. Must be set
// before the first getConfig() call in this worker.
process.env.SCRAPER_REQUEST_TIMEOUT = '1000'
process.env.SCRAPER_CONNECT_TIMEOUT = '500'

import test from 'ava'
import http from 'node:http'
import http2 from 'node:http2'
import tls from 'node:tls'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fetch } from 'undici'
import { getConfig } from '../../config.ts'
import { getApiDispatcher, getScrapeDispatcher } from '../dispatcher.ts'

type Blackhole = {
    url: string
    close: () => Promise<void>
    sockets: Array<{ closed: Promise<void> }>
}

// A server that accepts TCP connections and never sends anything.
function startBlackhole(): Promise<Blackhole> {
    return new Promise((resolve) => {
        const sockets: Array<{ closed: Promise<void> }> = []
        const server = http.createServer(() => {
            // Never respond; hold the socket open.
        })
        server.on('connection', (socket) => {
            sockets.push({ closed: new Promise<void>((r) => socket.on('close', () => r())) })
        })
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            const port = address && typeof address === 'object' ? address.port : 0
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () => new Promise<void>((r) => server.close(() => r())),
                sockets,
            })
        })
    })
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

test('api dispatcher times out a stalled response and destroys the socket', async (t) => {
    // The api dispatcher (timeouts only, no SSRF connector) is the one that
    // may talk to loopback, so the blackhole test lives here.
    const hole = await startBlackhole()
    t.teardown(() => hole.close())

    const started = Date.now()
    const error = await fetch(`${hole.url}/`, { dispatcher: getApiDispatcher() }).then(
        () => null,
        (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
    )
    const elapsed = Date.now() - started

    if (error === null) {
        t.fail('the request should have failed')
        return
    }
    // fetch() wraps the undici error: the timeout detail is on `cause`.
    const cause = error.cause instanceof Error ? error.cause : new Error(String(error.cause))
    t.regex(cause.message, /timeout/i, `undici timeout error, got: ${cause.message}`)
    t.true(elapsed < 5_000, `settled in ${elapsed}ms, well under the 300s undici default`)

    // The socket must be destroyed. A lingering socket is the leak this fixes:
    // an abandoned scrape would otherwise hold it open indefinitely.
    const deadline = Date.now() + 2_000
    while (Date.now() < deadline && hole.sockets.length === 0) {
        await sleep(25)
    }
    t.is(hole.sockets.length, 1, 'the server saw exactly one connection')
    await Promise.race([
        hole.sockets[0].closed,
        sleep(2_000).then(() => {
            throw new Error('socket stayed open after the timeout')
        }),
    ])
})

test('dispatchers are shared instances', async (t) => {
    t.is(getApiDispatcher(), getApiDispatcher())
    // Scrape dispatcher is wrapped per-request (subresource filter),
    // so identity is not guaranteed — just verify it returns a Dispatcher.
    const d = getScrapeDispatcher('http://example.com')
    t.truthy(typeof d.dispatch === 'function')
    t.truthy(typeof d.destroy === 'function')
    t.truthy(typeof d.close === 'function')
})

test('scrape dispatcher refuses loopback connections before any TCP', async (t) => {
    let connections = 0
    const server = http.createServer((req, res) => {
        connections++
        res.end('internal')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = address && typeof address === 'object' ? address.port : 0
    t.teardown(() => new Promise<void>((r) => server.close(() => r())))

    const error = await fetch(`http://127.0.0.1:${port}/`, { dispatcher: getScrapeDispatcher(`http://127.0.0.1:${port}/`) }).then(
        () => null,
        (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
    )
    if (error === null) {
        t.fail('the request should have been refused')
        return
    }

    // fetch() wraps the undici error: the refusal detail is on `cause`.
    const cause = error.cause instanceof Error ? error.cause : new Error(String(error.cause))
    t.regex(cause.message, /private or reserved/)
    t.is(connections, 0, 'no TCP connection reached the loopback server')
})

test('connect timeout comes from SCRAPER_CONNECT_TIMEOUT', async (t) => {
    t.is(getConfig().scraper.connectTimeout, 500)
})

/**
 * A TLS server that advertises both h2 and http/1.1 via ALPN, routing each
 * connection to a real HTTP/2 or HTTP/1.1 server based on what was
 * negotiated. http2.createSecureServer() cannot be used: it only advertises
 * 'h2' even with allowH1, so it would reject an http/1.1-only client.
 */
function startHybridServer(key: string, cert: string, seen: string[]): Promise<{ url: string; close: () => Promise<void> }> {
    const sockets: tls.TLSSocket[] = []
    const h2 = http2.createServer()
    h2.on('stream', (stream: import('node:http2').ServerHttp2Stream) => {
        seen.push('2.0')
        stream.respond({ ':status': 200, 'content-type': 'text/plain' })
        stream.end('h2-ok')
    })

    const h1 = http.createServer((req, res) => {
        seen.push('1.1')
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('h1-ok')
    })

    const server = tls.createServer(
        { key, cert, ALPNProtocols: ['h2', 'http/1.1'] },
        (socket) => {
            sockets.push(socket)
            if (socket.alpnProtocol === 'h2') {
                h2.emit('connection', socket)
            } else {
                h1.emit('connection', socket)
            }
        },
    )

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            const port = address && typeof address === 'object' ? address.port : 0
            resolve({
                url: `https://127.0.0.1:${port}`,
                close: () => new Promise<void>((r) => {
                    // undici pools keep the socket alive after the response,
                    // so close() alone would hang waiting for it.
                    for (const socket of sockets) {
                        socket.destroy()
                    }
                    h1.close()
                    h2.close()
                    server.close(() => r())
                }),
            })
        })
    })
}

// Regression test for the undici h2 idle-timeout crash: both dispatchers set
// allowH2: false, so even a server that advertises h2 via ALPN must only ever
// see HTTP/1.1. The api dispatcher is the one allowed to reach loopback (the
// scrape dispatcher's SSRF connector refuses it); both share the same Agent
// options. The self-signed cert forces NODE_TLS_REJECT_UNAUTHORIZED for the
// duration of the test, which Node prints a one-time warning about.
test('dispatchers never negotiate HTTP/2 with an h2-capable server', async (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'aetherium-h2-'))
    t.teardown(() => rmSync(dir, { recursive: true, force: true }))

    let key: string
    let cert: string
    try {
        execFileSync(
            'openssl',
            [
                'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                '-keyout', path.join(dir, 'key.pem'),
                '-out', path.join(dir, 'cert.pem'),
                '-subj', '/CN=localhost',
            ],
            { stdio: 'ignore' },
        )
        key = readFileSync(path.join(dir, 'key.pem'), 'utf8')
        cert = readFileSync(path.join(dir, 'cert.pem'), 'utf8')
    } catch {
        t.log('openssl is not available; skipping h2/h1 TLS server test')
        return
    }

    const prevReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    t.teardown(() => {
        if (prevReject === undefined) {
            delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
        } else {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevReject
        }
    })

    const seen: string[] = []
    const server = await startHybridServer(key, cert, seen)
    t.teardown(() => server.close())

    const res = await fetch(`${server.url}/`, { dispatcher: getApiDispatcher() })
    t.is(await res.text(), 'h1-ok')
    t.deepEqual(seen, ['1.1'], 'the server negotiated HTTP/1.1 even though it advertised h2')
})
