/**
 * Confirm Gateway — thin wrapper around readline for yes/no confirmation prompts.
 * Isolates terminal I/O so tests can inject a mock instead.
 * Contains no logic to test.
 */
import { createInterface } from "node:readline";

export class ConfirmGateway {
  /**
   * Display a prompt and return the user's raw answer string.
   * @param {string} prompt - question to display (e.g. "Send this reply? [y/N] ")
   * @returns {Promise<string>} the raw answer string
   */
  async confirm(prompt) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }
}
