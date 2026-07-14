/**
 * Programmer-error detection.
 *
 * A TypeError, ReferenceError, RangeError, or SyntaxError thrown from classification
 * or filename-derivation code signals a programming defect, not an operational failure.
 * Swallowing it with a broad catch would degrade the run silently ("no receipt found")
 * while hiding a bug that needs fixing. These must escalate to the command boundary.
 *
 * The one exception: Node I/O errors occasionally surface as TypeError (e.g. passing a
 * bad path type to fs.readFile). When an error carries a Node I/O code (ENOENT, EACCES,
 * ETIMEDOUT, …) we treat it as operational regardless of its constructor.
 */

const PROGRAMMER_ERROR_CLASSES = new Set(["TypeError", "ReferenceError", "RangeError", "SyntaxError"]);

/**
 * Returns true when `err` represents a programming defect rather than a recoverable
 * I/O failure. A TypeError/ReferenceError/RangeError/SyntaxError qualifies unless it
 * also carries a Node I/O `code` property (e.g. ENOENT, EACCES, ETIMEDOUT), which
 * marks it as operational despite its class.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isProgrammerError(err) {
  if (!(err instanceof Error)) return false;
  if (!PROGRAMMER_ERROR_CLASSES.has(err.constructor.name)) return false;
  // A Node I/O code means the platform threw through a JS error class — still operational.
  const code = /** @type {any} */ (err).code;
  return typeof code !== "string" || code.length === 0;
}

/**
 * Throws `err` when it is a programmer error; otherwise returns undefined so the
 * caller can proceed with its normal per-item degradation path.
 *
 * @param {unknown} err
 * @returns {void}
 */
export function rethrowIfProgrammerError(err) {
  if (isProgrammerError(err)) throw err;
}
