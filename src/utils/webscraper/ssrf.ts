import { isIP } from 'node:net'
import { promises as dnsPromises } from 'node:dns'
import { buildConnector } from 'undici'

function parseIPv4(ip: string): number[] | null {
    const parts = ip.split('.')
    if (parts.length !== 4) return null

    const octets: number[] = []
    for (const part of parts) {
        if (part.length === 0 || part.length > 3 || !/^\d+$/.test(part)) return null
        const n = Number.parseInt(part, 10)
        if (n > 255) return null
        octets.push(n)
    }
    return octets
}

function isBlockedIPv4(octets: number[]): boolean {
    const [a, b] = octets
    if (a === 0) return true
    if (a === 10) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a >= 224) return true
    return false
}

function ipv4ToGroups(v4: string): number[] | null {
    const octets = parseIPv4(v4)
    if (!octets) return null
    return [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]]
}

function expandIPv6(ip: string): number[] | null {
    let host = ip
    const zone = host.indexOf('%')
    if (zone !== -1) host = host.slice(0, zone)

    const lastColon = host.lastIndexOf(':')
    if (host.slice(lastColon + 1).includes('.')) {
        const groups = ipv4ToGroups(host.slice(lastColon + 1))
        if (!groups) return null
        host = `${host.slice(0, lastColon + 1)}${groups[0].toString(16)}:${groups[1].toString(16)}`
    }

    if (host.includes(':::')) return null

    const halves = host.split('::')
    if (halves.length > 2) return null

    const parseGroups = (s: string): number[] | null => {
        if (s === '') return []
        const out: number[] = []
        for (const part of s.split(':')) {
            if (part.length === 0 || part.length > 4 || !/^[0-9a-f]+$/i.test(part)) return null
            const n = Number.parseInt(part, 16)
            if (n > 0xffff) return null
            out.push(n)
        }
        return out
    }

    if (halves.length === 2) {
        const head = parseGroups(halves[0])
        const tail = parseGroups(halves[1])
        if (!head || !tail) return null
        if (head.length + tail.length > 7) return null
        return [...head, ...Array<number>(8 - head.length - tail.length).fill(0), ...tail]
    }

    const full = parseGroups(host)
    if (!full || full.length !== 8) return null
    return full
}

function isBlockedIPv6(groups: number[]): boolean {
    if (groups.every((g) => g === 0)) return true
    if (groups[7] === 1 && groups.slice(0, 7).every((g) => g === 0)) return true
    if ((groups[0] & 0xffc0) === 0xfe80) return true
    if ((groups[0] & 0xfe00) === 0xfc00) return true
    if ((groups[0] & 0xff00) === 0xff00) return true
    if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0) {
        if (groups[5] === 0 || groups[5] === 0xffff) {
            return isBlockedIPv4([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff])
        }
    }
    return false
}

export function isBlockedIp(ip: string): boolean {
    const v4 = parseIPv4(ip)
    if (v4) return isBlockedIPv4(v4)
    const groups = expandIPv6(ip)
    if (groups) return isBlockedIPv6(groups)
    // Fail closed: an address we cannot parse must not be treated as public.
    return true
}

function hostnameOf(url: string): string | null {
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        return null
    }

    let hostname = parsed.hostname
    if (hostname.startsWith('[') && hostname.endsWith(']')) hostname = hostname.slice(1, -1)
    if (hostname.endsWith('.')) hostname = hostname.slice(0, -1)
    return hostname
}

export function getBlockedUrlReason(url: string): string | null {
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        return 'not a valid URL'
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return `disallowed scheme "${parsed.protocol.replace(/:$/, '')}"`
    }

    const hostname = hostnameOf(url)
    if (hostname === null) return 'not a valid URL'

    if (hostname === 'localhost' || hostname.toLowerCase().endsWith('.localhost')) {
        return 'localhost is not allowed'
    }

    if (isIP(hostname) !== 0 && isBlockedIp(hostname)) {
        return `private or reserved address ${hostname}`
    }

    return null
}

export function assertFetchableUrl(url: string): void {
    // URL pattern checks (protocol, IP literals) happen here.
    // Hostname DNS resolution is delegated to createSsrfSafeConnect which
    // is the authoritative check — it pins the validated address, preventing
    // DNS rebinding. Doing DNS here too wastes a thread from the 4-thread
    // libuv pool (two getaddrinfo calls per scrape).
    const reason = getBlockedUrlReason(url)
    if (reason) {
        throw new Error(`Refusing to fetch ${url}: ${reason}`)
    }
}

// Every SSRF refusal message starts with this prefix (pre-check and
// connect-time alike). jsdom re-wraps connector errors into plain Errors
// that keep the message but drop the class and the cause, so the message
// is the only signal that survives the fetch path.
const SSRF_REFUSAL_PREFIX = 'Refusing to '

// Walks the error cause chain for an SSRF refusal message.
// Returns the refusal message, or null when the error is not a refusal.
export function getSsrfRefusalReason(err: unknown): string | null {
    let cur: unknown = err
    let depth = 0
    while (cur instanceof Error && depth < 10) {
        if (cur.message.startsWith(SSRF_REFUSAL_PREFIX)) return cur.message
        cur = cur.cause
        depth++
    }
    return null
}

// dns.lookup has no timeout option and getaddrinfo can hang on a broken
// resolver, so the lookup gets its own budget inside the connect budget.
function lookupAll(hostname: string, timeoutMs: number): Promise<Array<{ address: string; family: number }>> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`DNS lookup for ${hostname} timed out after ${timeoutMs}ms`))
        }, timeoutMs)

        dnsPromises
            .lookup(hostname, { all: true })
            .then((addresses) => {
                clearTimeout(timer)
                resolve(addresses)
            })
            .catch((err) => {
                clearTimeout(timer)
                reject(err)
            })
    })
}

/**
 * An undici connect function that enforces the SSRF blocklist at connect
 * time. For IP literals it validates then pins the address. For hostnames it
 * re-resolves DNS, refuses if no address is usable, and pins the first valid
 * one. Validation and connection share a single resolution, so DNS rebinding
 * is impossible: the address that is checked is the address that is used.
 *
 * Both phases are bounded by `timeoutMs`: the base connector applies it to
 * the TCP handshake, and the DNS lookup races its own timer (undici does not
 * apply the agent's connectTimeout to custom connect functions).
 */
export function createSsrfSafeConnect(
    timeoutMs: number,
    baseConnect: ReturnType<typeof buildConnector> = buildConnector({ timeout: timeoutMs }),
): ReturnType<typeof buildConnector> {
    return (options, callback) => {
        const hostname = options.hostname.replace(/^\[|\]$/g, '')
        const isTls = options.protocol === 'https:'

        // Hand the pinned IP to the base connector; for TLS the original
        // hostname is kept as the SNI/cert name.
        const connectPinned = (ip: string): void => {
            baseConnect(
                {
                    ...options,
                    hostname: ip,
                    host: ip,
                    servername: isTls ? options.servername || hostname : options.servername,
                },
                callback,
            )
        }

        // IP literal: validate then pin it directly.
        if (isIP(hostname) !== 0) {
            if (isBlockedIp(hostname)) {
                callback(new Error(`Refusing to connect to ${hostname}: private or reserved address`), null)
                return
            }
            connectPinned(hostname)
            return
        }

        // Hostname: resolve, refuse if no address is usable, pin the first valid one.
        lookupAll(hostname, timeoutMs)
            .then((addresses) => {
                const valid = addresses.find(({ address }) => !isBlockedIp(address))
                if (!valid) {
                    callback(
                        new Error(`Refusing to connect to ${hostname}: resolves only to private or reserved addresses`),
                        null,
                    )
                    return
                }
                connectPinned(valid.address)
            })
            .catch((err) => callback(err instanceof Error ? err : new Error(String(err)), null))
    }
}
