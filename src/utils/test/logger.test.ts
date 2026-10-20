import test from 'ava'

// pino captures the stdout write function when the logger is created, so the
// capture hook must be installed before the logger module is imported.
const captured: string[] = []
let capturing = false
const originalWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk: string | Uint8Array) => {
    if (capturing) {
        captured.push(chunk.toString())
        return true
    }
    return originalWrite(chunk)
}

const { default: logger } = await import('../logger.ts')

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

test('the logger redacts authorization and cookie headers', async (t) => {
    captured.length = 0
    capturing = true

    try {
        logger.info(
            {
                req: {
                    method: 'POST',
                    headers: {
                        authorization: 'Bearer secret-token-123',
                        cookie: 'session=abc',
                        host: 'example.com',
                    },
                },
            },
            'MCP request',
        )

        // pino may flush asynchronously; wait for the line to arrive.
        const deadline = Date.now() + 2_000
        while (Date.now() < deadline && !captured.some((l) => l.includes('MCP request'))) {
            await sleep(25)
        }
    } finally {
        capturing = false
    }

    const out = captured.join('')
    t.false(out.includes('secret-token-123'), 'authorization header value is redacted')
    t.false(out.includes('session=abc'), 'cookie header value is redacted')
    t.true(out.includes('[Redacted]'), 'redaction marker is present')
    t.true(out.includes('"host":"example.com"'), 'non-sensitive headers are still logged')
    t.true(out.includes('"method":"POST"'), 'request method is still logged')
})

test('url fields are sanitized (userinfo stripped) instead of redacted', async (t) => {
    captured.length = 0
    capturing = true

    try {
        logger.info(
            { url: 'https://user:pass@example.com/page?q=1', sourceURL: 'http://a:b@other.com/x' },
            'url check',
        )

        const deadline = Date.now() + 2_000
        while (Date.now() < deadline && !captured.some((l) => l.includes('url check'))) {
            await sleep(25)
        }
    } finally {
        capturing = false
    }

    const out = captured.join('')
    t.false(out.includes('user:pass@'), 'userinfo is stripped from url')
    t.false(out.includes('a:b@'), 'userinfo is stripped from sourceURL')
    t.true(out.includes('https://example.com/page?q=1'), 'rest of the URL is preserved')
    t.true(out.includes('http://other.com/x'), 'rest of sourceURL is preserved')
    t.false(out.includes('[Redacted]'), 'URL fields are sanitized, not blanked')
})

test('url fields without userinfo pass through unchanged', async (t) => {
    captured.length = 0
    capturing = true

    try {
        logger.info({ url: 'https://example.com/plain' }, 'plain url check')

        const deadline = Date.now() + 2_000
        while (Date.now() < deadline && !captured.some((l) => l.includes('plain url check'))) {
            await sleep(25)
        }
    } finally {
        capturing = false
    }

    const out = captured.join('')
    t.true(out.includes('https://example.com/plain'), 'plain URL is logged as-is')
    t.false(out.includes('[Redacted]'), 'no redaction marker for plain URLs')
})

test('top-level authorization and cookie fields are redacted too', async (t) => {
    captured.length = 0
    capturing = true

    try {
        logger.info(
            { headers: { authorization: 'Token top-level-456', cookie: 'id=xyz' } },
            'top-level check',
        )

        const deadline = Date.now() + 2_000
        while (Date.now() < deadline && !captured.some((l) => l.includes('top-level check'))) {
            await sleep(25)
        }
    } finally {
        capturing = false
    }

    const out = captured.join('')
    t.false(out.includes('top-level-456'), 'top-level authorization value is redacted')
    t.false(out.includes('id=xyz'), 'top-level cookie value is redacted')
})
