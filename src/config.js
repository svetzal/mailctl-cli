import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_PATH = join(homedir(), ".config", "mailctl", "config.json");

/** @type {object|null} */
let cachedConfig = undefined;

/**
 * Load the mailctl config file from ~/.config/mailctl/config.json.
 * Caches the result after first read.
 * @returns {object|null} parsed config or null if not found
 */
export function loadConfig() {
  if (cachedConfig !== undefined) return cachedConfig;
  try {
    cachedConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    cachedConfig = null;
  }
  return cachedConfig;
}

/**
 * Reset the cached config (useful for testing).
 */
export function resetConfigCache() {
  cachedConfig = undefined;
}

/**
 * Get the accounts array from config.json.
 * @returns {Array<{prefix: string, name: string, user?: string, keychainService?: string, host?: string, port?: number}>}
 */
export function getConfigAccounts() {
  const config = loadConfig();
  return config?.accounts ?? [];
}

/**
 * Get self-addressed email addresses (for forwarded email detection).
 * @returns {string[]}
 */
export function getConfigSelfAddresses() {
  const config = loadConfig();
  return config?.selfAddresses ?? [];
}

/**
 * Get invoice number blocklist.
 * @returns {string[]}
 */
export function getConfigInvoiceBlocklist() {
  const config = loadConfig();
  return config?.invoiceBlocklist ?? [];
}

/**
 * Get vendor address → display name map.
 * @returns {Record<string, string>}
 */
export function getConfigVendorAddressMap() {
  const config = loadConfig();
  return config?.vendorAddressMap ?? {};
}

/**
 * Get vendor domain → display name map.
 * @returns {Record<string, string>}
 */
export function getConfigVendorDomainMap() {
  const config = loadConfig();
  return config?.vendorDomainMap ?? {};
}

/**
 * Get Canadian merchant domains.
 * @returns {string[]}
 */
export function getConfigCanadianDomains() {
  const config = loadConfig();
  return config?.canadianDomains ?? [];
}

/**
 * Get the download directory for receipt PDFs.
 * @returns {string}
 */
export function getConfigDownloadDir() {
  const config = loadConfig();
  const dir = config?.downloadDir;
  if (dir) {
    return dir.replace(/^~/, homedir());
  }
  return join(homedir(), "mailctl-receipts");
}
