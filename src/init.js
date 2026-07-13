import { BundledSkill, ConfigPaths, NodeFilesystem, SkillInstaller, SystemClock, ToolIdentity } from "cmx-core";

// Embed skill content at build time via Bun text imports
// Source of truth lives in skills/ — the installed copies are managed by cmx-core,
// which reconciles metadata.version into the frontmatter from the binary version.
// @ts-expect-error — Bun text import
import SKILL_MD from "../skills/mailctl/SKILL.md" with { type: "text" };

const TOOL_NAME = "mailctl";

/**
 * @typedef {"install" | "update" | "skip" | "drifted-skip" | "refuse-newer" | "downgrade"} TargetActionKind
 */

/**
 * @typedef {object} TargetResult
 * @property {string} platform - platform slug (claude, codex, hermes, …)
 * @property {TargetActionKind} action - what happened for this platform
 * @property {string} [warning] - human-readable note (e.g. newer version installed)
 */

/**
 * @typedef {object} InitResult
 * @property {string} version - mailctl version installed
 * @property {"global" | "local"} scope - install scope
 * @property {TargetResult[]} targets - per-platform results, in resolution order
 */

/**
 * Build a warning string for the non-writing / blocked actions that carry an
 * installed version. Pure.
 * @param {import("cmx-core").TargetAction} action
 * @returns {string | undefined}
 */
export function warningFor(action) {
  if (action.kind === "refuse-newer") {
    return `Installed skill is from a newer version (v${action.installed}). Use --force to downgrade.`;
  }
  if (action.kind === "drifted-skip") {
    return `Installed skill (v${action.installed}) has local edits. Use --force to overwrite.`;
  }
  return undefined;
}

/**
 * Map cmx-core plan/outcome targets to mailctl's normalized init result. Pure —
 * unit-tested against fabricated targets; the imperative shell in initCommand
 * feeds it the real plan.
 * @param {string} version - mailctl version
 * @param {"global" | "local"} scope
 * @param {ReadonlyArray<{ platform: string, action: import("cmx-core").TargetAction }>} targets
 * @returns {InitResult}
 */
export function buildInitResult(version, scope, targets) {
  return {
    version,
    scope,
    targets: targets.map((target) => {
      /** @type {TargetResult} */
      const result = { platform: target.platform, action: target.action.kind };
      const warning = warningFor(target.action);
      if (warning !== undefined) {
        result.warning = warning;
      }
      return result;
    }),
  };
}

/**
 * @typedef {object} InitCommandOptions
 * @property {boolean} [local] - install into the current project instead of the user home
 * @property {boolean} [force] - overwrite drifted/newer installs
 * @property {{ plan: function, apply: function }} [_installer] - override for testing
 * @property {import("cmx-core").InstallerContext} [_context] - override for testing
 */

/**
 * Install the mailctl companion skill across every cmx-managed platform.
 *
 * Targets are resolved by cmx-core from `~/.config/context-mixer/config.json`
 * (`platforms: [...]`); with no managed list it falls back to platforms with an
 * existing cmx lockfile, then to claude. Version stamping and the newer-install
 * guard are owned by cmx-core's lockfiles, not by mailctl.
 *
 * @param {string} version - current mailctl version
 * @param {InitCommandOptions} [options]
 * @returns {Promise<InitResult>}
 */
export async function initCommand(version, { local = false, force = false, _installer, _context } = {}) {
  /** @type {"global" | "local"} */
  const scope = local ? "local" : "global";
  const installer = _installer ?? new SkillInstaller(new ToolIdentity(TOOL_NAME, version));
  const skill = BundledSkill.singleMd(SKILL_MD);
  /** @type {import("cmx-core").InstallerContext} */
  const context = _context ?? {
    fs: new NodeFilesystem(),
    clock: new SystemClock(),
    paths: ConfigPaths.fromEnv("claude"),
  };

  const plan = await installer.plan(skill, scope, force, context);

  // apply() refuses the whole plan if any target is a newer-install (refuse-newer).
  // Drop those targets so the remaining platforms still install; the skipped ones
  // are still reported (from the original plan) with a --force hint.
  const writable = plan.targets.filter((target) => target.action.kind !== "refuse-newer");
  if (writable.length > 0) {
    await installer.apply(skill, { ...plan, targets: writable }, context);
  }

  return buildInitResult(version, scope, plan.targets);
}
