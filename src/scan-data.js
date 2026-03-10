/**
 * Scan data persistence helpers.
 * Thin wrappers around FileSystemGateway for reading/writing scan-related files.
 * Accepts an injected gateway instance so callers can pass a mock in tests.
 */

import { join } from "path";
import { FileSystemGateway } from "./gateways/fs-gateway.js";

const SCAN_RESULTS_FILE = "scan-results.json";
const SENDERS_FILE = "senders.json";
const CLASSIFICATIONS_FILE = "classifications.json";

/**
 * Ensure the data directory exists.
 *
 * @param {string} dataDir
 * @param {FileSystemGateway} [fs]
 */
export function ensureDataDir(dataDir, fs = new FileSystemGateway()) {
  fs.mkdir(dataDir);
}

/**
 * Save raw scan results and sender summary to the data directory.
 *
 * @param {string} dataDir
 * @param {{ scanResults: unknown[], senders: unknown[], rawPath?: string }} data
 * @param {FileSystemGateway} [fs]
 */
export function saveScanResults(dataDir, { scanResults, senders, rawPath }, fs = new FileSystemGateway()) {
  const resolvedRawPath = rawPath || join(dataDir, SCAN_RESULTS_FILE);
  fs.writeJson(resolvedRawPath, scanResults);

  const summaryPath = join(dataDir, SENDERS_FILE);
  fs.writeJson(summaryPath, senders);

  return { rawPath: resolvedRawPath, summaryPath };
}

/**
 * Load the sender summary from the data directory.
 *
 * @param {string} dataDir
 * @param {FileSystemGateway} [fs]
 * @returns {unknown[]}
 */
export function loadSenders(dataDir, fs = new FileSystemGateway()) {
  return /** @type {unknown[]} */ (fs.readJson(join(dataDir, SENDERS_FILE)));
}

/**
 * Load existing classifications from the data directory.
 * Returns an empty object when the file does not exist.
 *
 * @param {string} dataDir
 * @param {FileSystemGateway} [fs]
 * @returns {Record<string, string>}
 */
export function loadClassificationsData(dataDir, fs = new FileSystemGateway()) {
  const path = join(dataDir, CLASSIFICATIONS_FILE);
  if (!fs.exists(path)) return {};
  return /** @type {Record<string, string>} */ (fs.readJson(path));
}

/**
 * Save classifications to the data directory.
 *
 * @param {string} dataDir
 * @param {Record<string, string>} classifications
 * @param {FileSystemGateway} [fs]
 */
export function saveClassifications(dataDir, classifications, fs = new FileSystemGateway()) {
  fs.writeJson(join(dataDir, CLASSIFICATIONS_FILE), classifications);
}
