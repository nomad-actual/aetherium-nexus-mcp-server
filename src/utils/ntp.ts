import dgram from 'node:dgram'

// Seconds between the NTP epoch (1900-01-01) and the Unix epoch (1970-01-01).
const NTP_DELTA = 2_208_988_800

// NTP packet size (RFC 5905 section 4).
const NTP_PACKET_SIZE = 48

// First byte: LI (2 bits) | VN (3 bits) | Mode (3 bits).
const NTP_VERSION = 4
const NTP_MODE_CLIENT = 3
const NTP_HEADER_CLIENT = (NTP_VERSION << 3) | NTP_MODE_CLIENT

// Timestamps are 64-bit: 32-bit seconds followed by 32-bit fraction.
const NTP_FRACTION_SCALE = 2 ** 32
const T3_SECONDS_OFFSET = 40 // transmit timestamp in the request
const T3_FRACTION_OFFSET = 44
const T2_SECONDS_OFFSET = 32 // receive timestamp in the response
const T2_FRACTION_OFFSET = 36

function buildRequest(): Buffer {
    const packet = Buffer.alloc(NTP_PACKET_SIZE)
    packet[0] = NTP_HEADER_CLIENT
    const seconds = Math.floor(Date.now() / 1000) + NTP_DELTA
    packet.writeUInt32BE(seconds, T3_SECONDS_OFFSET)
    return packet
}

function readTimestampMs(buf: Buffer, secondsOffset: number, fractionOffset: number): number {
    const seconds = buf.readUInt32BE(secondsOffset)
    const fraction = buf.readUInt32BE(fractionOffset)
    return (seconds - NTP_DELTA) * 1000 + (fraction / NTP_FRACTION_SCALE) * 1000
}

/**
 * Minimal NTP mode-3 client: one request on a fresh UDP socket, answered
 * with the server's receive timestamp (T2). The socket is closed on every
 * path, so no handle is ever left behind. Replaces the ntp-time package,
 * whose constructor socket is orphaned by syncTime() (review finding #19).
 */
export function syncNtpTime(host: string, port: number, timeout: number): Promise<Date> {
    return new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4')
        let settled = false

        const timer = setTimeout(() => {
            if (release()) reject(new Error(`NTP request to ${host}:${port} timed out after ${timeout}ms`))
        }, timeout)

        // Closes the socket and clears the timer exactly once. Returns false
        // if this promise already settled, so late events are ignored.
        const release = (): boolean => {
            if (settled) return false
            settled = true
            clearTimeout(timer)
            socket.close()
            return true
        }

        socket.on('error', (err) => {
            if (release()) reject(err)
        })

        socket.on('message', (msg: Buffer) => {
            try {
                if (msg.length < NTP_PACKET_SIZE) {
                    throw new Error(`NTP response too short (${msg.length} bytes)`)
                }
                if (release()) resolve(new Date(readTimestampMs(msg, T2_SECONDS_OFFSET, T2_FRACTION_OFFSET)))
            } catch (err) {
                if (release()) reject(err instanceof Error ? err : new Error(String(err)))
            }
        })

        socket.send(buildRequest(), port, host, (err) => {
            if (err !== null && release()) reject(err)
        })
    })
}
