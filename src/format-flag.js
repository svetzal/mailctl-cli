import { createFormatOutput } from "./cli-helpers.js";

/**
 * @typedef {import("./commands/flag-command.js").FlagResult} FlagResult
 * @typedef {import("./commands/flag-command.js").FlagStats} FlagStats
 */

/**
 * @param {FlagStats} stats
 * @param {FlagResult[]} results - array of per-account flag results
 * @returns {string}
 */
export function formatFlagText(stats, results) {
  const lines = [];

  for (const flagResult of results) {
    if (flagResult.status === "failed") {
      lines.push(`Error (${flagResult.account}): ${flagResult.error}`);
      continue;
    }
    const uidRange = (flagResult.uids ?? []).join(",");
    const parts = [...(flagResult.added ?? []).map((f) => `+${f}`), ...(flagResult.removed ?? []).map((f) => `-${f}`)];
    const label = (flagResult.uids ?? []).length === 1 ? `UID ${uidRange}` : `UIDs ${uidRange}`;

    if (flagResult.dryRun) {
      lines.push(`[DRY RUN] Would flag ${label}: ${parts.join(" ")}`);
    } else {
      lines.push(`Flagged ${label}: ${parts.join(" ")}`);
    }
  }

  lines.push(`\nSummary: ${stats.flagged} flagged, ${stats.failed} failed, ${stats.skipped} skipped`);
  return lines.join("\n");
}

/**
 * @param {FlagStats} stats
 * @param {FlagResult[]} results
 * @returns {object}
 */
export function buildFlagJson(stats, results) {
  return { ...stats, results };
}

/** @type {(json: boolean, stats: FlagStats, results: FlagResult[]) => string} */
export const formatFlagOutput = createFormatOutput(buildFlagJson, formatFlagText);
