/**
 * Pure logic for the `move` command.
 * No I/O — takes plain data, returns plain data.
 */

/**
 * @typedef {{ account: string, uid: string }} ParsedUid
 */

/**
 * Parse raw UID arguments from the CLI into structured account+uid pairs.
 *
 * Each arg may be a comma-separated list of UIDs. Each UID may be:
 * - Plain: `"12345"` — requires a defaultAccount to be provided.
 * - Prefixed: `"icloud:12345"` — account is taken from the prefix.
 *
 * A prefix is detected when a colon appears and the text before it is NOT
 * all digits (to avoid treating UID values like `"12345:6789"` as a prefix).
 *
 * @param {string[]} uidArgs - raw CLI arguments
 * @param {string|null} defaultAccount - value of --account option (or null)
 * @returns {ParsedUid[]}
 * @throws {Error} when a UID has no prefix and no defaultAccount is provided
 */
export function parseUidArgs(uidArgs, defaultAccount) {
  const parsed = [];

  for (const arg of uidArgs) {
    for (const part of arg
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      const colonIdx = part.indexOf(":");
      const hasAccountPrefix = colonIdx > 0 && !/^\d+$/.test(part.substring(0, colonIdx));

      if (hasAccountPrefix) {
        parsed.push({
          account: part.substring(0, colonIdx),
          uid: part.substring(colonIdx + 1),
        });
      } else {
        if (!defaultAccount) {
          throw new Error(
            `UID "${part}" has no account prefix. Use --account <name> or prefix UIDs like "icloud:${part}".`,
          );
        }
        parsed.push({ account: defaultAccount, uid: part });
      }
    }
  }

  return parsed;
}

/**
 * Group parsed UID entries by (lowercase) account name.
 *
 * @param {ParsedUid[]} parsed
 * @returns {Map<string, string[]>} map of account key → UID array
 */
export function groupUidsByAccount(parsed) {
  const byAccount = new Map();

  for (const { account, uid } of parsed) {
    const key = account.toLowerCase();
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key).push(uid);
  }

  return byAccount;
}
