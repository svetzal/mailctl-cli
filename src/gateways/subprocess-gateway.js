/**
 * Subprocess Gateway — thin wrapper around Node `child_process`.
 * Isolates subprocess execution so tests can inject a mock.
 * Contains no logic to test.
 */
import { execFileSync } from "child_process";

export class SubprocessGateway {
  /**
   * Synchronously execute a file with arguments.
   * @param {string} cmd - path to executable
   * @param {string[]} args - argument list
   * @param {import("child_process").ExecFileSyncOptions} [opts]
   * @returns {Buffer|string}
   */
  execFileSync(cmd, args, opts) {
    return execFileSync(cmd, args, opts);
  }
}
