/**
 * Move command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js move handler so it can
 * be tested independently. All IMAP I/O is injected via deps.
 */
import { parseUidArgs, groupUidsByAccount } from "./move-logic.js";
import { filterAccountsByName } from "./cli-helpers.js";

/**
 * @typedef {object} MoveCommandDeps
 * @property {object[]} accounts - all configured accounts
 * @property {string|null} account - value of --account flag (or null)
 * @property {Function} forEachAccount - (accounts, fn) → Promise<void>
 * @property {Function} listMailboxes - (client) → Promise<Array>
 */

/**
 * Orchestrate moving emails by UID to a destination IMAP folder.
 *
 * Parses raw UID args, groups by account, validates the destination folder
 * exists on each account, then moves or dry-runs the operation.
 *
 * @param {string[]} uids - raw UID arguments from the CLI
 * @param {object} opts - CLI options (to, mailbox, dryRun)
 * @param {MoveCommandDeps} deps - injected dependencies
 * @returns {Promise<{ stats: { moved: number, failed: number, skipped: number }, results: Array }>}
 */
export async function moveCommand(uids, opts, deps) {
  const { accounts, account, forEachAccount, listMailboxes } = deps;
  const destination = opts.to;
  const sourceMailbox = opts.mailbox ?? "INBOX";
  const dryRun = opts.dryRun ?? false;

  const parsed = parseUidArgs(uids, account || null);

  if (parsed.length === 0) {
    throw new Error("No UIDs provided.");
  }

  const byAccount = groupUidsByAccount(parsed);

  const stats = { moved: 0, failed: 0, skipped: 0 };
  /** @type {Array<{ account: string, uid: string, status: string, error?: string, reason?: string }>} */
  const results = [];

  for (const [acctKey, acctUids] of byAccount) {
    const targetAccounts = filterAccountsByName(accounts, acctKey);

    if (targetAccounts.length === 0) {
      const msg = `Account "${acctKey}" not found.`;
      for (const uid of acctUids) {
        stats.failed++;
        results.push({ account: acctKey, uid, status: "failed", error: msg });
      }
      continue;
    }

    await forEachAccount(targetAccounts, async (client, acct) => {
      // Validate destination folder exists
      const folders = await listMailboxes(client);
      const folderExists = folders.some((f) => f.path === destination);
      if (!folderExists) {
        const available = folders.map((f) => f.path).join(", ");
        throw new Error(
          `Destination folder "${destination}" does not exist on ${acct.name}. Available: ${available}`
        );
      }

      // Lock source mailbox
      let lock;
      try {
        lock = await client.getMailboxLock(sourceMailbox);
      } catch (err) {
        const msg = `Could not open source mailbox "${sourceMailbox}" on ${acct.name}: ${err.message}`;
        for (const uid of acctUids) {
          stats.failed++;
          results.push({ account: acct.name, uid, status: "failed", error: msg });
        }
        return;
      }

      try {
        const uidRange = acctUids.join(",");

        if (dryRun) {
          stats.skipped += acctUids.length;
          for (const uid of acctUids) {
            results.push({ account: acct.name, uid, status: "skipped", reason: "dry-run" });
          }
        } else {
          try {
            await client.messageMove(uidRange, destination, { uid: true });
            stats.moved += acctUids.length;
            for (const uid of acctUids) {
              results.push({ account: acct.name, uid, status: "moved" });
            }
          } catch (err) {
            stats.failed += acctUids.length;
            for (const uid of acctUids) {
              results.push({ account: acct.name, uid, status: "failed", error: err.message });
            }
          }
        }
      } finally {
        lock.release();
      }
    });
  }

  return { stats, results };
}
