/**
 * Build account list from config.json and environment variables.
 *
 * Non-secret fields (host, port, user, name) come from ~/.config/mailctl/config.json.
 * Secret fields (passwords, OAuth2 credentials) come from environment variables
 * injected by bin/run from the macOS Keychain.
 *
 * Falls back to pure env-var discovery if no config.json exists.
 */
import { getConfigAccounts } from "./config.js";

const LEGACY_PREFIXES = ["ICLOUD", "GMAIL", "M365", "LIVE", "MOJILITY"];

export function loadAccounts() {
  const configAccounts = getConfigAccounts();

  if (configAccounts.length === 0) {
    return discoverAccountsFromEnv();
  }

  const accounts = [];
  for (const acct of configAccounts) {
    const user = acct.user || process.env[`${acct.prefix}_USER`];
    const host = acct.host;
    const port = acct.port || 993;

    if (!user || !host) continue;

    // Check for OAuth2 credentials (secrets from env)
    const clientId = process.env[`${acct.prefix}_CLIENT_ID`];
    const tenantId = process.env[`${acct.prefix}_TENANT_ID`];
    const clientSecret = process.env[`${acct.prefix}_CLIENT_SECRET`];

    // Include SMTP config if present
    const smtp = acct.smtp || null;

    if (clientId && tenantId && clientSecret) {
      accounts.push({ name: acct.name, user, host, port, oauth2: { clientId, tenantId, clientSecret }, smtp });
      continue;
    }

    // Password-based auth (secret from env)
    const pass = process.env[`${acct.prefix}_PASS`];
    if (pass) {
      accounts.push({ name: acct.name, user, pass, host, port, smtp });
    }
  }
  return accounts;
}

/**
 * Legacy fallback: discover accounts from environment variables.
 * Used when no config.json exists.
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
