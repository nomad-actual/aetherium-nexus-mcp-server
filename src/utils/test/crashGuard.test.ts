import test from 'ava'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)

const crashGuardUrl = fileURLToPath(new URL('../crashGuard.ts', import.meta.url))

type ChildResult = { code: number | null, stdout: string, stderr: string }

/**
 * Run a snippet in a fresh node process with the crash guards installed.
 * The child must outlive a fatal event and print 'STILL ALIVE' — without the
 * guards the process would die on the event instead.
 */
async function runChild(body: string): Promise<ChildResult> {
    const code = `
        import { handleUncaughtErrors } from ${JSON.stringify(crashGuardUrl)}
        handleUncaughtErrors()
        ${body}
        setTimeout(() => console.log('STILL ALIVE'), 200)
    `
    try {
        const { stdout, stderr } = await execFileAsync(
            process.execPath,
            ['--experimental-strip-types', '--input-type=module', '-e', code],
            { timeout: 15_000 },
        )
        return { code: 0, stdout, stderr }
    } catch (err) {
        const e = err as { code?: number | string, stdout?: string, stderr?: string, killed?: boolean }
        return {
            code: typeof e.code === 'number' ? e.code : -1,
            stdout: e.stdout?.toString() ?? '',
            stderr: e.stderr?.toString() ?? '',
        }
    }
}

test('an uncaught exception is logged and the process survives', async (t) => {
    const { code, stdout } = await runChild(`
        setTimeout(() => {
            throw new Error('deliberate test crash')
        }, 5)
    `)

    t.is(code, 0, 'child exited 0')
    t.true(stdout.includes('STILL ALIVE'), 'the process kept running after the exception')
    t.true(stdout.includes('Uncaught exception; process kept alive'), 'the guard logged the event')
    t.true(stdout.includes('deliberate test crash'), 'the error message is in the log')
})

test('an unhandled rejection is logged and the process survives', async (t) => {
    const { code, stdout } = await runChild(`
        void Promise.reject(new Error('deliberate test rejection'))
    `)

    t.is(code, 0, 'child exited 0')
    t.true(stdout.includes('STILL ALIVE'), 'the process kept running after the rejection')
    t.true(stdout.includes('Unhandled promise rejection; process kept alive'), 'the guard logged the event')
    t.true(stdout.includes('deliberate test rejection'), 'the rejection reason is in the log')
})
