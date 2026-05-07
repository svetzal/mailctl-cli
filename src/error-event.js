/**
 * @typedef {"warning" | "error"} ErrorSeverity
 * warning = recoverable, operation continues (e.g., single search term failed, lock retry)
 * error = item-level failure, item skipped (e.g., move failed, download failed)
 */

/**
 * @param {string} type - existing event type string (e.g., "move-error")
 * @param {ErrorSeverity} severity
 * @param {Error} error
 * @param {object} [context] - additional fields (mailbox, uid, filename, etc.)
 * @returns {{ type: string, severity: ErrorSeverity, error: Error } & object}
 */
export function errorEvent(type, severity, error, context = {}) {
  return { type, severity, error, ...context };
}
