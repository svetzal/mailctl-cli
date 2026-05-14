import { createFormatOutput } from "./cli-helpers.js";

/**
 * @param {{ downloaded: number, alreadyHave: number, noPdf: number, skipped: number }} stats
 * @returns {string}
 */
export function formatDownloadText(stats) {
  return [
    "\n=== Download Complete ===",
    `Downloaded:    ${stats.downloaded}`,
    `Already had:   ${stats.alreadyHave}`,
    `No PDF:        ${stats.noPdf}`,
    `Skipped/Error: ${stats.skipped}`,
  ].join("\n");
}

/**
 * @param {{ downloaded: number, alreadyHave: number, noPdf: number, skipped: number }} stats
 * @returns {object}
 */
export function buildDownloadJson(stats) {
  return {
    downloaded: stats.downloaded,
    alreadyHave: stats.alreadyHave,
    noPdf: stats.noPdf,
    skipped: stats.skipped,
  };
}

export const formatDownloadOutput = createFormatOutput(buildDownloadJson, formatDownloadText);
