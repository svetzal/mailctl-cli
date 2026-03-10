/**
 * Pure date filter resolution for the search command.
 * Accepts raw CLI option values and returns resolved Date objects plus any warnings.
 * No I/O — same inputs always produce the same outputs.
 */

import { parseDate } from "./parse-date.js";

/**
 * @typedef {object} DateFilterOptions
 * @property {string} [months] - number of months to look back (e.g. "3")
 * @property {string} [since] - date string for lower bound (e.g. "2026-01-15")
 * @property {string} [before] - date string for upper bound (e.g. "2026-03-01")
 */

/**
 * @typedef {object} DateFilterResult
 * @property {Date|undefined} since - resolved lower bound date
 * @property {Date|undefined} before - resolved upper bound date
 * @property {string[]} warnings - informational messages to surface to the user (no side effects)
 */

/**
 * Resolve --months / --since / --before precedence and validation into concrete Date values.
 *
 * Precedence rules:
 * - --since takes precedence over --months when both are given
 * - --months and --before can be combined independently
 *
 * @param {DateFilterOptions} opts
 * @returns {DateFilterResult}
 * @throws {Error} when since >= before
 */
export function resolveDateFilters({ months, since: sinceStr, before: beforeStr }) {
  const warnings = /** @type {string[]} */ ([]);
  let since = /** @type {Date|undefined} */ (undefined);
  let before = /** @type {Date|undefined} */ (undefined);

  if (months && !sinceStr) {
    const d = new Date();
    d.setMonth(d.getMonth() - parseInt(months, 10));
    since = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  if (sinceStr) {
    since = parseDate(sinceStr);
    if (months) {
      warnings.push("Note: --since takes precedence over --months");
    }
  }

  if (beforeStr) {
    before = parseDate(beforeStr);
  }

  if (since && before && since >= before) {
    throw new Error("--since date must be before --before date");
  }

  return { since, before, warnings };
}
