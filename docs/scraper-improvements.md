# Scraper Tool: Hanging Issues & Improvement Overview

## Root Cause Analysis: Why the Scraper Hangs

The scraper can hang indefinitely because several code paths lack hard time limits and have incomplete error handling. Below are the issues categorized by severity.

---

### 🔴 Critical — No Upper-Bound Timeouts

#### 1. `BasicHtmlScraper` — JSDOM download has no HTTP timeout
**File:** `src/utils/webscraper/BasicHtmlScraper.ts` (line ~24)

```ts
const dom = await abort(
    JSDOM.fromURL(url, { virtualConsole }),
    signal,
    'JSDOM aborted'
)
```

`JSDOM.fromURL()` uses Node's `http.get()` under the hood. While the `abort` wrapper detects `AbortSignal` firing, JSDOM's internal HTTP connection may **not** terminate the socket promptly — the Promise can linger for tens of seconds after abort before resolving/rejecting. There is **zero** socket-level timeout.

**Impact:** Any site that accepts the TCP handshake but never streams content back will hang until the parent `AbortSignal` fires (which could be 30+ seconds, depending on caller context).

#### 2. `screenshotWebPage` — page.goto timeout is caller-configured, not enforced globally
**File:** `src/utils/webscraper/webscraper.ts`

The `timeout` field in `ScreenShotOptions` is passed to `page.goto()`, but Puppeteer's default `networkidle0` wait strategy can hang on sites with persistent connections (WebSockets, long-polling, ads). There is no per-scraper guard.

#### 3. No per-scraper timeout in `doWebScrape`
**File:** `src/utils/webscraper/webscraper.ts` (~line 66)

```ts
for (const scraper of scrapers) {
    const contents = await scraper.scrape(url, config, signal)
```

The scraper loop uses only the outer `AbortSignal`. There is **no per-request timeout**. If the scraper's internal `config.scraper.timeout` (default 5000ms) is shorter than the scraper's actual work, the scraper will outlast its configured timeout without any mechanism enforcing it.

---

### 🟠 High — Silent Failures & Missing Feedback

#### 4. Scraper failure in the loop is silent
**File:** `src/utils/webscraper/webscraper.ts` (~line 66-72)

```ts
for (const scraper of scrapers) {
    const contents = await scraper.scrape(url, config, signal)
    if (Array.isArray(contents)) { ... }
}
```

If `scraper.scrape()` throws, the exception propagates and no fallback scraper is tried. If it returns `null`, the loop continues **without any log output** saying "Scraper X returned null, trying next." The caller has no visibility into what happened.

#### 5. `RedditScraper` returns `null` but logs an error instead of returning `null` clearly
In `RedditScraper.scrape()`, a non-200 status logs an error and returns `null`. This is actually correct behavior, but the error log fires for what is a normal failure mode (e.g., Reddit throttling).

#### 6. No per-phase logging

Scraping involves multiple phases — DNS lookup, TCP handshake, HTTP request, HTML download, DOM parsing, Readability extraction. Currently nothing logs progress between these phases. When the scraper "hangs," there is no way to know which phase it is stuck in.

---

### 🟡 Medium — Config & Logic Issues

#### 7. `SCRAPER_BASIC_MIN_SCORE` and `SCRAPER_BASIC_MIN_LENGTH` are read from config but never used
**File:** `src/utils/config.ts` (lines with `basicHtmlReader`)
**File:** `src/types.ts` (`scraper.basicHtmlReader`)

These config values are defined and stored, but `BasicHtmlScraper` never reads them. The `Readability` parser is instantiated with default options only:

```ts
const reader = new Readability(dom.window.document)
```

It should pass `minContentLength` and `minScore` to the Readability constructor.

#### 8. `shouldAttempt` on BasicHtmlScraper always returns `true`
**File:** `src/utils/webscraper/BasicHtmlScraper.ts`

```ts
shouldAttempt(url: string): boolean {
    return !!url
}
```

This makes BasicHtmlScraper the **unavoidable fallback** — every non-Reddit URL runs through it. If it hangs on a bad URL, there is no "skip" option. Adding a `shouldAttempt` URL-pattern check (e.g., reject known dynamic-only sites) would reduce unnecessary work.

#### 9. `ScreenshotPage` doesn't respect `config.scraper.timeout`
**File:** `src/utils/webscraper/webscraper.ts` (~line 28)

`ScreenShotOptions.timeout` comes from an external caller. There is no default derived from `config.scraper.timeout`. If the caller omits or misconfigures this, the screenshot could hang with Puppeteer defaults (which are very long).

---

### 🟢 Low — Code Quality & Maintainability

#### 10. Typo in error log message
**File:** `src/utils/webscraper/BasicHtmlScraper.ts`

```ts
virtualConsole.on('error', (err) => logger.error({ mesaage: 'looool', err }))
```

`mesaage` should be `message` and `'looool'` should be a descriptive string.

#### 11. `AbortSignal` rejection in `abort()` wrapper doesn't cancel the inner promise
**File:** `src/utils/promises.ts`

```ts
export async function abort<T>(fn: Promise<T>, signal: AbortSignal, abortReason: string) {
    return new Promise<T>((res, rej) => {
        if (_signal.aborted) { rej(signal?.reason); return }
        _signal.addEventListener('abort', () => { rej(abortReason ...) })
        fn.then(res).catch(rej)   // <-- rejection handler doesn't know about abort
    })
}
```

When the signal fires, `rej` is called for the abort listener, but `fn` keeps running to completion. For HTTP requests this is fine (the socket closes), but for CPU-bound work the promise continues. For `JSDOM.fromURL`, the actual HTTP stream is the concern here.

**Improvement:** For HTTP work, ensure the fetch's signal is linked to the outer signal. For generic promises, consider using `AbortController` to notify the inner work.

---

## Recommended Improvements

### 1. Add Hard Per-Scraper Timeout Wrappers
Create a helper that wraps each scraper call with `AbortController` + deadline:

```ts
// New file: src/utils/webscraper/timeoutUtils.ts
export async function abortAfter<T>(fn: Promise<T>, ms: number, label: string): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => {
        controller.abort(new Error(`${label} timed out after ${ms}ms`))
    }, ms)
    
    try {
        return await Promise.race([
            fn,
            new Promise<T>((_, rej) => {
                controller.signal.addEventListener('abort', () => rej(controller.signal.reason))
            })
        ])
    } finally {
        clearTimeout(timer)
    }
}
```

Then in `doWebScrape`:

```ts
for (const scraper of scrapers) {
    logger.info(`Attempting scrape with ${scraper.constructor.name} on ${url}`)
    
    const contents = await abortAfter(
        scraper.scrape(url, config, signal).catch(err => {
            logger.warn(`${scraper.constructor.name} failed on ${url}: ${err.message}`)
            return null
        }),
        config.scraper.timeout,           // use config timeout per-scraper
        `${scraper.constructor.name} on ${url}`
    )
    
    if (contents && Array.isArray(contents) && contents.length > 0) {
        logger.info(`Content found using scraper ${scraper.constructor.name} in ${(Date.now()-startTime)/1000}s`)
        const results = await scraper.buildResult(contents)
        return results
    }
    
    logger.debug(`${scraper.constructorName} returned null/empty for ${url}`)
}
```

### 2. Pass Config to Readability Parser
In `BasicHtmlScraper.scrape()`:

```ts
const reader = new Readability(dom.window.document, {
    minContentLength: config.scraper.basicHtmlReader.minReadableLength,
    minScore: config.scraper.basicHtmlReader.minScore,
})
```

### 3. Add Socket-Level Timeout to JSDOM Download
JSDOM's `fromURL` accepts a `resourceLoader` option. We can provide one with an explicit timeout:

```ts
import https from 'https'
import http from 'http'

const resourceLoader = (url: string, options: any, defaultLoad: any) => {
    const timeout = config.scraper.timeout
    const loader = defaultLoad(url, { ...options, timeout })
    return loader
}

const dom = await JSDOM.fromURL(url, {
    virtualConsole,
    resourceLoader: (url: string, opts: any, defaultLoad: any) => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(new Error('Download timeout')), timeout)
        const req = defaultLoad(url, { ...opts, signal: controller.signal })
        req?.on('abort', () => clearTimeout(timer))
        return req
    },
})
```

### 4. Add Phase Logging
Add `logger.debug` at each major phase:

```ts
// In BasicHtmlScraper.scrape()
logger.debug(`[BasicHtmlScraper] Starting DNS/HTTP fetch for ${url}`)
const dom = await JSDOM.fromURL(url, { ... })
logger.debug(`[BasicHtmlScraper] HTML downloaded (${responseSize} bytes), parsing...`)
const reader = new Readability(...)
logger.debug(`[BasicHtmlScraper] Readability extraction complete`)
```

### 5. Add URL Allowlist/Blocklist heuristics
In `BasicHtmlScraper.shouldAttempt()`, add quick rejection criteria for known problematic domains or patterns:

```ts
shouldAttempt(url: string): boolean {
    // Reject obviously non-HTML endpoints
    const lower = url.toLowerCase()
    if (lower.match(/\.(pdf|zip|exe|mp4|webp|svg)$/)) return false
    // Skip known SPAs / JS-heavy sites that JSDOM can't parse
    if (lower.match(/instagram\.com|tiktok\.com|twitter\.com|x\.com/)) return false
    return true
}
```

### 6. Fix screenshot default timeout
Ensure `screenshotWebPage` uses `config.scraper.timeout` with a sensible floor:

```ts
const timeout = screenshotOptions.timeout || Math.max(config.scraper.timeout, 15_000)
```

### 7. Improve `abort()` helper for non-HTTP work

```ts
export async function abort<T>(fn: Promise<T>, signal: AbortSignal, abortReason: string): Promise<T> {
    if (signal.aborted) throw signal.reason
    return new Promise<T>((res, rej) => {
        const onAbort = () => rej(new Error(abortReason))
        signal.addEventListener('abort', onAbort, { once: true })
        fn.then(res).catch(rej).finally(() => signal.removeEventListener('abort', onAbort))
    })
}
```

---

## Priority Summary

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 🔴 P0 | Per-scraper timeout wrapper | Low | Eliminates hangs |
| 🔴 P0 | Socket-level timeout on JSDOM download | Medium | Eliminates hangs |
| 🟠 P1 | Phase logging for debugging | Low | Greatly aids troubleshooting |
| 🟠 P1 | Silent failure handling in scraper loop | Low | Better resilience |
| 🟡 P2 | Pass `minScore`/`minContentLength` to Readability | Trivial | Better parse quality |
| 🟡 P2 | `shouldAttempt` URL heuristics | Low | Avoids known-bad sites |
| 🟢 P3 | Fix typo & code cleanup | Trivial | Code quality |

---

## Quick Win Checklist

- [ ] Wrap each scraper call with `abortAfter()` using `config.scraper.timeout`
- [ ] Add `logger.debug` at each major phase of `BasicHtmlScraper`
- [ ] Pass `minContentLength` and `minScore` to `Readability` constructor
- [ ] Catch scraper failures in the loop (`catch => return null`) so fallback scrapers run
- [ ] Add URL pattern rejection in `BasicHtmlScraper.shouldAttempt()`
- [ ] Fix `mesaage: 'looool'` typo
- [ ] Review/update `.env.example` to match actual config keys (e.g., `SCRAPER_REQUEST_TIMEOUT` vs `SCRAPER_CONTENT_LIMIT`)
