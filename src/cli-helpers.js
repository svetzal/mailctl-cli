/**
 * Pure helper functions used by the CLI layer.
 * No I/O, no Commander imports — these are isolated and testable.
 */

/**
 * Sanitize a value for safe JSON output.
 * Removes control characters (except \n and \t) when the value is a string.
 * Non-string values are returned unchanged.
 * @param {*} str
 * @returns {*}
 */
export function sanitizeString(str) {
  if (typeof str !== "string") return str;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — strips raw control characters from email data
  return str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}

/**
 * Convert a mailparser header value to a JSON-friendly representation.
 * @param {*} value
 * @returns {string|string[]}
 */
export function headerValueToString(value) {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (value?.text) return value.text;
  if (value?.value) return value.value;
  if (Array.isArray(value)) return /** @type {string[]} */ (value.flatMap(headerValueToString));
  return String(value);
}

/**
 * Collect option values that can be specified multiple times or as comma-separated.
 * Commander calls this reducer for each --option occurrence.
 * @param {string} value - new value from the CLI flag
 * @param {string[]} previous - accumulated values so far
 * @returns {string[]}
 */
export function collectValues(value, previous) {
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return previous.concat(items);
}

/**
 * Filter an accounts array by name.
 * When name is null or undefined, all accounts are returned (no filtering).
 * Matching is case-insensitive.
 *
 * @template {{ name: string }} T
 * @param {T[]} accounts
 * @param {string|null|undefined} name
 * @returns {T[]}
 */
export function filterAccountsByName(accounts, name) {
  if (!name) return accounts;
  const lower = name.toLowerCase();
  return accounts.filter((a) => a.name.toLowerCase() === lower);
}

/**
 * Load, validate, and optionally filter accounts.
 * Throws if no accounts are configured, or if an explicit filter matches nothing.
 *
 * @template {{ name: string }} T
 * @param {string|null|undefined} accountFilter - account name to filter by, or null/undefined for all
 * @param {() => T[]} loadAccountsFn - function that returns all configured accounts
 * @returns {T[]}
 */
export function resolveAccounts(accountFilter, loadAccountsFn) {
  const accounts = loadAccountsFn();
  if (accounts.length === 0) {
    throw new Error("No accounts configured. Check ~/.config/mailctl/config.json and macOS Keychain.");
  }
  const targetAccounts = filterAccountsByName(accounts, accountFilter);
  if (accountFilter && targetAccounts.length === 0) {
    throw new Error(`Account "${accountFilter}" not found.`);
  }
  return targetAccounts;
}

/**
 * @typedef {object} CommandContextDeps
 * @property {(opts: object) => boolean} resolveJson
 * @property {(opts: object) => string|undefined} resolveAccount
 * @property {() => object[]} requireAccounts
 * @property {(accounts: object[], name: string|undefined) => object[]} filterAccountsByName
 */

/**
 * @typedef {object} CommandContext
 * @property {boolean} json - whether --json flag is active
 * @property {string|undefined} account - resolved account name filter
 * @property {object[]} accounts - all configured accounts
 * @property {object[]} targetAccounts - accounts after applying the account filter
 */

/**
 * Format output for either JSON or human-readable text mode.
 * @param {boolean} json - Whether JSON output is requested
 * @param {unknown} jsonData - Data to serialize as JSON
 * @param {string} textOutput - Human-readable text output
 * @returns {string}
 */
export function formatOutput(json, jsonData, textOutput) {
  return json ? JSON.stringify(jsonData) : textOutput;
}

/**
 * Resolve the common command context present in most CLI handlers:
 * json flag, account filter, full account list, and filtered account list.
 * Throws when an explicit account name matches no configured accounts.
 *
 * @param {object} opts - Commander option object
 * @param {CommandContextDeps} deps - injected resolver functions (for testability)
 * @returns {CommandContext}
 */
export function resolveCommandContext(
  opts,
  { resolveJson, resolveAccount, requireAccounts, filterAccountsByName: filterAccounts },
) {
  const json = resolveJson(opts);
  const account = resolveAccount(opts);
  const accounts = requireAccounts();
  const targetAccounts = filterAccounts(accounts, account);

  if (account && targetAccounts.length === 0) {
    throw new Error(`Account "${account}" not found.`);
  }

  return { json, account, accounts, targetAccounts };
}
