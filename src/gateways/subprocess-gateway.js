/**
 * Isolates subprocess execution so tests can inject a mock.
 */
import { execFileSync } from "node:child_process";

export class SubprocessGateway {
  /**
   * @param {string} cmd - path to executable
   * @param {string[]} args - argument list
   * @param {import("child_process").ExecFileSyncOptions} [opts]
   * @returns {Buffer|string}
   */
  execFileSync(cmd, args, opts) {
    return execFileSync(cmd, args, opts);
  }
}
