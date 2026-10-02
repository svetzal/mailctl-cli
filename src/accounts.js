/**
 * Build account list from config.json and the platform secret store.
 *
 * Non-secret fields (host, port, user, name) come from ~/.config/mailctl/config.json.
 * Secret fields (passwords, OAuth2 credentials) come from the platform secret store.
 *
 * Falls back to pure env-var discovery if no config.json exists.
 */
import { getConfigAccounts } from "./config.js";
import { loadAccountCredentials } from "./keychain.js";
import { createSecretStore } from "./secret-store.js";

const LEGACY_PREFIXES = ["ICLOUD", "GMAIL", "M365", "LIVE", "MOJILITY"];

/**
 * @typedef {import("./secret-store.js").CredentialReader} KeychainGatewayType
 */

/**
 * Load configured email accounts with credentials from the platform secret store.
 * When config accounts exist, reads secrets from macOS Keychain or TPM2-bound Linux credentials.
 * Falls back to env-var discovery when no config.json is present.
 *
 * @param {KeychainGatewayType} [keychain] - injectable credential reader (defaults to real implementation)
 * @param {() => import("./keychain.js").ConfigAccount[]} [readConfigAccounts]
 * @returns {Array<{name: string, user: string, host: string, port: number, pass?: string, oauth2?: {clientId: string, tenantId: string, clientSecret: string}, smtp?: {host: string, port: number, secure: boolean}|null}>}
 */
export function loadAccounts(keychain = createSecretStore(), readConfigAccounts = getConfigAccounts) {
  const configAccounts = readConfigAccounts();

  if (configAccounts.length === 0) {
    return discoverAccountsFromEnv();
  }

  keychain.unlockNewtKeychain();
  return loadAccountCredentials(configAccounts, keychain);
}

/**
 * Legacy fallback: discover accounts from environment variables.
 * Used when no config.json exists, or in CI environments.
 * @returns {Array<{name: string, user: string, host: string, port: number, pass?: string, oauth2?: {clientId: string, tenantId: string, clientSecret: string}}>}
 */
export function discoverAccountsFromEnv() {
  const accounts = [];

  for (const prefix of LEGACY_PREFIXES) {
    const user = process.env[`${prefix}_USER`];
    const host = process.env[`${prefix}_HOST`];
    const port = parseInt(process.env[`${prefix}_PORT`] || "993", 10);

    if (!user || !host) continue;

    const clientId = process.env[`${prefix}_CLIENT_ID`];
    const tenantId = process.env[`${prefix}_TENANT_ID`];
    const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];

    if (clientId && tenantId && clientSecret) {
      accounts.push({ name: prefix, user, host, port, oauth2: { clientId, tenantId, clientSecret } });
      continue;
    }

    const pass = process.env[`${prefix}_PASS`];
    if (pass) {
      accounts.push({ name: prefix, user, pass, host, port });
    }
  }

  return accounts;
}
