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

/**
 * Format a date as "Mon DD at HH:MM" (e.g. "Jan 05 at 14:30").
 * Returns "" for invalid or non-Date values.
 *
 * Built deterministically rather than via a single `toLocaleString` call:
 * the date/time separator that `toLocaleString("en-US")` emits is
 * ICU-version-dependent (some runtimes produce "Jan 05, 14:30", others
 * "Jan 05 at 14:30"), which made this format vary between local and CI.
 *
 * @param {unknown} date
 * @returns {string}
 */
export function formatDatetime(date) {
  if (!isValidDate(date)) return "";
  const d = /** @type {Date} */ (date);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatShortDate(d)} at ${hh}:${mm}`;
}

/**
 * Format a date as today's time ("HH:MM") if it's today, otherwise as "Mon DD".
 * Returns "" for invalid or non-Date values.
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatMessageDate(date) {
  if (!isValidDate(date)) return "";
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  if (isToday) {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return formatShortDate(date);
}

/**
 * Format a date as "Mon DD, YYYY" (e.g. "Jan 05, 2026").
 * Returns "" for invalid or non-Date values.
 *
 * @param {unknown} date
 * @returns {string}
 */
export function formatShortDateWithYear(date) {
  if (!isValidDate(date)) return "";
  return /** @type {Date} */ (date).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}
