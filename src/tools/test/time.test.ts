import test from 'ava'
import dgram from 'node:dgram'
import { getTime } from '../time.ts'

// Seconds between the NTP epoch (1900-01-01) and the Unix epoch (1970-01-01).
const NTP_DELTA = 2_208_988_800

// Offsets of the 64-bit receive timestamp (T2) in an NTP packet:
// 32-bit seconds followed by 32-bit fraction.
const T2_SECONDS_OFFSET = 32
const T2_FRACTION_OFFSET = 36

function buildReply(time: Date): Buffer {
    const packet = Buffer.alloc(48)
    packet[0] = 0x1d // LI=0, VN=4, Mode=3 (server)
    const seconds = Math.floor(time.getTime() / 1000) + NTP_DELTA
    packet.writeUInt32BE(seconds, T2_SECONDS_OFFSET)
    packet.writeUInt32BE(0, T2_FRACTION_OFFSET)
    return packet
}

type NtpServer = { port: number; close: () => Promise<void> }

function startNtpServer(time: Date, reply: boolean = true): Promise<NtpServer> {
    return new Promise((resolve) => {
        const socket = dgram.createSocket('udp4')
        socket.on('message', (msg, rinfo) => {
            if (!reply) return
            socket.send(buildReply(time), rinfo.port, rinfo.address)
        })
        socket.bind(0, '127.0.0.1', () => {
            const address = socket.address()
            const port = address.port
            resolve({
                port,
                close: () => new Promise<void>((r) => socket.close(() => r())),
            })
        })
    })
}

function udpSockets(): number {
    return process.getActiveResourcesInfo().filter((r) => r === 'UDPWrap').length
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// Serial: the socket-count assertion measures process-wide active resources,
// and a concurrent test's server or orphaned socket would pollute the
// baseline. Runs first so no earlier test has leaked a socket yet.
test.serial('getTime leaves no UDP sockets behind', async (t) => {
    const server = await startNtpServer(new Date())
    t.teardown(() => server.close())

    const baseline = udpSockets()
    const time = await getTime(
        { host: '127.0.0.1', port: server.port, timeout: 1000 },
        new AbortController().signal,
    )
    t.true(Math.abs(time.getTime() - Date.now()) < 2000, 'NTP time is close to local time')

    await sleep(100) // closed handles drop out of the active-resources list
    t.is(udpSockets(), baseline, 'no UDP socket left behind by the NTP call')
})

test.serial('getTime falls back to local time when the server stays silent', async (t) => {
    const server = await startNtpServer(new Date(), false)
    t.teardown(() => server.close())

    const before = Date.now()
    const time = await getTime(
        { host: '127.0.0.1', port: server.port, timeout: 100 },
        new AbortController().signal,
    )
    const after = Date.now()

    t.true(
        time.getTime() >= before - 1000 && time.getTime() <= after + 1000,
        `fallback time ${time} is close to local time`,
    )
})
