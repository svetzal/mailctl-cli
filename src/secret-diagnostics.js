const REMEDIES = {
  SYSTEMD_REQUIRED: "Linux secret storage requires systemd-creds version 250 or newer and a usable TPM2.",
  TPM2_UNAVAILABLE:
    "TPM2 is unavailable. Enable TPM2 and install systemd TPM2 support; no host-key or plaintext fallback is permitted.",
  TPM2_CHECK_FAILED: "TPM2 availability check failed. Enable TPM2 and install systemd TPM2 support.",
  ENCRYPT_FAILED: "TPM2 encryption failed. Check TPM2 availability and credential binding.",
  DECRYPT_FAILED: "TPM2 decryption failed. Check TPM2 availability and credential binding.",
};
/** @typedef {keyof typeof REMEDIES} SecretFailureCode */
/** @typedef {{code: SecretFailureCode, remedy: string, username?: string}} SecretDiagnostic */
/** Only errors created here may carry diagnostics across the local trust boundary. */
const diagnostics = new WeakMap();

/** @param {SecretFailureCode} code @param {string} [username] @returns {SecretDiagnostic} */
function diagnosticFor(code, username) {
  if (username !== undefined && !/^[a-zA-Z_][a-zA-Z0-9_.-]*\$?$/.test(username))
    throw new Error("Invalid secret-store username.");
  return {
    code,
    ...(username === undefined ? {} : { username }),
    remedy:
      REMEDIES[code] +
      (username === undefined
        ? ""
        : ` If noninteractive sudo is denied, install sudoers rule: ${username} ALL=(root) NOPASSWD: /usr/bin/systemd-creds`),
  };
}

/** @param {SecretFailureCode} code @param {string} [username] @returns {Error} */
export function secretStoreFailure(code, username) {
  const diagnostic = diagnosticFor(code, username);
  const error = Object.assign(new Error(diagnostic.remedy), { code });
  diagnostics.set(error, Object.freeze(diagnostic));
  return error;
}

/** @param {unknown} error @returns {SecretDiagnostic|undefined} */
export function secretDiagnostic(error) {
  return error instanceof Error ? diagnostics.get(error) : undefined;
}

/** Remote text is never forwarded: accept only an exact canonical diagnostic.
 * @param {unknown} raw @returns {SecretDiagnostic} */
export function validateRemoteDiagnostic(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid diagnostic.");
  const entry = /** @type {Record<string, unknown>} */ (raw);
  if (
    typeof entry.code !== "string" ||
    !Object.hasOwn(REMEDIES, entry.code) ||
    Object.keys(entry).some((key) => !["code", "username", "remedy"].includes(key)) ||
    (entry.username !== undefined && typeof entry.username !== "string")
  )
    throw new Error("Invalid diagnostic.");
  const diagnostic = diagnosticFor(/** @type {SecretFailureCode} */ (entry.code), entry.username);
  if (entry.remedy !== diagnostic.remedy) throw new Error("Invalid diagnostic.");
  return diagnostic;
}
