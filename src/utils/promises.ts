
export async function timeout(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// abort promise

export async function abort<T>(fn: Promise<T>, signal: AbortSignal, abortReason: string) {
    const _signal = signal
    
    return new Promise<T>((res, rej) => {
        if (_signal.aborted) {
            rej(signal?.reason)
            return
        }

        fn.then(res).catch(rej)

        _signal.addEventListener('abort', () => {
            rej(abortReason || _signal.reason || 'Abort signal received.')
        })
    })
}

