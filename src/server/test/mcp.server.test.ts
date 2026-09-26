import test from 'ava'
import dgram from 'node:dgram'

// pino captures the stdout write function when the logger is created, so the
// capture hook must be installed before the module under test (which imports
// the logger) is imported. It passes everything through until a test opts in.
const capturedLines: string[] = []
let capturing = false
const originalWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk: string | Uint8Array) => {
    if (capturing) {
        capturedLines.push(chunk.toString())
        return true
    }
    return originalWrite(chunk)
}

const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
const { buildMCPServer } = await import('../mcp.server.ts')
const { getConfig } = await import('../../utils/config.ts')

const NTP_DELTA = 2_208_988_800

// The fetch-current-time handler reads its NTP settings from getConfig(), which
// caches on first call, so the env vars must be set before any test runs.
let respondToNtp = false

function buildNtpResponse(): Buffer {
    const res = Buffer.alloc(48)
    res[0] = 0x23 // LI=0, version=3, mode=4 (server)
    res[1] = 1 // stratum 1
    const now = Date.now() / 1000
    const seconds = Math.floor(now + NTP_DELTA)
    const fraction = Math.floor((now - Math.floor(now)) * 2 ** 32)
    res.writeUInt32BE(seconds, 32) // receive timestamp (ntp-time derives `time` from it)
    res.writeUInt32BE(fraction, 36)
    res.writeUInt32BE(seconds, 40) // transmit timestamp
    res.writeUInt32BE(fraction, 44)
    return res
}

// Local UDP "NTP" server. While respondToNtp is false it swallows requests so
// ntp-time's syncTime() hangs until its own timeout; when true it replies with
// a minimal valid NTP packet.
const udp = await new Promise<dgram.Socket>((resolve) => {
    const socket = dgram.createSocket('udp4')
    socket.on('message', (_req, rinfo) => {
        if (!respondToNtp) return
        socket.send(buildNtpResponse(), 0, 48, rinfo.port, rinfo.address)
    })
    socket.bind(0, '127.0.0.1', () => resolve(socket))
})

process.env.TIMESERVER_HOST = '127.0.0.1'
process.env.TIMESERVER_PORT = String(udp.address().port)
process.env.TIMESERVER_TIMEOUT = '3000'

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// test.serial: the two tests share the respondToNtp flag on the local UDP
// server, so they must not interleave.
test.serial('client cancellation aborts the tool handler signal', async (t) => {
    respondToNtp = false
    capturedLines.length = 0
    capturing = true

    try {
        const server = buildMCPServer(getConfig())
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
        await server.connect(serverTransport)
        const client = new Client({ name: 'test-client', version: '0.0.0' })
        await client.connect(clientTransport)

        try {
            const controller = new AbortController()
            const pending = client.callTool(
                { name: 'fetch-current-time', arguments: {} },
                undefined,
                { signal: controller.signal },
            )

            await sleep(400) // NTP request is in flight to the silent local server
            controller.abort()

            const error = await pending.catch((e: unknown) => e)
            t.truthy(error, 'callTool rejects when the client aborts')

            // The handler's signal must have fired: the time tool logs its
            // local-time fallback the moment its NTP wait is aborted. With the
            // old code the NTP wait only ended after the full 3 s timeserver
            // timeout, far outside this 1 s post-abort window.
            const deadline = Date.now() + 1_000
            while (
                Date.now() < deadline &&
                !capturedLines.some((l) => l.includes('falling back to local system time'))
            ) {
                await sleep(50)
            }

            t.true(
                capturedLines.some((l) => l.includes('falling back to local system time')),
                'handler observed the client cancellation within 1s of the abort',
            )
        } finally {
            await client.close()
            await server.close()
        }
    } finally {
        capturing = false
    }
})

test.serial('tool call without cancellation still completes (NTP success path)', async (t) => {
    respondToNtp = true
    capturedLines.length = 0
    capturing = true

    try {
        const server = buildMCPServer(getConfig())
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
        await server.connect(serverTransport)
        const client = new Client({ name: 'test-client', version: '0.0.0' })
        await client.connect(clientTransport)

        let text: string | undefined
        let elapsed = 0

        try {
            const startedAt = Date.now()
            // callTool's return type is a union; the non-task member's index
            // signature collapses `content` to unknown, so narrow it here.
            const result = (await client.callTool({
                name: 'fetch-current-time',
                arguments: {},
            })) as { content: { type: 'text'; text: string }[] }
            elapsed = Date.now() - startedAt
            text = result.content.find((c) => c.type === 'text')?.text
        } finally {
            await client.close()
            await server.close()
        }

        t.true(elapsed < 5_000, `NTP reply was handled quickly (${elapsed}ms)`)
        t.true(
            capturedLines.some((l) => l.includes('Time retrieved')),
            'NTP time was retrieved rather than falling back',
        )
        t.regex(text ?? '', /\d{1,2}:\d{2}/)
    } finally {
        capturing = false
    }
})

test.after(async () => {
    await new Promise<void>((resolve) => udp.close(() => resolve()))
})
