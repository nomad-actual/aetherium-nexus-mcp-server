import test from 'ava'
import { MAX_CONCURRENT_SCRAPES, withScrapeSlot } from '../scrapeSlots.ts'

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// The slot state is module-global (a process-wide cap), so these tests must
// not run concurrently with each other.

test.serial('withScrapeSlot bounds concurrency at MAX_CONCURRENT_SCRAPES', async (t) => {
    let active = 0
    let peak = 0

    const worker = () =>
        withScrapeSlot(async () => {
            active++
            peak = Math.max(peak, active)
            await sleep(50)
            active--
        })

    const workers = Array.from({ length: MAX_CONCURRENT_SCRAPES + 3 }, () => worker())
    await Promise.allSettled(workers)

    t.true(peak <= MAX_CONCURRENT_SCRAPES, `peak concurrency was ${peak}`)
    t.true(peak > 1, 'slots actually overlapped')
})

test.serial('withScrapeSlot serves waiters in FIFO order', async (t) => {
    // Hold every permit, then queue two waiters and free the permits.
    const releaseHolders: Array<() => void> = []
    const holders = Array.from({ length: MAX_CONCURRENT_SCRAPES }, () =>
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
    const fill = Array.from({ length: MAX_CONCURRENT_SCRAPES }, () =>
        withScrapeSlot(async () => {
            active++
            peak = Math.max(peak, active)
            await sleep(50)
            active--
        }),
    )
    await Promise.all(fill)
    t.is(peak, MAX_CONCURRENT_SCRAPES, 'all permits are free after a rejection')
})
