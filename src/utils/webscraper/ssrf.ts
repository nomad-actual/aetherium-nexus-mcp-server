import { isIP } from 'node:net'
import { promises as dnsPromises } from 'node:dns'

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
    return false
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

export async function assertFetchableUrl(url: string): Promise<void> {
    const reason = getBlockedUrlReason(url)
    if (reason) {
        throw new Error(`Refusing to fetch ${url}: ${reason}`)
    }

    const hostname = hostnameOf(url)
    if (hostname === null) return
    if (isIP(hostname) !== 0) return

    let addresses: Array<{ address: string; family: number }>
    try {
        addresses = await dnsPromises.lookup(hostname, { all: true })
    } catch {
        return
    }

    for (const { address } of addresses) {
        if (isBlockedIp(address)) {
            throw new Error(`Refusing to fetch ${url}: ${hostname} resolves to private or reserved address ${address}`)
        }
    }
}
