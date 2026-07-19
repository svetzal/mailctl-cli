/**
 * Boundary validation for untrusted external JSON.
 *
 * All external JSON (config, senders, classifications, sidecars) is validated here
 * before reaching core logic. Each validator throws a `ValidationError` with a
 * field-naming message so failures surface at the boundary rather than deep in
 * IMAP or receipt code.
 */

/** @typedef {import('./receipts/receipt-types.js').ReceiptSidecar} ReceiptSidecar */

/**
 * A single entry from a senders.json file.
 * @typedef {object} SenderEntry
 * @property {string} address
 * @property {string} [name]
 * @property {number} [count]
 * @property {string[]} [accounts]
 * @property {string[]} [sampleSubjects]
 */

/**
 * A single entry from an import-classifications input file.
 * @typedef {object} ImportEntry
 * @property {string} [address]
 * @property {string} [classification]
 */

/**
 * Represents a malformed external JSON input.
 * `code` is always "INVALID_INPUT" so `withErrorHandling` can emit it as a
 * machine-readable `--json` error.
 */
export class ValidationError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.code = "INVALID_INPUT";
  }
}

// ── Primitive validators ───────────────────────────────────────────────────────

/**
 * Asserts that `value` is a non-null, non-array object.
 * @param {unknown} value
 * @param {string} label - identifies the source in the error message
 * @returns {Record<string, unknown>}
 */
export function requireObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(
      `${label} must be an object, got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`,
    );
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * Asserts that `obj[key]` is a string.
 * @param {Record<string, unknown>} obj
 * @param {string} key
 * @param {string} label - names the field in the error message (e.g. "config.json: accounts[0].prefix")
 * @returns {string}
 */
export function requireString(obj, key, label) {
  if (typeof obj[key] !== "string") {
    throw new ValidationError(`${label} must be a string, got ${typeof obj[key]}`);
  }
  return /** @type {string} */ (obj[key]);
}

/**
 * Asserts that `obj[key]` is a number.
 * @param {Record<string, unknown>} obj
 * @param {string} key
 * @param {string} label - names the field in the error message
 * @returns {number}
 */
export function requireNumber(obj, key, label) {
  if (typeof obj[key] !== "number") {
    throw new ValidationError(`${label} must be a number, got ${typeof obj[key]}`);
  }
  return /** @type {number} */ (obj[key]);
}

/**
 * Asserts that `value` is an array.
 * @param {unknown} value
 * @param {string} label - identifies the source in the error message
 * @returns {unknown[]}
 */
export function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${label} must be an array, got ${value === null ? "null" : typeof value}`);
  }
  return value;
}

/**
 * When `obj[key]` is present, asserts it is a string. Missing key is allowed.
 * @param {Record<string, unknown>} obj
 * @param {string} key
 * @param {string} label - names the field in the error message
 * @returns {string|undefined}
 */
export function optionalString(obj, key, label) {
  if (!(key in obj) || obj[key] === undefined || obj[key] === null) return undefined;
  if (typeof obj[key] !== "string") {
    throw new ValidationError(`${label} must be a string when present, got ${typeof obj[key]}`);
  }
  return /** @type {string} */ (obj[key]);
}

// ── Shape validators ───────────────────────────────────────────────────────────

/**
 * Validates the shape of config.json.
 * Accounts must be an array; each account must have string `prefix` and `name`.
 * If `port` is present it must be a number.
 *
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function validateConfig(raw) {
  const config = requireObject(raw, "config.json");
  if ("accounts" in config && config.accounts !== undefined) {
    const accounts = requireArray(config.accounts, "config.json: accounts");
    for (let i = 0; i < accounts.length; i++) {
      const acct = requireObject(accounts[i], `config.json: accounts[${i}]`);
      requireString(acct, "prefix", `config.json: accounts[${i}].prefix`);
      requireString(acct, "name", `config.json: accounts[${i}].name`);
      if ("port" in acct && acct.port !== undefined) {
        requireNumber(acct, "port", `config.json: accounts[${i}].port`);
      }
    }
  }
  return config;
}

/**
 * Validates senders.json — must be an array of objects each carrying an `address`.
 *
 * @param {unknown} raw
 * @returns {SenderEntry[]}
 */
export function validateSenders(raw) {
  const items = requireArray(raw, "senders.json");
  for (let i = 0; i < items.length; i++) {
    const item = requireObject(items[i], `senders.json[${i}]`);
    requireString(item, "address", `senders.json[${i}].address`);
  }
  return /** @type {SenderEntry[]} */ (items);
}

/**
 * Validates classifications.json — must be a plain object (Record<string, string>).
 *
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function validateClassifications(raw) {
  const obj = requireObject(raw, "classifications.json");
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== "string") {
      throw new ValidationError(`classifications.json: entry "${key}" must be a string, got ${typeof value}`);
    }
  }
  return /** @type {Record<string, string>} */ (obj);
}

/**
 * Validates an import-classifications input file — must be an array of objects.
 *
 * @param {unknown} raw
 * @returns {ImportEntry[]}
 */
export function validateImportEntries(raw) {
  const items = requireArray(raw, "import entries");
  for (let i = 0; i < items.length; i++) {
    requireObject(items[i], `import entries[${i}]`);
  }
  return /** @type {ImportEntry[]} */ (items);
}

/**
 * Validates a receipt sidecar file — must be a plain object (not array, not null).
 *
 * @param {unknown} raw
 * @returns {ReceiptSidecar}
 */
export function validateSidecar(raw) {
  requireObject(raw, "receipt sidecar");
  return /** @type {ReceiptSidecar} */ (raw);
}
