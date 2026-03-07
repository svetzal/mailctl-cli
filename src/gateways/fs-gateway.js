/**
 * FileSystem Gateway — thin wrapper around Node `fs` module.
 * All filesystem I/O is isolated here so tests can inject a mock instead.
 * Contains no logic to test.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "fs";

export class FileSystemGateway {
  /**
   * Read a file and parse it as JSON.
   * @param {string} path
   * @returns {unknown}
   */
  readJson(path) {
    return JSON.parse(readFileSync(path, "utf-8"));
  }

  /**
   * Serialise data as JSON and write it to a file.
   * @param {string} path
   * @param {unknown} data
   */
  writeJson(path, data) {
    writeFileSync(path, JSON.stringify(data, null, 2));
  }

  /**
   * Read a file as a UTF-8 string.
   * @param {string} path
   * @returns {string}
   */
  readText(path) {
    return readFileSync(path, "utf-8");
  }

  /**
   * Read a file as a Buffer.
   * @param {string} path
   * @returns {Buffer}
   */
  readBuffer(path) {
    return readFileSync(path);
  }

  /**
   * Write raw bytes to a file.
   * @param {string} path
   * @param {Buffer|string} data
   */
  writeFile(path, data) {
    writeFileSync(path, data);
  }

  /**
   * Check whether a file or directory exists.
   * @param {string} path
   * @returns {boolean}
   */
  exists(path) {
    return existsSync(path);
  }

  /**
   * Create a directory (and any missing parents).
   * @param {string} path
   */
  mkdir(path) {
    mkdirSync(path, { recursive: true });
  }

  /**
   * List the entries in a directory.
   * @param {string} path
   * @returns {string[]}
   */
  readdir(path) {
    return readdirSync(path);
  }

  /**
   * Remove a file or directory.
   * @param {string} path
   * @param {{ recursive?: boolean, force?: boolean }} [opts]
   */
  rm(path, opts) {
    rmSync(path, opts);
  }
}
