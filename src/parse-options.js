import { parseDate } from "./parse-date.js";

/**
 * Parse a CLI option string as an integer, falling back to `fallback` if the
 * value is null or undefined.
 *
 * @param {string|null|undefined} value
 * @param {number} fallback
 * @returns {number}
 */
export function parseIntOption(value, fallback) {
  return parseInt(value ?? String(fallback), 10);
}

/**
 * Parse a CLI `--since` option string using parseDate, falling back to
 * `parseDate(fallback)` when `value` is absent, or `null` when `fallback` is
 * null/undefined.
 *
 * @overload
 * @param {string|null|undefined} value
 * @param {string} fallback
 * @returns {Date}
 */
/**
 * @overload
 * @param {string|null|undefined} value
 * @param {null|undefined} [fallback]
 * @returns {Date|null}
 */
/**
 * @param {string|null|undefined} value
 * @param {string|null|undefined} [fallback]
 * @returns {Date|null}
 */
export function parseSinceOption(value, fallback) {
  if (value) return parseDate(value);
  return fallback ? parseDate(fallback) : null;
}
