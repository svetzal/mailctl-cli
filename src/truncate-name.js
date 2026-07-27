/**
 * Single home for the "truncate a derived name to a max length without
 * cutting a token in half" rule shared across vendor-name and receipt
 * base-name derivation. A token separator is any of hyphen, underscore,
 * dot, or whitespace.
 */

const SEPARATOR_PATTERN = /[-._\s]/g;
const TRAILING_SEPARATORS_PATTERN = /[-._\s]+$/;

/**
 * Truncates `value` to at most `maxLength` characters.
 * When the hard cut lands mid-token, backs off to the last separator —
 * but only when that separator falls past the midpoint of the cut, so a
 * single token longer than `maxLength` degrades to a hard cut rather than
 * being emptied out entirely. Trailing separators are stripped either way.
 *
 * @param {string} value
 * @param {number} maxLength
 * @returns {string}
 */
export function truncateAtTokenBoundary(value, maxLength) {
  if (value.length <= maxLength) return value;

  const cut = value.slice(0, maxLength);

  let lastSeparatorIndex = -1;
  for (const match of cut.matchAll(SEPARATOR_PATTERN)) {
    lastSeparatorIndex = match.index;
  }

  const truncated = lastSeparatorIndex > maxLength / 2 ? cut.slice(0, lastSeparatorIndex) : cut;
  return truncated.replace(TRAILING_SEPARATORS_PATTERN, "");
}
