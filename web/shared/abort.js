/**
 * Settles the way `promise` settles, or rejects with the signal's reason the
 * moment the signal aborts, whichever comes first.
 *
 * Nothing here cancels the work behind `promise`: it runs on, and its outcome
 * is dropped. A caller that needs the work itself stopped listens for the
 * abort and stops it. A late rejection is still handled, so it never surfaces
 * as an unhandled rejection.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {AbortSignal} signal
 * @returns {Promise<T>}
 */
export function untilAborted(promise, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
