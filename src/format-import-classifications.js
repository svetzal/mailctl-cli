/**
 * @param {number} imported - count of imported classifications
 * @param {string} path - path to the output file
 * @returns {{ imported: number, path: string }}
 */
export function buildImportClassificationsJson(imported, path) {
  return { imported, path };
}
