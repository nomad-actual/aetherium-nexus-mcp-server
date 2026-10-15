import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { hostHeaderValidation, localhostHostValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js'
import type { AetheriumConfig } from '../types.ts'
import logger from '../utils/logger.ts'

const LOCALHOST_HOSTS = ['localhost', '127.0.0.1', '::1']

function constantTimeEqual(a: string, b: string): boolean {
    // Hash both first: timingSafeEqual throws on length mismatch, and
    // comparing equal-length hashes keeps the token's length out of the timing.
    const hashA = createHash('sha256').update(a).digest()
    const hashB = createHash('sha256').update(b).digest()
    return timingSafeEqual(hashA, hashB)
}

function unauthorized(res: Response, message: string): void {
    res
        .status(401)
        .set('WWW-Authenticate', 'Bearer')
        .json({
            jsonrpc: '2.0',
            error: {
                code: -32001,
                message,
            },
            id: null,
        })
}

/**
 * Express middleware requiring `Authorization: Bearer <token>` to match the
 * configured token (constant-time comparison). Returns 401 with a JSON-RPC
 * error body and a `WWW-Authenticate: Bearer` header otherwise.
 */
export function createBearerAuthMiddleware(token: string): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
        const header = req.headers.authorization

        if (!header) {
            return unauthorized(res, 'Missing Authorization header')
        }

        const [scheme, value] = header.split(' ')
        if (scheme?.toLowerCase() !== 'bearer' || !value) {
            return unauthorized(res, "Invalid Authorization header format, expected 'Bearer TOKEN'")
        }

        if (!constantTimeEqual(token, value)) {
            return unauthorized(res, 'Invalid token')
        }

        next()
    }
}

/**
 * DNS rebinding protection for the Host header, following the MCP SDK's own
 * pattern (createMcpExpressApp):
 *
/**
 * Reduce an MCP_SERVER_CORS_ALLOWED_HOSTS entry to the hostname the SDK
 * middleware actually compares against. The SDK matches the request Host
 * header's hostname (scheme- and port-agnostic), so entries like
 * 'localhost:3000' or 'http://localhost:5173' are normalized to 'localhost'
 * — the same parse the middleware applies to incoming requests. Returns null
 * for entries that do not parse.
 */
function normalizeHostname(entry: string): string | null {
    try {
        const url = new URL(entry.includes('://') ? entry : `http://${entry}`)
        return url.hostname
    } catch {
        return null
    }
}

function normalizeHostEntries(entries: string[]): string[] {
    const hostnames: string[] = []
    const rewritten: string[] = []

    for (const entry of entries) {
        const hostname = normalizeHostname(entry)
        if (hostname === null) {
            logger.warn(`Ignoring invalid MCP_SERVER_CORS_ALLOWED_HOSTS entry: '${entry}'`)
            continue
        }
        if (hostname !== entry) {
            rewritten.push(`'${entry}' -> '${hostname}'`)
        }
        if (!hostnames.includes(hostname)) {
            hostnames.push(hostname)
        }
    }

    if (rewritten.length > 0) {
        logger.warn(
            'MCP_SERVER_CORS_ALLOWED_HOSTS entries are matched as bare hostnames (no scheme or port): '
            + rewritten.join(', ')
        )
    }

    return hostnames
}

/**
 * DNS rebinding protection for the Host header, following the MCP SDK's own
 * pattern (createMcpExpressApp):
 *
 * - `MCP_SERVER_CORS_ALLOWED_HOSTS` (pipe-separated) wins when it yields at
 *   least one valid hostname; entries are normalized to bare hostnames;
 * - default for localhost binds: localhost, 127.0.0.1, [::1];
 * - non-localhost bind without a list: no Host validation, with a startup
 *   warning — the server is deliberately exposed and MCP_SERVER_AUTH_TOKEN is
 *   the primary control there.
 *
 * Returns undefined when no Host validation should be installed.
 */
export function hostValidationMiddleware(config: AetheriumConfig): RequestHandler | undefined {
    const { corsAllowedHosts, host } = config.mcpServer

    const hostnames = normalizeHostEntries(corsAllowedHosts)
    if (hostnames.length > 0) {
        return hostHeaderValidation(hostnames)
    }

    if (corsAllowedHosts.length > 0) {
        logger.warn(
            'MCP_SERVER_CORS_ALLOWED_HOSTS is set but has no valid entries; '
            + 'falling back to the default for this bind.'
        )
    }

    if (LOCALHOST_HOSTS.includes(host)) {
        return localhostHostValidation()
    }

    logger.warn(
        `Server is bound to ${host} without MCP_SERVER_CORS_ALLOWED_HOSTS; ` +
        'Host header validation is disabled. Set MCP_SERVER_CORS_ALLOWED_HOSTS ' +
        'and/or MCP_SERVER_AUTH_TOKEN for network-exposed servers.'
    )
    return undefined
}
