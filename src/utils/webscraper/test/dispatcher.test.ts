// Low per-scraper budget so the dispatcher's headers/body timeouts (which
// track SCRAPER_REQUEST_TIMEOUT) fire within a few seconds. Must be set
// before the first getConfig() call in this worker.
process.env.SCRAPER_REQUEST_TIMEOUT = '1000'
process.env.SCRAPER_CONNECT_TIMEOUT = '500'

import test from 'ava'
import http from 'node:http'
import { fetch } from 'undici'
import { getConfig } from '../../config.ts'
import { getScrapeDispatcher } from '../dispatcher.ts'

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

test('dispatcher times out a stalled response and destroys the socket', async (t) => {
    const hole = await startBlackhole()
    t.teardown(() => hole.close())

    const started = Date.now()
    const error = await fetch(`${hole.url}/`, { dispatcher: getScrapeDispatcher() }).then(
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

test('dispatcher is a shared instance', async (t) => {
    t.is(getScrapeDispatcher(), getScrapeDispatcher())
})

test('connect timeout comes from SCRAPER_CONNECT_TIMEOUT', async (t) => {
    t.is(getConfig().scraper.connectTimeout, 500)
})
