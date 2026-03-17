import { mkdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

// Embed skill content at build time via Bun text imports
// Source of truth lives in skills/ — .claude/skills/ is the installed copy
// @ts-ignore — Bun text import
import SKILL_MD from "../skills/mailctl/SKILL.md" with { type: "text" };

/**
 * @typedef {"created" | "updated" | "up-to-date" | "skipped"} FileAction
 */

/**
 * @typedef {object} FileResult
 * @property {string} path
 * @property {FileAction} action
 * @property {string} [warning]
 */

/**
 * @typedef {object} InitResult
 * @property {boolean} success
 * @property {string} message
 * @property {string} version
 * @property {FileResult[]} files
 */

/**
 * Stamp mailctl-version into YAML frontmatter.
 * @param {string} content - skill file content with YAML frontmatter
 * @param {string} version - version string to stamp
 * @returns {string}
 */
export function stampVersion(content, version) {
  const closingIndex = content.indexOf("\n---", 1);
  if (closingIndex === -1) return content;
  return content.slice(0, closingIndex) + `\nmailctl-version: ${version}` + content.slice(closingIndex);
}

/**
 * Strip the mailctl-version field from frontmatter for content comparison.
 * @param {string} content
 * @returns {string}
 */
export function stripVersionInfo(content) {
  return content.replace(/\nmailctl-version: .+/g, "");
}

/**
 * Parse the mailctl-version from installed file content.
 * @param {string} content
 * @returns {string | null}
 */
export function parseInstalledVersion(content) {
  const match = content.match(/\nmailctl-version:\s*(.+)/);
  return match ? match[1].trim() : null;
}

/**
 * Compare two semver strings. Returns -1, 0, or 1.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

/**
 * Install mailctl skill files.
 * @param {string} version - current mailctl version
 * @param {object} options
 * @param {boolean} [options.json] - output as JSON
 * @param {boolean} [options.global] - install to ~/.claude instead of CWD
 * @param {boolean} [options.force] - bypass version guard
 */
export async function initCommand(version, { json = false, global = false, force = false } = {}) {
  const baseDir = global ? join(homedir(), ".claude") : process.cwd();
  const relativePath = global ? "skills/mailctl/SKILL.md" : ".claude/skills/mailctl/SKILL.md";
  const fullPath = join(baseDir, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  const stamped = stampVersion(SKILL_MD, version);

  /** @type {FileResult} */
  let result;

  const fileRef = Bun.file(fullPath);

  if (!(await fileRef.exists())) {
    await mkdir(dir, { recursive: true });
    await Bun.write(fullPath, stamped);
    result = { path: relativePath, action: "created" };
  } else {
    const existing = await fileRef.text();

    // Version guard: refuse to overwrite a newer installed skill
    const installedVersion = parseInstalledVersion(existing);
    if (installedVersion && compareSemver(installedVersion, version) > 0) {
      if (!force) {
        const warning = `Installed skill is from mailctl v${installedVersion} but this binary is v${version}. Use --force to downgrade.`;
        result = { path: relativePath, action: "skipped", warning };
        outputResult(version, [result], { json, global });
        return;
      }
    }

    const existingBody = stripVersionInfo(existing);
    const newBody = SKILL_MD;

    if (existingBody === newBody) {
      if (existing !== stamped) {
        await Bun.write(fullPath, stamped);
      }
      result = { path: relativePath, action: "up-to-date" };
    } else {
      await Bun.write(fullPath, stamped);
      result = { path: relativePath, action: "updated" };
    }
  }

  outputResult(version, [result], { json, global });
}

/**
 * Output init results in JSON or human-readable format.
 * @param {string} version
 * @param {FileResult[]} results
 * @param {object} options
 * @param {boolean} options.json
 * @param {boolean} options.global
 */
function outputResult(version, results, { json, global }) {
  const skipped = results.filter(r => r.action === "skipped").length;

  if (json) {
    /** @type {InitResult} */
    const output = {
      success: skipped === 0,
      message: skipped > 0
        ? `Skill install skipped`
        : `Skill ${results[0].action}`,
      version,
      files: results,
    };
    console.log(JSON.stringify(output));
  } else {
    const scope = global ? "global (~/.claude)" : "local";
    console.log(`\nmailctl v${version} — skill files (${scope})\n`);
    for (const r of results) {
      const icon =
        r.action === "created" ? "+" :
        r.action === "updated" ? "~" :
        r.action === "skipped" ? "!" :
        "=";
      const label =
        r.action === "created" ? "Created" :
        r.action === "updated" ? "Updated" :
        r.action === "skipped" ? "Skipped" :
        "Up to date";
      console.log(`  ${icon} ${r.path} (${label})`);
      if (r.warning) {
        console.log(`    ${r.warning}`);
      }
    }
    console.log();
  }
}
