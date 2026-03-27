import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_PATH = join(homedir(), ".config", "mailctl", "config.json");

/** @type {object|null} */
let cachedConfig;

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
 * @returns {Array<{prefix: string, name: string, user?: string, keychainService?: string, host?: string, port?: number, smtp?: {host: string, port: number, secure: boolean}}>}
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
 * Get SMTP config for an account by name (case-insensitive match).
 * @param {string} accountName - account name to look up
 * @returns {{ host: string, port: number, secure: boolean } | null}
 */
export function getConfigSmtp(accountName) {
  const accounts = getConfigAccounts();
  const lower = accountName.toLowerCase();
  const acct = accounts.find((a) => a.name?.toLowerCase() === lower || a.prefix?.toLowerCase() === lower);
  return acct?.smtp ?? null;
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
