import logger from './logger.ts'

/**
 * Process-level safety net.
 *
 * Node terminates the process on (1) uncaught exceptions — which also
 * includes 'error' events emitted on an EventEmitter that has no listener
 * (e.g. undici's HTTP/2 client destroying an idle keep-alive socket and
 * erroring a stream after its listeners were removed) — and (2) unhandled
 * promise rejections (fatal by default since Node 15).
 *
 * The server is stateless: every /mcp request builds its own transport and
 * server instance, so a fault inside one operation does not corrupt shared
 * state. Registering a handler turns the crash into a logged error — the
 * failing operation dies, but the process keeps serving.
 */
const onUncaughtException = (err: unknown): void => {
    logger.error({ err: toError(err) }, 'Uncaught exception; process kept alive')
}

const onUnhandledRejection = (reason: unknown): void => {
    logger.error({ err: toError(reason) }, 'Unhandled promise rejection; process kept alive')
}

let installed = false

export function handleUncaughtErrors(): void {
    if (installed) return
    installed = true
    process.on('uncaughtException', onUncaughtException)
    process.on('unhandledRejection', onUnhandledRejection)
}

function toError(value: unknown): Error {
    if (value instanceof Error) return value
    if (typeof value === 'string') return new Error(value)
    return new Error(`Unexpected non-Error value: ${String(value)}`)
}
