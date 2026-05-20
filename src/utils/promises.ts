
/**
 * Resolve or reject a promise when an AbortSignal fires.
 * The original promise fn is not cancelled — cleanup is the caller's responsibility.
 */
export async function abort<T>(fn: Promise<T>, signal: AbortSignal, abortReason: string) {
    if (signal.aborted) throw signal.reason;

    return new Promise<T>((res, rej) => {
        const onAbort = () => rej(new Error(abortReason || signal.reason || 'Abort signal received.'));
        signal.addEventListener('abort', onAbort, { once: true });
        
        fn.then(
            (val) => {
                signal.removeEventListener('abort', onAbort);
                res(val);
            },
            (err) => {
                signal.removeEventListener('abort', onAbort);
                rej(err);
            }
        );
    });
}

/**
 * Promise that settles as soon as either `fn` resolves/rejects or the
 * timeout fires. Returns the result of whichever finishes first,
 * or the timeout Error if the timer wins.
 */
export function abortTimeout<T>(
    fn: Promise<T>,
    ms: number,
    label: string,
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${label} timed out after ${ms}ms`))
        }, ms)

        fn
            .then((r) => {
                clearTimeout(timer)
                resolve(r)
            })
            .catch((e) => {
                clearTimeout(timer)
                reject(e)
            })
    })
}

