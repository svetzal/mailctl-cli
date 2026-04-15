/**
 * Pure formatting functions for the flag command.
 * No I/O — same inputs always produce the same outputs.
 */

/**
 * @typedef {import("./flag-command.js").FlagResult} FlagResult
 */

/**
 * Format a human-readable summary of flag operation results.
 *
 * @param {FlagResult[]} results - array of per-account flag results
 * @returns {string}
 */
export function formatFlagResultText(results) {
  const lines = [];

  for (const flagResult of results) {
    const uidRange = flagResult.uids.join(",");
    const parts = [...flagResult.added.map((f) => `+${f}`), ...flagResult.removed.map((f) => `-${f}`)];
    const label = flagResult.uids.length === 1 ? `UID ${uidRange}` : `UIDs ${uidRange}`;

    if (flagResult.dryRun) {
      lines.push(`[DRY RUN] Would flag ${label}: ${parts.join(" ")}`);
    } else {
      lines.push(`Flagged ${label}: ${parts.join(" ")}`);
    }
  }

  return lines.join("\n");
}

/**
 * Build JSON-ready objects for flag operation results.
 * Dry-run results include { dryRun: true, ...rest }; live results omit the dryRun field.
 *
 * @param {FlagResult[]} results
 * @returns {object[]}
 */
export function buildFlagResultJson(results) {
  return results.map((flagResult) => {
    const { dryRun, ...rest } = flagResult;
    return dryRun ? { dryRun: true, ...rest } : rest;
  });
}
