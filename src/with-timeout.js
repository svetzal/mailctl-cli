/**
 * Races a promise factory against a timer.
 *
 * NOTE: On timeout the underlying operation is abandoned, not cancelled.
 * Callers should account for this — e.g. the IMAP connection may still be
 * in-flight after withTimeout rejects, but subsequent messages on the same
 * connection will still work once the current operation eventually completes
 * or errors on the server side.
 *
 * @template T
 * @param {() => Promise<T>} promiseFactory - factory called once; result races against the timer
 * @param {number} ms - timeout in milliseconds
 * @param {string} [label] - description included in the timeout error message
 * @returns {Promise<T>}
 */
export function withTimeout(promiseFactory, ms, label = "operation") {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const err = new Error(`Timed out after ${ms}ms: ${label}`);
      /** @type {any} */ (err).code = "ETIMEDOUT";
      reject(err);
    }, ms);

    promiseFactory().then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
