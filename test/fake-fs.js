/**
 * In-memory double for FileSystemGateway so tests never touch the real disk.
 * Only suites under test/gateways/ may perform real filesystem I/O.
 */
import { dirname, normalize } from "node:path";

/**
 * @param {string} code
 * @param {string} op
 * @param {string} path
 * @returns {Error & { code: string }}
 */
function fsError(code, op, path) {
  const err = /** @type {Error & { code: string }} */ (new Error(`${code}: ${op} '${path}'`));
  err.code = code;
  return err;
}

/**
 * @returns {import("../src/gateways/fs-gateway.js").FileSystemGateway}
 */
export function makeFakeFs() {
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  /** @type {Set<string>} */
  const dirs = new Set();

  /** @param {string} path */
  const registerDirWithAncestors = (path) => {
    let current = normalize(path);
    while (!dirs.has(current)) {
      dirs.add(current);
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  };

  /** @param {string} path */
  const readBuffer = (path) => {
    const content = files.get(normalize(path));
    if (!content) throw fsError(dirs.has(normalize(path)) ? "EISDIR" : "ENOENT", "open", path);
    return content;
  };

  /** @param {string} path */
  const readText = (path) => readBuffer(path).toString("utf-8");

  /**
   * @param {string} path
   * @param {Buffer|string} data
   */
  const writeFile = (path, data) => {
    const key = normalize(path);
    registerDirWithAncestors(dirname(key));
    files.set(key, Buffer.from(data));
  };

  return {
    readJson: (path) => JSON.parse(readText(path)),
    writeJson: (path, data) => writeFile(path, JSON.stringify(data, null, 2)),
    readText,
    readBuffer,
    writeFile,
    exists: (path) => files.has(normalize(path)) || dirs.has(normalize(path)),
    mkdir: registerDirWithAncestors,
    readdir: (path) => {
      const dir = normalize(path);
      if (files.has(dir)) throw fsError("ENOTDIR", "scandir", path);
      if (!dirs.has(dir)) throw fsError("ENOENT", "scandir", path);
      const children = [...files.keys(), ...dirs]
        .filter((entry) => entry !== dir && dirname(entry) === dir)
        .map((entry) => entry.slice(dir === "/" ? 1 : dir.length + 1));
      return [...new Set(children)].sort();
    },
    rm: (path, opts) => {
      const target = normalize(path);
      if (files.delete(target)) return;
      if (!dirs.has(target)) {
        if (opts?.force) return;
        throw fsError("ENOENT", "rm", path);
      }
      const prefix = target === "/" ? "/" : `${target}/`;
      const descendants = [...files.keys(), ...dirs].filter((entry) => entry.startsWith(prefix));
      if (descendants.length > 0 && !opts?.recursive) throw fsError("ENOTEMPTY", "rm", path);
      for (const entry of descendants) {
        files.delete(entry);
        dirs.delete(entry);
      }
      dirs.delete(target);
    },
  };
}
