import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Embed skill content at build time via Bun text imports
// Source of truth lives in skills/ — .claude/skills/ is the installed copy
// @ts-expect-error — Bun text import
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
  return `${content.slice(0, closingIndex)}\nmailctl-version: ${version}${content.slice(closingIndex)}`;
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
 * @param {object} [options]
 * @param {boolean} [options.global] - install to ~/.claude instead of CWD
 * @param {boolean} [options.force] - bypass version guard
 * @returns {Promise<{ version: string, global: boolean, files: FileResult[] }>}
 */
export async function initCommand(version, { global = false, force = false } = {}) {
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
        return { version, global, files: [result] };
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

  return { version, global, files: [result] };
}
