/**
 * Pure formatting functions for the init command.
 * No I/O — same inputs always produce the same outputs.
 */

/**
 * @typedef {import("./init.js").FileAction} FileAction
 * @typedef {import("./init.js").FileResult} FileResult
 */

/**
 * @typedef {object} InitFormatInput
 * @property {string} version - mailctl version string
 * @property {boolean} global - true if installed globally to ~/.claude
 * @property {FileResult[]} files - list of file operation results
 */

/** @type {Record<string, string>} */
const ACTION_ICONS = {
  created: "+",
  updated: "~",
  skipped: "!",
};

/** @type {Record<string, string>} */
const ACTION_LABELS = {
  created: "Created",
  updated: "Updated",
  skipped: "Skipped",
};

/**
 * Format a human-readable init result summary.
 *
 * @param {InitFormatInput} result - init command result
 * @returns {string}
 */
export function formatInitResultText(result) {
  const { version, files } = result;
  const scope = result.global ? "global (~/.claude)" : "local";
  const lines = [];

  lines.push(`\nmailctl v${version} — skill files (${scope})\n`);

  for (const r of files) {
    const icon = ACTION_ICONS[r.action] ?? "=";
    const label = ACTION_LABELS[r.action] ?? "Up to date";
    lines.push(`  ${icon} ${r.path} (${label})`);
    if (r.warning) {
      lines.push(`    ${r.warning}`);
    }
  }

  lines.push("");

  return lines.join("\n");
}

/**
 * Build a plain object suitable for JSON serialisation of an init result.
 *
 * @param {InitFormatInput} result - init command result
 * @returns {{ success: boolean, message: string, version: string, files: FileResult[] }}
 */
export function buildInitJsonResult(result) {
  const { version, files } = result;
  const skipped = files.filter((r) => r.action === "skipped").length;

  return {
    success: skipped === 0,
    message: skipped > 0 ? "Skill install skipped" : `Skill ${files[0]?.action ?? ""}`,
    version,
    files,
  };
}
