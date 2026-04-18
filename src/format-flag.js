/**
 * Pure formatting functions for the flag command.
 * No I/O — same inputs always produce the same outputs.
 */

/**
 * @typedef {import("./flag-command.js").FlagResult} FlagResult
 * @typedef {import("./flag-command.js").FlagStats} FlagStats
 */

/**
 * Format a human-readable summary of flag operation results.
 *
 * @param {FlagStats} stats
 * @param {FlagResult[]} results - array of per-account flag results
 * @returns {string}
 */
export function formatFlagResultText(stats, results) {
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
 * Build a JSON-ready object for flag operation results.
 *
 * @param {FlagStats} stats
 * @param {FlagResult[]} results
 * @returns {object}
 */
export function buildFlagResultJson(stats, results) {
  return { ...stats, results };
}
