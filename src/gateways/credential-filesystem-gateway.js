import { chmodSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";

// Permission options are explicit and isolated from other filesystem callers.
export class CredentialFilesystemGateway {
  /** @param {string} path @param {number} mode */
  mkdir(path, mode) {
    mkdirSync(path, { recursive: true, mode });
  }
  /** @param {string} path @returns {Pick<import("node:fs").Stats, "isDirectory" | "isFile" | "isSymbolicLink">} */
  lstat(path) {
    return lstatSync(path);
  }
  /** @param {string} path @param {number} mode */
  chmod(path, mode) {
    chmodSync(path, mode);
  }
  /** @param {string} path @returns {Buffer} */
  readBuffer(path) {
    return readFileSync(path);
  }
  /** @param {string} path @param {Buffer} ciphertext @param {number} mode */
  writeCiphertext(path, ciphertext, mode) {
    writeFileSync(path, ciphertext, { mode, flag: "wx" });
  }
  /** @param {string} from @param {string} to */
  rename(from, to) {
    renameSync(from, to);
  }
  /** @param {string} path @returns {string[]} */
  readdir(path) {
    return readdirSync(path);
  }
  /** @param {string} path */
  rm(path) {
    rmSync(path, { force: true });
  }
}
