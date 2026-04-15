/**
 * Pure formatting functions for the import-classifications command.
 * No I/O — same inputs always produce the same outputs.
 */

/**
 * Build a JSON-ready object for an import-classifications result.
 *
 * @param {number} imported - count of imported classifications
 * @param {string} path - path to the output file
 * @returns {{ imported: number, path: string }}
 */
export function buildImportClassificationsJson(imported, path) {
  return { imported, path };
}
