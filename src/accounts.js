/**
 * Build account list from config.json and macOS Keychain.
 *
 * Non-secret fields (host, port, user, name) come from ~/.config/mailctl/config.json.
 * Secret fields (passwords, OAuth2 credentials) come from the macOS Keychain
 * via KeychainGateway, which reads the newt-keychain-db.
 *
 * Falls back to pure env-var discovery if no config.json exists.
 */
import { getConfigAccounts } from "./config.js";
import { KeychainGateway } from "./gateways/keychain-gateway.js";
import { loadAccountCredentials } from "./keychain.js";

const LEGACY_PREFIXES = ["ICLOUD", "GMAIL", "M365", "LIVE", "MOJILITY"];

/**
 * @typedef {import("./gateways/keychain-gateway.js").KeychainGateway} KeychainGatewayType
 */

/**
 * Load configured email accounts with credentials from keychain.
 * When config accounts exist, reads secrets from the macOS Keychain.
 * Falls back to env-var discovery when no config.json is present.
 *
 * @param {KeychainGatewayType} [keychain] - injectable keychain gateway (defaults to real implementation)
 * @returns {Array<{name: string, user: string, host: string, port: number, pass?: string, oauth2?: {clientId: string, tenantId: string, clientSecret: string}, smtp?: {host: string, port: number, secure: boolean}|null}>}
 */
export function loadAccounts(keychain = new KeychainGateway()) {
  const configAccounts = getConfigAccounts();

  if (configAccounts.length === 0) {
    return discoverAccountsFromEnv();
  }

  keychain.unlockNewtKeychain();
  return loadAccountCredentials(configAccounts, keychain);
}

/**
 * Legacy fallback: discover accounts from environment variables.
 * Used when no config.json exists, or in CI environments.
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
