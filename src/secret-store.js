import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { CredentialFilesystemGateway } from "./gateways/credential-filesystem-gateway.js";
import { KeychainGateway } from "./gateways/keychain-gateway.js";
import { SubprocessGateway } from "./gateways/subprocess-gateway.js";

/**
 * @typedef {{readSecret(service: string): string|null, unlockNewtKeychain(): void}} CredentialReader
 * @typedef {CredentialReader & {writeSecret(service: string, secret: string): void, deleteSecret(service: string): void, listNames(): string[]}} SecretStore
 */

const CREDS = "/usr/bin/systemd-creds";
const USER_MODE_VERSION = 256;
const MIN_SYSTEMD_VERSION = 250;
// systemd's authenticated credential header identifies the encryption key type.
// https://github.com/systemd/systemd/blob/v256/src/shared/creds-util.h
const TPM2_HEADER_IDS = new Set(["0c7cc07b117645919c4b0bea08bc20fe", "faf7eb9341e3412ca1a436f95a29362f"]);
const CREDENTIAL_ID_BYTES = 16;
const SECRET_OPERATION_TIMEOUT_MS = 30_000;
const OPTIONS = {
  encoding: /** @type {const} */ ("utf-8"),
  stdio: /** @type {["pipe", "pipe", "pipe"]} */ (["pipe", "pipe", "pipe"]),
  timeout: SECRET_OPERATION_TIMEOUT_MS,
};

/** @param {string} service @returns {string} */
function validateService(service) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(service) || Buffer.byteLength(service) > 250) {
    throw new Error("Invalid credential service name.");
  }
  return service;
}

/** @param {Buffer} ciphertext */
function requireTpm2Ciphertext(ciphertext) {
  const id = Buffer.from(ciphertext.toString("utf-8"), "base64").subarray(0, CREDENTIAL_ID_BYTES).toString("hex");
  if (!TPM2_HEADER_IDS.has(id)) throw new Error("Refusing credential without a TPM2-only encrypted header.");
}

export class LinuxSecretStore {
  /** @param {{subprocess?: SubprocessGateway, filesystem?: CredentialFilesystemGateway, home?: string, username?: string}} [options] */
  constructor({
    subprocess = new SubprocessGateway(),
    filesystem = new CredentialFilesystemGateway(),
    home = homedir(),
    username = userInfo().username,
  } = {}) {
    this.subprocess = subprocess;
    this.filesystem = filesystem;
    this.directory = join(home, ".config", "mailctl", "credstore.encrypted");
    this.username = username;
    /** @type {number|undefined} */
    this.version = undefined;
  }

  /** Linux has no keychain unlock, but checks every prerequisite before account reads. */
  unlockNewtKeychain() {
    this.prepare();
  }

  /** @returns {number} */
  prepare() {
    if (this.version !== undefined) return this.version;
    let version;
    try {
      const output = String(this.subprocess.execFileSync(CREDS, ["--version"], OPTIONS));
      version = Number(/^systemd\s+(\d+)/m.exec(output)?.[1]);
      if (!Number.isFinite(version) || version < MIN_SYSTEMD_VERSION) throw new Error();
    } catch {
      throw new Error("Linux secret storage requires systemd-creds version 250 or newer and a usable TPM2.");
    }
    const output = this.invoke(
      ["has-tpm2"],
      version,
      undefined,
      "TPM2 is unavailable. Enable TPM2 and install systemd TPM2 support; no host-key or plaintext fallback is permitted.",
    );
    if (output.trim() !== "yes")
      throw new Error(
        "TPM2 is unavailable. Enable TPM2 and install systemd TPM2 support; no host-key or plaintext fallback is permitted.",
      );
    this.filesystem.mkdir(this.directory, 0o700);
    const directory = this.filesystem.lstat(this.directory);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("Unsafe credential directory.");
    this.filesystem.chmod(this.directory, 0o700);
    this.version = version;
    return version;
  }

  /** @param {string[]} args @param {number} version @param {string} [input] @param {string} [failure] @returns {string} */
  invoke(args, version, input, failure = "TPM2 credential operation failed; storage was not downgraded.") {
    const privileged = version < USER_MODE_VERSION;
    try {
      return String(
        this.subprocess.execFileSync(
          privileged ? "/usr/bin/sudo" : CREDS,
          privileged ? ["-n", CREDS, ...args] : args[0] === "has-tpm2" ? args : ["--user", ...args],
          { ...OPTIONS, ...(input === undefined ? {} : { input }) },
        ),
      );
    } catch {
      // Never forward stderr, argv, stdin or causes from secret-bearing subprocesses.
      throw new Error(
        privileged
          ? `${failure} If noninteractive sudo is denied, install this sudoers line: ${this.username} ALL=(root) NOPASSWD: /usr/bin/systemd-creds`
          : failure,
      );
    }
  }

  /** @param {string} path @returns {boolean} */
  exists(path) {
    try {
      const stat = this.filesystem.lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Unsafe credential file.");
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
  }

  /** Older systemd-creds atomically writes a root-owned file. Only ciphertext
   * is re-homed, within the 0700 directory, to enforce operator-owned 0600.
   * @param {string} path */
  sealCiphertext(path) {
    const ciphertext = this.filesystem.readBuffer(path);
    requireTpm2Ciphertext(ciphertext);
    const temporary = `${path}.tmp`;
    this.filesystem.writeCiphertext(temporary, ciphertext, 0o600);
    try {
      this.filesystem.rename(temporary, path);
    } finally {
      this.filesystem.rm(temporary);
    }
  }

  /** @param {string} service @returns {string} */
  path(service) {
    return join(this.directory, `${validateService(service)}.cred`);
  }

  /** @param {string} service @returns {string|null} */
  readSecret(service) {
    const path = this.path(service);
    const version = this.prepare();
    if (!this.exists(path)) return null;
    this.filesystem.chmod(path, 0o600);
    requireTpm2Ciphertext(this.filesystem.readBuffer(path));
    return this.invoke(["decrypt", `--name=${service}`, path, "-"], version);
  }

  /** @param {string} service @param {string} secret @returns {void} */
  writeSecret(service, secret) {
    const path = this.path(service);
    const version = this.prepare();
    this.invoke(
      ["encrypt", "--with-key=tpm2", `--name=${service}`, "-", path],
      version,
      secret,
      version >= USER_MODE_VERSION
        ? "systemd-creds user mode does not support --with-key=tpm2. TPM2-only storage requires a platform-policy decision; no fallback was attempted."
        : undefined,
    );
    try {
      if (!this.exists(path)) throw new Error();
      this.sealCiphertext(path);
      this.filesystem.chmod(path, 0o600);
    } catch {
      throw new Error(
        "Unable to secure TPM2 ciphertext at mode 0600. Check credential-directory ownership and sudo umask (ciphertext must be readable by its owner); no plaintext fallback is permitted.",
      );
    }
  }

  /** @param {string} service @returns {void} */
  deleteSecret(service) {
    const path = this.path(service);
    this.prepare();
    if (this.exists(path)) this.filesystem.rm(path);
  }

  /** @returns {string[]} */
  listNames() {
    this.prepare();
    return this.filesystem
      .readdir(this.directory)
      .filter((name) => /^[A-Za-z0-9][A-Za-z0-9._-]*\.cred$/.test(name))
      .map((name) => name.slice(0, -5))
      .sort();
  }
}

/** Selection is lazy: unsupported platforms may still load the CLI and show help. */
class UnsupportedSecretStore {
  unlockNewtKeychain() {
    throw new Error("no secret store on this platform");
  }
  /** @param {string} _service @returns {string|null} */
  readSecret(_service) {
    throw new Error("no secret store on this platform");
  }
  /** @param {string} _service @param {string} _secret */
  writeSecret(_service, _secret) {
    throw new Error("no secret store on this platform");
  }
  /** @param {string} _service */
  deleteSecret(_service) {
    throw new Error("no secret store on this platform");
  }
  /** @returns {string[]} */
  listNames() {
    throw new Error("no secret store on this platform");
  }
}

/** @param {{platform?: string, subprocess?: SubprocessGateway, filesystem?: CredentialFilesystemGateway, home?: string, username?: string}} [options] @returns {SecretStore} */
export function createSecretStore(options = {}) {
  switch (options.platform ?? process.platform) {
    case "darwin":
      return new KeychainGateway(options.subprocess, options.home);
    case "linux":
      return new LinuxSecretStore(options);
    default:
      return new UnsupportedSecretStore();
  }
}
