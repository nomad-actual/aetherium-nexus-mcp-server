import test from 'ava'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.d.ts'
import { trackPakages } from '../trackpackage.ts'
import type { McpToolContent } from '../../types.ts'
import { getConfig } from '../../utils/config.ts'

// Checksum-valid UPS numbers that ts-tracking-number recognizes.
const UPS = ['1Z999AA10123456784', '1Z999AA10123456793', '1Z999AA10123456800']

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function firstText(result: CallToolResult): string {
    const [item] = result.content ?? []
    return item && 'text' in item ? item.text : ''
}

test('scrapes run concurrently so the total is bounded by one scrape', async (t) => {
    let inFlight = 0
    let maxInFlight = 0

    const scrape = async (url: string): Promise<McpToolContent[]> => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await sleep(150)
        inFlight--
        return [{ type: 'text', text: `content for ${url}` }]
    }

    const result = await trackPakages(
        { packages: UPS },
        getConfig(),
        new AbortController().signal,
        scrape,
    )

    t.true(
        maxInFlight >= 2,
        `scrapes overlapped (max concurrency ${maxInFlight}; the old sequential loop never exceeded 1)`,
    )
    t.is(firstText(result), 'Found 3 of 3 packages')
    // header + per package: one tracking-info item + one scraped item
    t.is(result.content?.length, 1 + 3 * 2)
})

test('a failing scrape does not fail the other packages', async (t) => {
    const scrape = async (url: string): Promise<McpToolContent[]> => {
        if (url.includes('1Z999AA10123456793')) throw new Error('boom')
        return [{ type: 'text', text: `content for ${url}` }]
    }

    const result = await trackPakages(
        { packages: UPS },
        getConfig(),
        new AbortController().signal,
        scrape,
    )

    t.is(firstText(result), 'Found 2 of 3 packages')
})

test('unrecognized tracking numbers are not scraped or counted', async (t) => {
    const scrape = async () => {
        t.fail('no scrape should be attempted')
        return []
    }

    const result = await trackPakages(
        { packages: ['NOT-A-TRACKING-NUMBER'] },
        getConfig(),
        new AbortController().signal,
        scrape,
    )

    t.is(firstText(result), 'Found 0 of 1 packages')
    t.is(result.content?.length, 1)
})

test('duplicate tracking numbers are deduped', async (t) => {
    let calls = 0
    const scrape = async (url: string): Promise<McpToolContent[]> => {
        calls++
        return [{ type: 'text', text: `content for ${url}` }]
    }

    const result = await trackPakages(
        { packages: [UPS[0], UPS[0]] },
        getConfig(),
        new AbortController().signal,
        scrape,
    )

    t.is(calls, 1)
    t.is(firstText(result), 'Found 1 of 1 packages')
})

test('an empty package list is rejected before any scrape', async (t) => {
    const scrape = async () => {
        t.fail('no scrape should be attempted')
        return []
    }

    const result = await trackPakages(
        { packages: [] },
        getConfig(),
        new AbortController().signal,
        scrape,
    )

    t.is(firstText(result), 'No packages provided')
})
