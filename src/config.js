import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_CONFIG_PATH = join(homedir(), ".config", "mailctl", "config.json");

/** @type {object|undefined} */
let cachedConfig;

/**
 * A minimal filesystem interface used by loadConfig.
 * @typedef {{ readJson: (path: string) => unknown }} ConfigFs
 */

/**
 * The real filesystem implementation used when no mock is injected.
 * @type {ConfigFs}
 */
const realFs = {
  readJson(path) {
    return JSON.parse(readFileSync(path, "utf-8"));
  },
};

/**
 * Load the mailctl config file from ~/.config/mailctl/config.json.
 * Caches the result after first read.
 *
 * @param {ConfigFs} [fs] - optional filesystem gateway (defaults to real fs)
 * @param {string} [configPath] - optional path override (defaults to ~/.config/mailctl/config.json)
 * @returns {object|null} parsed config or null if not found
 */
export function loadConfig(fs = realFs, configPath = DEFAULT_CONFIG_PATH) {
  if (cachedConfig !== undefined) return cachedConfig;
  try {
    cachedConfig = /** @type {object} */ (fs.readJson(configPath));
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
 * @param {object|null} [config] - optional pre-loaded config (loads from disk when omitted)
 * @returns {Array<{prefix: string, name: string, user?: string, keychainService?: string, host?: string, port?: number, smtp?: {host: string, port: number, secure: boolean}}>}
 */
export function getConfigAccounts(config = loadConfig()) {
  return config?.accounts ?? [];
}

/**
 * Get self-addressed email addresses (for forwarded email detection).
 * @param {object|null} [config] - optional pre-loaded config (loads from disk when omitted)
 * @returns {string[]}
 */
export function getConfigSelfAddresses(config = loadConfig()) {
  return config?.selfAddresses ?? [];
}

/**
 * Get invoice number blocklist.
 * @param {object|null} [config] - optional pre-loaded config (loads from disk when omitted)
 * @returns {string[]}
 */
export function getConfigInvoiceBlocklist(config = loadConfig()) {
  return config?.invoiceBlocklist ?? [];
}

/**
 * Get vendor address → display name map.
 * @param {object|null} [config] - optional pre-loaded config (loads from disk when omitted)
 * @returns {Record<string, string>}
 */
export function getConfigVendorAddressMap(config = loadConfig()) {
  return config?.vendorAddressMap ?? {};
}

/**
 * Get vendor domain → display name map.
 * @param {object|null} [config] - optional pre-loaded config (loads from disk when omitted)
 * @returns {Record<string, string>}
 */
export function getConfigVendorDomainMap(config = loadConfig()) {
  return config?.vendorDomainMap ?? {};
}

/**
 * Get SMTP config for an account by name (case-insensitive match).
 * @param {string} accountName - account name to look up
 * @param {object|null} [config] - optional pre-loaded config (loads from disk when omitted)
 * @returns {{ host: string, port: number, secure: boolean } | null}
 */
export function getConfigSmtp(accountName, config = loadConfig()) {
  const accounts = getConfigAccounts(config);
  const lower = accountName.toLowerCase();
  const acct = accounts.find((a) => a.name?.toLowerCase() === lower || a.prefix?.toLowerCase() === lower);
  return acct?.smtp ?? null;
}

/**
 * Get Canadian merchant domains.
 * @param {object|null} [config] - optional pre-loaded config (loads from disk when omitted)
 * @returns {string[]}
 */
export function getConfigCanadianDomains(config = loadConfig()) {
  return config?.canadianDomains ?? [];
}

/**
 * Get the download directory for receipt PDFs.
 * @param {object|null} [config] - optional pre-loaded config (loads from disk when omitted)
 * @param {string} [homeDir] - optional home directory override (defaults to os.homedir())
 * @returns {string}
 */
export function getConfigDownloadDir(config = loadConfig(), homeDir = homedir()) {
  const dir = config?.downloadDir;
  if (dir) {
    return dir.replace(/^~/, homeDir);
  }
  return join(homeDir, "mailctl-receipts");
}
