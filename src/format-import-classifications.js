import { formatOutput } from "./cli-helpers.js";

/**
 * @param {number} imported - count of imported classifications
 * @param {string} path - path to the output file
 * @returns {{ imported: number, path: string }}
 */
export function buildImportClassificationsJson(imported, path) {
  return { imported, path };
}

/**
 * @param {boolean} json
 * @param {number} imported
 * @param {string} path
 * @returns {string}
 */
export function formatImportClassificationsOutput(json, imported, path) {
  return formatOutput(
    json,
    buildImportClassificationsJson(imported, path),
    `Imported ${imported} classifications to ${path}`,
  );
}
