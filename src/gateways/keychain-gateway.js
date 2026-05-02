/**
 * All keychain I/O is isolated here so tests can inject a mock instead.
 */
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const SECURITY = "/usr/bin/security";
const NEWT_KC = join(homedir(), ".newt", "newt-keychain-db");

export class KeychainGateway {
  /**
   * Unlock the newt keychain using the password stored in the login keychain.
   * Must be called once before any readSecret() calls that target the newt keychain.
   * @throws {Error} if the keychain password cannot be read or unlock fails
   */
  unlockNewtKeychain() {
    const password = execFileSync(
      SECURITY,
      ["find-generic-password", "-a", "newt", "-s", "newt-keychain-password", "-w"],
      {
        encoding: "utf-8",
      },
    ).trim();

    execFileSync(SECURITY, ["unlock-keychain", "-p", password, NEWT_KC], {
      encoding: "utf-8",
    });
  }

  /**
   * @param {string} service - keychain service name
   * @param {string} [keychainPath] - path to the keychain file (defaults to newt keychain)
   * @returns {string|null} secret value, or null if not found
   */
  readSecret(service, keychainPath = NEWT_KC) {
    try {
      return execFileSync(SECURITY, ["find-generic-password", "-s", service, "-w", keychainPath], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();
    } catch {
      return null;
    }
  }
}
