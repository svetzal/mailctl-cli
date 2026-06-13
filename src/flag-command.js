/**
 * Flag command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js flag handler so it can
 * be tested independently. All IMAP I/O is injected via deps.
 */

import { createBatchAccumulator } from "./batch-results.js";
import { filterAccountsByName } from "./cli-helpers.js";
import { applyFlagChanges, computeFlagChanges } from "./flag-messages.js";
import { withMailboxLock } from "./imap-orchestration.js";
import { detectMailboxAcrossAll } from "./mailbox-detect.js";
import { parseAndGroupUids } from "./move-logic.js";

/**
 * @typedef {object} FlagCommandDeps
 * @property {object[]} accounts - all configured accounts
 * @property {string|null} account - value of --account flag (or null)
 * @property {Function} forEachAccount - (accounts, fn) → Promise<void>
 * @property {Function} listMailboxes - (client) → Promise<Array>
 */

/**
 * @typedef {object} FlagResult
 * @property {string} status - "flagged", "skipped", or "failed"
 * @property {boolean} [dryRun]
 * @property {number[]} [uids]
 * @property {string[]} [added]
 * @property {string[]} [removed]
 * @property {string} account
 * @property {string} [mailbox]
 * @property {string} [error]
 */

/**
 * @typedef {object} FlagStats
 * @property {number} flagged
 * @property {number} failed
 * @property {number} skipped
 */

/**
 * @param {string[]} uids - raw UID arguments from the CLI
 * @param {object} opts - CLI options (read, unread, star, unstar, mailbox, dryRun)
 * @param {FlagCommandDeps} deps - injected dependencies
 * @returns {Promise<{ stats: FlagStats, results: FlagResult[] }>}
 */
export async function flagCommand(uids, opts, deps) {
  const { accounts, account, forEachAccount, listMailboxes } = deps;

  const changes = computeFlagChanges({
    read: opts.read,
    unread: opts.unread,
    star: opts.star,
    unstar: opts.unstar,
  });

  const byAccount = parseAndGroupUids(uids, account || null);
  const acc = createBatchAccumulator(["flagged", "failed", "skipped"]);

  for (const [acctKey, acctUids] of byAccount) {
    const targetAccounts = filterAccountsByName(accounts, acctKey);

    if (targetAccounts.length === 0) {
      const msg = `Account "${acctKey}" not found.`;
      acc.record("failed", [{ status: "failed", account: acctKey, uids: acctUids.map(Number), error: msg }]);
      continue;
    }

    await forEachAccount(targetAccounts, async (client, acct) => {
      const uidRange = acctUids.join(",");

      let mailbox = opts.mailbox;
      if (!mailbox) {
        mailbox = await detectMailboxAcrossAll(client, acctUids[0], listMailboxes);
        if (!mailbox) {
          const msg = `UID ${acctUids[0]} not found in any mailbox on ${acct.name}`;
          acc.record("failed", [{ status: "failed", account: acct.name, uids: acctUids.map(Number), error: msg }]);
          return;
        }
      }

      if (opts.dryRun) {
        acc.record("skipped", [
          {
            status: "skipped",
            dryRun: true,
            uids: acctUids.map(Number),
            added: changes.add,
            removed: changes.remove,
            account: acct.name,
            mailbox,
          },
        ]);
        return;
      }

      const lockResult = await withMailboxLock(client, mailbox, async () => {
        try {
          const flagResult = await applyFlagChanges(client, uidRange, changes);
          acc.record("flagged", [
            {
              status: "flagged",
              dryRun: false,
              uids: acctUids.map(Number),
              added: flagResult.added,
              removed: flagResult.removed,
              account: acct.name,
              mailbox,
            },
          ]);
        } catch (err) {
          acc.record("failed", [
            {
              status: "failed",
              account: acct.name,
              uids: acctUids.map(Number),
              mailbox,
              error: err.message,
            },
          ]);
        }
      });

      if (lockResult === null) {
        const msg = `Could not open mailbox "${mailbox}" on ${acct.name}`;
        acc.record("failed", [{ status: "failed", account: acct.name, uids: acctUids.map(Number), error: msg }]);
      }
    });
  }

  return /** @type {{ stats: FlagStats, results: FlagResult[] }} */ (acc.getResult());
}
