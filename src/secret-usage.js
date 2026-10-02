/**
 * Usage mistakes on the secrets commands that are safe to show verbatim.
 * Every message is a fixed string chosen here, so nothing a caller or a
 * subprocess produced, and no secret value, can reach the terminal through it.
 */
const USAGE = {
  STDIN_FLAG_REQUIRED: "Standard input is not a terminal. Pass --stdin to read the secret from standard input.",
  TERMINAL_STDIN: "--stdin needs piped input, not a terminal. Omit --stdin to type the secret at a hidden prompt.",
  EMPTY_INPUT: "The secret was empty. Nothing was stored.",
};

/** @typedef {keyof typeof USAGE} SecretUsageCode */

export class SecretUsageError extends Error {
  /** @param {SecretUsageCode} code */
  constructor(code) {
    super(USAGE[code]);
    this.name = "SecretUsageError";
    this.code = code;
  }
}
