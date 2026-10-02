import { homedir } from "node:os";
import { join } from "node:path";
import { SubprocessGateway } from "./subprocess-gateway.js";

const SECURITY = "/usr/bin/security";
const SECRET_OPERATION_TIMEOUT_MS = 30_000;
const OPTIONS = {
  encoding: /** @type {const} */ ("utf-8"),
  stdio: /** @type {["pipe", "pipe", "pipe"]} */ (["pipe", "pipe", "pipe"]),
  timeout: SECRET_OPERATION_TIMEOUT_MS,
};

export class KeychainGateway {
  /** @param {SubprocessGateway} [subprocess] @param {string} [home] */
  constructor(subprocess = new SubprocessGateway(), home = homedir()) {
    this.subprocess = subprocess;
    this.keychainPath = join(home, ".newt", "newt-keychain-db");
  }

  /** @returns {void} */
  unlockNewtKeychain() {
    try {
      const password = String(
        this.subprocess.execFileSync(
          SECURITY,
          ["find-generic-password", "-a", "newt", "-s", "newt-keychain-password", "-w"],
          OPTIONS,
        ),
      ).trim();
      this.nativeCall(`const password = ${JSON.stringify(password)};
const data = $(password).dataUsingEncoding($.NSUTF8StringEncoding);
check($.SecKeychainUnlock(keychain[0], data.length, data.bytes, true));`);
    } catch {
      throw new Error("Unable to unlock Newt keychain using newt-keychain-password from the login keychain.");
    }
  }

  /** @param {string} service @param {string} [keychainPath] @returns {string|null} */
  readSecret(service, keychainPath = this.keychainPath) {
    try {
      return String(
        this.subprocess.execFileSync(SECURITY, ["find-generic-password", "-s", service, "-w", keychainPath], OPTIONS),
      ).trim();
    } catch (error) {
      if (error?.status === 44) return null;
      throw new Error("Unable to read macOS secret store.");
    }
  }

  /** @param {string} service @param {string} secret @returns {void} */
  writeSecret(service, secret) {
    this.nativeCall(`const service = $(${JSON.stringify(service)}).dataUsingEncoding($.NSUTF8StringEncoding);
const data = $(${JSON.stringify(secret)}).dataUsingEncoding($.NSUTF8StringEncoding);
const item = Ref();
const status = $.SecKeychainFindGenericPassword(keychain[0], service.length, service.bytes, 0, null, null, null, item);
if (status === -25300) {
  check($.SecKeychainAddGenericPassword(keychain[0], service.length, service.bytes, service.length, service.bytes, data.length, data.bytes, null));
} else {
  check(status);
  check($.SecKeychainItemModifyAttributesAndData(item[0], null, data.length, data.bytes));
}`);
  }

  /** @param {string} service @returns {void} */
  deleteSecret(service) {
    try {
      this.subprocess.execFileSync(SECURITY, ["delete-generic-password", "-s", service, this.keychainPath], OPTIONS);
    } catch (error) {
      if (error?.status !== 44) throw new Error("Unable to delete macOS secret.");
    }
  }

  /** @returns {string[]} */
  listNames() {
    try {
      const dump = String(this.subprocess.execFileSync(SECURITY, ["dump-keychain", this.keychainPath], OPTIONS));
      return [...new Set(Array.from(dump.matchAll(/"svce"<blob>="([^"\n]+)"/g), (match) => match[1]))].sort();
    } catch {
      throw new Error("Unable to list macOS secret names.");
    }
  }

  /** Native APIs accept arbitrary UTF-8, including newlines, without an interactive command parser. @param {string} body */
  nativeCall(body) {
    const input = `ObjC.import('Foundation');
ObjC.import('Security');
function check(status) { if (status !== 0) throw new Error('Keychain operation failed'); }
const keychain = Ref();
check($.SecKeychainOpen(${JSON.stringify(this.keychainPath)}, keychain));
${body}\n`;
    try {
      this.subprocess.execFileSync("/usr/bin/osascript", ["-l", "JavaScript", "-"], { ...OPTIONS, input });
    } catch {
      // Subprocess errors can include the entire stdin script. Never attach their cause.
      throw new Error("macOS secret-store operation failed.");
    }
  }
}
