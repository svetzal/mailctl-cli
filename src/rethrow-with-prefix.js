/**
 * Re-throw an error with a user-facing prefix while preserving causal context.
 * The original error is attached as `cause`; any `code` is forwarded so
 * `withErrorHandling` can surface it in --json payloads.
 * @param {unknown} err
 * @param {string} prefix - e.g. "Scan failed"
 * @returns {never}
 */
export function rethrowWithPrefix(err, prefix) {
  const original = err instanceof Error ? err : new Error(String(err));
  const wrapped = new Error(`${prefix}: ${original.message}`, { cause: original });
  if (/** @type {any} */ (original).code !== undefined) {
    /** @type {any} */ (wrapped).code = /** @type {any} */ (original).code;
  }
  throw wrapped;
}
