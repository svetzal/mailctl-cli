/**
 * Resolve account secrets from the platform secret store.
 * Pure logic — receives a credential reader for I/O, testable with mocks.
 *
 * Performs per-account secret resolution using the account's keychainService field:
 *   {keychainService}              → IMAP password
 *   {keychainService}-client-id    → OAuth2 client ID
 *   {keychainService}-tenant-id    → OAuth2 tenant ID
 *   {keychainService}-client-secret → OAuth2 client secret
 */

export const OPENAI_SERVICE = "newt-openai-api";

/**
 * @typedef {import("./secret-store.js").CredentialReader} KeychainGateway
 */

/**
 * @typedef {Object} ConfigAccount
 * @property {string} prefix
 * @property {string} name
 * @property {string} [user]
 * @property {string} [keychainService]
 * @property {string} [host]
 * @property {number} [port]
 * @property {{ host: string, port: number, secure: boolean }} [smtp]
 */

/** @param {string} service @returns {{password: string, clientId: string, tenantId: string, clientSecret: string}} */
export function accountSecretServices(service) {
  return {
    password: service,
    clientId: `${service}-client-id`,
    tenantId: `${service}-tenant-id`,
    clientSecret: `${service}-client-secret`,
  };
}

/**
 * Load account credentials from keychain for all configured accounts.
 * Accounts without a keychainService field are skipped.
 * Accounts where no password or OAuth2 credentials are found are skipped.
 *
 * @param {ConfigAccount[]} configAccounts - accounts from config.json
 * @param {KeychainGateway} keychain - keychain gateway instance
 * @returns {Array<{name: string, user: string, host: string, port: number, pass?: string, oauth2?: {clientId: string, tenantId: string, clientSecret: string}, smtp?: {host: string, port: number, secure: boolean}|null}>}
 */
export function loadAccountCredentials(configAccounts, keychain) {
  const accounts = [];

  for (const acct of configAccounts) {
    const user = acct.user;
    const host = acct.host;
    const port = acct.port || 993;
    const svc = acct.keychainService;

    if (!user || !host || !svc) continue;

    const services = accountSecretServices(svc);
    // Try OAuth2 credentials first
    const clientId = keychain.readSecret(services.clientId);
    const tenantId = keychain.readSecret(services.tenantId);
    const clientSecret = keychain.readSecret(services.clientSecret);

    const smtp = acct.smtp || null;

    if (clientId && tenantId && clientSecret) {
      accounts.push({ name: acct.name, user, host, port, oauth2: { clientId, tenantId, clientSecret }, smtp });
      continue;
    }

    // Fall back to password-based auth
    const pass = keychain.readSecret(services.password);
    if (pass) {
      accounts.push({ name: acct.name, user, pass, host, port, smtp });
    }
  }

  return accounts;
}

/**
 * Read the OpenAI API key from keychain.
 * @param {KeychainGateway} keychain - keychain gateway instance
 * @returns {string|null}
 */
export function loadOpenAiKey(keychain) {
  return keychain.readSecret(OPENAI_SERVICE);
}
