import { accountSecretServices, OPENAI_SERVICE } from "./keychain.js";
import { validateService } from "./secret-store.js";
import { requireObject, validateConfig } from "./validate-json.js";

export const SECRET_PROTOCOL_VERSION = 1;
const ACCOUNT_FIELDS = new Set(["prefix", "name", "user", "host", "port", "keychainService", "smtp"]);
const CONFIG_FIELDS = new Set(["accounts", "vendorAddressMap", "vendorDomainMap"]);

/** @param {string} value @returns {boolean} */
function hasControlCharacters(value) {
  return [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

/** Only explicitly non-secret metadata may cross the configuration boundary.
 * @param {unknown} raw @returns {import("./keychain.js").ConfigAccount[]} */
export function validateAccounts(raw) {
  if (!Array.isArray(raw)) throw new Error("Invalid non-secret account configuration.");
  for (const entry of raw) {
    const account = requireObject(entry, "account");
    if (Object.keys(account).some((key) => !ACCOUNT_FIELDS.has(key))) throw new Error("Unexpected account field.");
    // user is optional: the runtime skips an account without one (see loadAccountCredentials).
    for (const key of ["prefix", "name", "user", "host", "keychainService"]) {
      if (key === "user" && account.user === undefined) continue;
      if (typeof account[key] !== "string" || !account[key] || hasControlCharacters(account[key]))
        throw new Error("Invalid account metadata.");
    }
    validateService(String(account.keychainService));
    if (
      account.port !== undefined &&
      (!Number.isInteger(account.port) || Number(account.port) < 1 || Number(account.port) > 65535)
    )
      throw new Error("Invalid account port.");
    if (account.smtp !== undefined) {
      const smtp = requireObject(account.smtp, "smtp");
      if (
        Object.keys(smtp).some((key) => !["host", "port", "secure"].includes(key)) ||
        typeof smtp.host !== "string" ||
        !smtp.host ||
        hasControlCharacters(smtp.host) ||
        !Number.isInteger(smtp.port) ||
        Number(smtp.port) < 1 ||
        Number(smtp.port) > 65535 ||
        typeof smtp.secure !== "boolean"
      )
        throw new Error("Invalid SMTP metadata.");
    }
  }
  validateConfig({ accounts: raw });
  return raw;
}

/** @param {unknown} raw @returns {Record<string, unknown>} */
export function validateNonSecretConfig(raw) {
  const config = requireObject(raw, "config");
  if (Object.keys(config).some((key) => !CONFIG_FIELDS.has(key))) throw new Error("Unexpected configuration field.");
  validateConfig(config);
  if (config.accounts !== undefined) validateAccounts(config.accounts);
  for (const key of ["vendorAddressMap", "vendorDomainMap"]) {
    if (
      config[key] !== undefined &&
      Object.values(requireObject(config[key], "vendor map")).some((value) => typeof value !== "string")
    )
      throw new Error("Invalid vendor map.");
  }
  return config;
}

/** @param {import("./keychain.js").ConfigAccount[]} accounts @returns {string[]} */
export function expectedSecretNames(accounts) {
  return [
    ...new Set([
      OPENAI_SERVICE,
      ...accounts.flatMap(({ user, keychainService }) =>
        user && keychainService ? Object.values(accountSecretServices(keychainService)) : [],
      ),
    ]),
  ].sort();
}

/** @typedef {{name: string, value: string}} SecretEntry */
/** @param {string} input @returns {{entries: SecretEntry[], accounts?: import("./keychain.js").ConfigAccount[]}} */
export function decodeSecretProtocol(input) {
  try {
    const lines = input.split("\n");
    if (lines.at(-1) === "") lines.pop();
    const header = requireObject(JSON.parse(lines.shift() ?? ""), "header");
    if (
      header.protocol !== "mailctl-secrets" ||
      header.version !== SECRET_PROTOCOL_VERSION ||
      Object.keys(header).some((key) => !["protocol", "version", "accounts"].includes(key))
    )
      throw new Error();
    const accounts = header.accounts === undefined ? undefined : validateAccounts(header.accounts);
    const names = new Set();
    const entries = lines.map((line) => {
      const entry = requireObject(JSON.parse(line), "entry");
      if (
        Object.keys(entry).length !== 2 ||
        typeof entry.name !== "string" ||
        typeof entry.value !== "string" ||
        !entry.value
      )
        throw new Error();
      validateService(entry.name);
      if (names.has(entry.name)) throw new Error();
      names.add(entry.name);
      return { name: entry.name, value: entry.value };
    });
    return { entries, accounts };
  } catch {
    throw new Error("Invalid mailctl secrets protocol or unsupported version.");
  }
}

/** @param {SecretEntry[]} entries @param {import("./keychain.js").ConfigAccount[]} [accounts] @returns {string} */
export function encodeSecretProtocol(entries, accounts) {
  return [
    JSON.stringify({
      protocol: "mailctl-secrets",
      version: SECRET_PROTOCOL_VERSION,
      ...(accounts ? { accounts } : {}),
    }),
    ...entries.map((entry) => JSON.stringify(entry)),
    "",
  ].join("\n");
}
