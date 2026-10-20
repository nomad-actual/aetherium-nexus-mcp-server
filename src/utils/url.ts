/**
 * Strip userinfo (username:password@) from a URL string.
 * Zod .url() allows userinfo, but it should never appear in logs,
 * tool output, or be forwarded to downstream services (F5).
 */
export function stripUrlUserinfo(url: string): string {
    try {
        const parsed = new URL(url)
        if (parsed.username || parsed.password) {
            parsed.username = ''
            parsed.password = ''
            return parsed.toString()
        }
    } catch {
        // If parsing fails, return the original string unchanged.
    }
    return url
}
