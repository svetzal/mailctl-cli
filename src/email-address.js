/**
 * Pure helpers for splitting email addresses.
 * Callers continue to apply .toLowerCase() where needed — these are case-neutral.
 */

/**
 * @param {string|null|undefined} address
 * @returns {string}
 */
export function getLocalPart(address) {
  return (address || "").split("@")[0] || "";
}

/**
 * @param {string|null|undefined} address
 * @returns {string}
 */
export function getDomain(address) {
  return (address || "").split("@")[1] || "";
}
