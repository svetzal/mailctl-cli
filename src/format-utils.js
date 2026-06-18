/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(0)} KB`;
}
