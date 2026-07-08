import { createFormatOutput } from "./cli-helpers.js";

/**
 * @typedef {import("./init.js").TargetActionKind} TargetActionKind
 * @typedef {import("./init.js").TargetResult} TargetResult
 * @typedef {import("./init.js").InitResult} InitFormatInput
 */

/** @type {Record<TargetActionKind, string>} */
const ACTION_ICONS = {
  install: "+",
  update: "~",
  downgrade: "~",
  skip: "=",
  "drifted-skip": "!",
  "refuse-newer": "!",
};

/** @type {Record<TargetActionKind, string>} */
const ACTION_LABELS = {
  install: "Installed",
  update: "Updated",
  downgrade: "Downgraded",
  skip: "Up to date",
  "drifted-skip": "Skipped (drifted)",
  "refuse-newer": "Skipped (newer installed)",
};

const BLOCKED_ACTIONS = new Set(["drifted-skip", "refuse-newer"]);

/**
 * @param {InitFormatInput} result - init command result
 * @returns {string}
 */
export function formatInitText(result) {
  const { version, targets } = result;
  const scope = result.scope === "global" ? "global (user home)" : "local (project)";
  const lines = [];

  lines.push(`\nmailctl v${version} — companion skill install (${scope})\n`);

  if (targets.length === 0) {
    lines.push("  No target platforms resolved.");
  }

  for (const target of targets) {
    const icon = ACTION_ICONS[target.action] ?? "=";
    const label = ACTION_LABELS[target.action] ?? target.action;
    lines.push(`  ${icon} ${target.platform} (${label})`);
    if (target.warning) {
      lines.push(`    ${target.warning}`);
    }
  }

  lines.push("");

  return lines.join("\n");
}

/**
 * @param {InitFormatInput} result - init command result
 * @returns {{ success: boolean, message: string, version: string, scope: string, targets: TargetResult[] }}
 */
export function buildInitJson(result) {
  const { version, scope, targets } = result;
  const blocked = targets.filter((t) => BLOCKED_ACTIONS.has(t.action));
  const written = targets.filter((t) => !BLOCKED_ACTIONS.has(t.action) && t.action !== "skip");

  const message =
    blocked.length > 0
      ? `Skill install skipped on ${blocked.length} platform(s)`
      : `Skill installed on ${written.length || targets.length} platform(s)`;

  return {
    success: blocked.length === 0,
    message,
    version,
    scope,
    targets,
  };
}

/** @type {(json: boolean, result: InitFormatInput) => string} */
export const formatInitOutput = createFormatOutput(buildInitJson, formatInitText);
