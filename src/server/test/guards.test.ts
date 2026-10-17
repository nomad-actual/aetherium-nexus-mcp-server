import test from 'ava'
import type { NextFunction, Request, Response } from 'express'
import { createBearerAuthMiddleware, hostValidationMiddleware } from '../guards.ts'
import type { AetheriumConfig } from '../../types.ts'

function makeConfig(overrides: Partial<AetheriumConfig['mcpServer']> = {}): AetheriumConfig {
    return {
        mcpServer: {
            port: 3000,
            host: 'localhost',
            corsAllowedHosts: [],
            corsAllowedOrigins: [],
            authToken: '',
            title: 'test',
            version: 'dev',
            toolCallRequestTimeout: 30_000,
            ...overrides,
        },
        defaultLocation: { lat: 0, lon: 0, timezone: 'UTC' },
        timeserver: { host: 'time.test', port: 123, timeout: 200 },
        scraper: {
            contentLimit: 1,
            timeout: 1,
            connectTimeout: 1,
            maxConcurrent: 1,
            maxBytes: 50_000_000,
            crw: { host: '', apiKey: '', renderJs: null, onlyMainContent: true },
            basicHtmlReader: { minReadableLength: 1 },
        },
        search: { host: '', timeout: 1, contentLimit: 1, maxResults: 1 },
        weather: { forecastDays: 7 },
        locale: { region: 'en-US', units: 'imperial', monthStyle: 'short', showWeekday: false, is24HourTime: false },
    }
}

type Recorded = {
    statusCode: number | null
    headers: Record<string, string>
    body: unknown
}

function makeRes() {
    const recorded: Recorded = { statusCode: null, headers: {}, body: undefined }
    const res = {
        status(code: number) {
            recorded.statusCode = code
            return res
        },
        set(name: string, value: string) {
            recorded.headers[name] = value
            return res
        },
        json(body: unknown) {
            recorded.body = body
            return res
        },
    }
    return { res: res as unknown as Response, recorded }
}

function makeReq(headers: Record<string, string>): Request {
    return { headers } as unknown as Request
}

function makeNext() {
    let called = false
    const next: NextFunction = () => {
        called = true
    }
    return { next, wasCalled: () => called }
}

test('auth middleware accepts the configured token', (t) => {
    const mw = createBearerAuthMiddleware('secret')
    const { res } = makeRes()
    const { next, wasCalled } = makeNext()

    mw(makeReq({ authorization: 'Bearer secret' }), res, next)

    t.true(wasCalled())
})

test('auth middleware accepts a case-insensitive bearer scheme', (t) => {
    const mw = createBearerAuthMiddleware('secret')
    const { res } = makeRes()
    const { next, wasCalled } = makeNext()

    mw(makeReq({ authorization: 'bEaReR secret' }), res, next)

    t.true(wasCalled())
})

test('auth middleware rejects a missing Authorization header', (t) => {
    const mw = createBearerAuthMiddleware('secret')
    const { res, recorded } = makeRes()
    const { next, wasCalled } = makeNext()

    mw(makeReq({}), res, next)

    t.false(wasCalled())
    t.is(recorded.statusCode, 401)
    t.is(recorded.headers['WWW-Authenticate'], 'Bearer')
    t.like(recorded.body, { jsonrpc: '2.0', error: { code: -32001 } })
})

test('auth middleware rejects an invalid token', (t) => {
    const mw = createBearerAuthMiddleware('secret')
    const { res, recorded } = makeRes()
    const { next, wasCalled } = makeNext()

    mw(makeReq({ authorization: 'Bearer wrong' }), res, next)

    t.false(wasCalled())
    t.is(recorded.statusCode, 401)
})

test('auth middleware rejects a wrong scheme', (t) => {
    const mw = createBearerAuthMiddleware('secret')
    const { res, recorded } = makeRes()
    const { next, wasCalled } = makeNext()

    mw(makeReq({ authorization: 'Basic secret' }), res, next)

    t.false(wasCalled())
    t.is(recorded.statusCode, 401)
})

test('auth middleware rejects a bearer header without a token', (t) => {
    const mw = createBearerAuthMiddleware('secret')
    const { res, recorded } = makeRes()
    const { next, wasCalled } = makeNext()

    mw(makeReq({ authorization: 'Bearer' }), res, next)

    t.false(wasCalled())
    t.is(recorded.statusCode, 401)
})

function hostAllowed(hostHeader: string, config: AetheriumConfig): boolean {
    const mw = hostValidationMiddleware(config)
    if (!mw) {
        throw new Error('expected host validation middleware')
    }
    const { res } = makeRes()
    const { next, wasCalled } = makeNext()
    mw(makeReq({ host: hostHeader }), res, next)
    return wasCalled()
}

test('host validation uses the operator list when set (port-agnostic)', (t) => {
    const config = makeConfig({ corsAllowedHosts: ['mcp.example.com'] })

    t.true(hostAllowed('mcp.example.com', config))
    t.true(hostAllowed('mcp.example.com:3000', config))
    t.false(hostAllowed('evil.example.com', config))
})

test('host validation normalizes operator entries to bare hostnames', (t) => {
    const config = makeConfig({
        host: '0.0.0.0',
        corsAllowedHosts: ['127.0.0.1', 'localhost:3000', 'http://homelab.ist', 'https://ai.homelab.ist'],
    })

    t.true(hostAllowed('localhost:3999', config))
    t.true(hostAllowed('127.0.0.1:3999', config))
    t.true(hostAllowed('homelab.ist:443', config))
    t.true(hostAllowed('ai.homelab.ist', config))
    t.false(hostAllowed('evil.com', config))
})

test('host validation falls back to the bind default when all entries are invalid', (t) => {
    const config = makeConfig({ host: 'localhost', corsAllowedHosts: ['http://'] })

    t.true(hostAllowed('localhost:3000', config))
    t.false(hostAllowed('evil.com:3000', config))
})

test('host validation defaults to localhost names for localhost binds', (t) => {
    const config = makeConfig({ host: 'localhost' })

    t.true(hostAllowed('localhost:3000', config))
    t.true(hostAllowed('127.0.0.1:3000', config))
    t.true(hostAllowed('[::1]:3000', config))
    t.false(hostAllowed('evil.com:3000', config))
    t.false(hostAllowed('localhost.evil.com', config))
})

test('host validation is skipped (with a warning) for non-localhost binds without a list', (t) => {
    const config = makeConfig({ host: '0.0.0.0' })

    t.is(hostValidationMiddleware(config), undefined)
})
