/**
 * Lightweight debug logger. Set DEBUG=mailctl to enable.
 * @param {string} context - Module or operation name
 * @param {string} message - Description of what happened
 * @param {unknown} [err] - Optional error object
 */
export function debug(context, message, err) {
  if (process.env.DEBUG === "mailctl") {
    if (err) {
      console.error(`[mailctl:${context}] ${message}`, err);
    } else {
      console.error(`[mailctl:${context}] ${message}`);
    }
  }
}
