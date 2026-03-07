/**
 * Pure helper functions used by the CLI layer.
 * No I/O, no Commander imports — these are isolated and testable.
 */

/**
 * Sanitize a value for safe JSON output.
 * Removes control characters (except \n and \t) when the value is a string.
 * Non-string values are returned unchanged.
 * @param {*} str
 * @returns {*}
 */
export function sanitizeString(str) {
  if (typeof str !== "string") return str;
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}

/**
 * Convert a mailparser header value to a JSON-friendly representation.
 * @param {*} value
 * @returns {string|string[]}
 */
export function headerValueToString(value) {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (value?.text) return value.text;
  if (value?.value) return value.value;
  if (Array.isArray(value)) return /** @type {string[]} */ (value.map(headerValueToString).flat());
  return String(value);
}

/**
 * Collect option values that can be specified multiple times or as comma-separated.
 * Commander calls this reducer for each --option occurrence.
 * @param {string} value - new value from the CLI flag
 * @param {string[]} previous - accumulated values so far
 * @returns {string[]}
 */
export function collectValues(value, previous) {
  const items = value.split(",").map((s) => s.trim()).filter(Boolean);
  return previous.concat(items);
}

/**
 * Filter an accounts array by name.
 * When name is null or undefined, all accounts are returned (no filtering).
 * Matching is case-insensitive.
 *
 * @template {{ name: string }} T
 * @param {T[]} accounts
 * @param {string|null|undefined} name
 * @returns {T[]}
 */
export function filterAccountsByName(accounts, name) {
  if (!name) return accounts;
  const lower = name.toLowerCase();
  return accounts.filter((a) => a.name.toLowerCase() === lower);
}
