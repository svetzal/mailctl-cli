/**
 * All filesystem I/O is isolated here so tests can inject a mock instead.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

export class FileSystemGateway {
  /**
   * @param {string} path
   * @returns {unknown}
   */
  readJson(path) {
    return JSON.parse(readFileSync(path, "utf-8"));
  }

  /**
   * @param {string} path
   * @param {unknown} data
   */
  writeJson(path, data) {
    writeFileSync(path, JSON.stringify(data, null, 2));
  }

  /**
   * @param {string} path
   * @returns {string}
   */
  readText(path) {
    return readFileSync(path, "utf-8");
  }

  /**
   * @param {string} path
   * @returns {Buffer}
   */
  readBuffer(path) {
    return readFileSync(path);
  }

  /**
   * @param {string} path
   * @param {Buffer|string} data
   */
  writeFile(path, data) {
    writeFileSync(path, data);
  }

  /**
   * @param {string} path
   * @returns {boolean}
   */
  exists(path) {
    return existsSync(path);
  }

  /**
   * @param {string} path
   */
  mkdir(path) {
    mkdirSync(path, { recursive: true });
  }

  /**
   * @param {string} path
   * @returns {string[]}
   */
  readdir(path) {
    return readdirSync(path);
  }

  /**
   * @param {string} path
   * @param {{ recursive?: boolean, force?: boolean }} [opts]
   */
  rm(path, opts) {
    rmSync(path, opts);
  }
}
