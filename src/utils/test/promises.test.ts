import test from 'ava'
import { abort, abortTimeout } from '../promises.ts'

test('abort: resolves with the promise value when it settles first', async (t) => {
    const value = await abort(Promise.resolve(42), new AbortController().signal, 'unused')
    t.is(value, 42)
})

test('abort: rejects with the promise error when it rejects first', async (t) => {
    await t.throwsAsync(
        abort(Promise.reject(new Error('boom')), new AbortController().signal, 'unused'),
        { message: 'boom' },
    )
})

test('abort: rejects with the signal reason when the signal is already aborted', async (t) => {
    const controller = new AbortController()
    controller.abort(new Error('stopped'))
    await t.throwsAsync(abort(Promise.resolve(1), controller.signal, 'fallback'), {
        message: 'stopped',
    })
})

test('abort: rejects with the abort reason when the signal fires before the promise settles', async (t) => {
    const controller = new AbortController()
    const slow = new Promise((resolve) => setTimeout(() => resolve('late'), 50))
    setTimeout(() => controller.abort(), 10)
    await t.throwsAsync(abort(slow, controller.signal, 'aborted early'), {
        message: 'aborted early',
    })
})

test('abortTimeout: resolves when the promise settles before the timeout', async (t) => {
    const value = await abortTimeout(Promise.resolve('done'), 50, 'op')
    t.is(value, 'done')
})

test('abortTimeout: rejects with the timeout error when the timer wins', async (t) => {
    const slow = new Promise((resolve) => setTimeout(resolve, 100))
    await t.throwsAsync(abortTimeout(slow, 10, 'op'), {
        message: 'op timed out after 10ms',
    })
})

test('abortTimeout: rejects with the promise error when it rejects first', async (t) => {
    await t.throwsAsync(abortTimeout(Promise.reject(new Error('fail')), 100, 'op'), {
        message: 'fail',
    })
})
