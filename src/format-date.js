/**
 * @param {unknown} date
 * @returns {boolean}
 */
export function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

/**
 * Format a date as "Mon DD" (e.g. "Jan 01").
 * Returns "" for invalid or non-Date values.
 *
 * @param {unknown} date
 * @returns {string}
 */
export function formatShortDate(date) {
  if (!isValidDate(date)) return "";
  return /** @type {Date} */ (date).toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}
