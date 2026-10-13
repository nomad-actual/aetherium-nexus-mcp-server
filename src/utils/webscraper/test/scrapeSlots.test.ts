// Small explicit limit so the tests stay fast. Must be set before the first
// getConfig() call in this worker.
process.env.SCRAPER_MAX_CONCURRENT = '3'

import test from 'ava'
import { getConfig } from '../../config.ts'
import { withScrapeSlot } from '../scrapeSlots.ts'

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// The slot state is module-global (a process-wide cap), so these tests must
// not run concurrently with each other.

test.serial('withScrapeSlot bounds concurrency at the configured limit', async (t) => {
    const limit = getConfig().scraper.maxConcurrent
    t.is(limit, 3, 'the SCRAPER_MAX_CONCURRENT env var reached the config')

    let active = 0
    let peak = 0

    const worker = () =>
        withScrapeSlot(async () => {
            active++
            peak = Math.max(peak, active)
            await sleep(50)
            active--
        })

    const workers = Array.from({ length: limit + 3 }, () => worker())
    await Promise.allSettled(workers)

    t.true(peak <= limit, `peak concurrency was ${peak}`)
    t.true(peak > 1, 'slots actually overlapped')
})

test.serial('withScrapeSlot serves waiters in FIFO order', async (t) => {
    // Hold every permit, then queue two waiters and free the permits.
    const releaseHolders: Array<() => void> = []
    const holders = Array.from({ length: getConfig().scraper.maxConcurrent }, () =>
        withScrapeSlot(async () => {
            await new Promise<void>((resolve) => releaseHolders.push(resolve))
        }),
    )

    const order: string[] = []
    const waiterA = withScrapeSlot(async () => {
        order.push('A')
    })
    const waiterB = withScrapeSlot(async () => {
        order.push('B')
    })

    // Let both waiters enqueue, then free every permit at once.
    await sleep(25)
    releaseHolders.forEach((release) => release())
    await Promise.allSettled([...holders, waiterA, waiterB])

    t.deepEqual(order, ['A', 'B'])
})

test.serial('withScrapeSlot releases the permit when fn rejects', async (t) => {
    const boom = () => Promise.reject(new Error('boom'))

    await withScrapeSlot(boom).then(
        () => t.fail('expected rejection'),
        (err: Error) => t.is(err.message, 'boom'),
    )

    // If the permit leaked, the fill below could not reach full concurrency.
    let active = 0
    let peak = 0
    const fill = Array.from({ length: getConfig().scraper.maxConcurrent }, () =>
        withScrapeSlot(async () => {
            active++
            peak = Math.max(peak, active)
            await sleep(50)
            active--
        }),
    )
    await Promise.all(fill)
    t.is(peak, getConfig().scraper.maxConcurrent, 'all permits are free after a rejection')
})
