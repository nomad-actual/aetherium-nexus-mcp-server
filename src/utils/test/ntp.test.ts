import test from 'ava'
import dgram from 'node:dgram'
import { syncNtpTime } from '../ntp.ts'

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

// Serial and first: the socket-count assertion measures process-wide active
// resources, and a concurrent test's server or a leaked socket would pollute
// the baseline.
test.serial('syncNtpTime closes its socket on success and on timeout', async (t) => {
    const server = await startNtpServer(new Date())
    t.teardown(() => server.close())

    const baseline = udpSockets()

    await syncNtpTime('127.0.0.1', server.port, 1000)
    await sleep(100) // closed handles drop out of the active-resources list
    t.is(udpSockets(), baseline, 'no socket left behind after success')

    const silent = await startNtpServer(new Date(), false)
    t.teardown(() => silent.close())
    await t.throwsAsync(syncNtpTime('127.0.0.1', silent.port, 150), { message: /timed out/ })
    await sleep(100)
    // The silent server is still open; only it may remain.
    t.is(udpSockets(), baseline + 1, 'no socket left behind after timeout')
})

test('syncNtpTime returns the server receive timestamp', async (t) => {
    const target = new Date('2026-01-01T12:00:00Z')
    const server = await startNtpServer(target)
    t.teardown(() => server.close())

    const time = await syncNtpTime('127.0.0.1', server.port, 1000)
    t.true(
        Math.abs(time.getTime() - target.getTime()) < 1000,
        `returned ${time}, expected ${target}`,
    )
})

test('syncNtpTime rejects when the server stays silent', async (t) => {
    const server = await startNtpServer(new Date(), false)
    t.teardown(() => server.close())

    const started = Date.now()
    await t.throwsAsync(syncNtpTime('127.0.0.1', server.port, 150), { message: /timed out/ })
    t.true(Date.now() - started < 2000, 'the timeout bound is honored')
})
