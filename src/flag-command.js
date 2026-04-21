/**
 * Flag command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js flag handler so it can
 * be tested independently. All IMAP I/O is injected via deps.
 */

import { filterAccountsByName } from "./cli-helpers.js";
import { applyFlagChanges, computeFlagChanges } from "./flag-messages.js";
import { filterSearchMailboxes } from "./imap-client.js";
import { withMailboxLock } from "./imap-orchestration.js";
import { detectMailbox } from "./mailbox-detect.js";
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
 * Orchestrate setting or clearing flags on messages by UID.
 *
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
  const stats = { flagged: 0, failed: 0, skipped: 0 };
  /** @type {FlagResult[]} */
  const results = [];

  for (const [acctKey, acctUids] of byAccount) {
    const targetAccounts = filterAccountsByName(accounts, acctKey);

    if (targetAccounts.length === 0) {
      const msg = `Account "${acctKey}" not found.`;
      stats.failed++;
      results.push({ status: "failed", account: acctKey, uids: acctUids.map(Number), error: msg });
      continue;
    }

    await forEachAccount(targetAccounts, async (client, acct) => {
      const uidRange = acctUids.join(",");

      let mailbox = opts.mailbox;
      if (!mailbox) {
        const allBoxes = await listMailboxes(client);
        const paths = filterSearchMailboxes(allBoxes);
        mailbox = await detectMailbox(client, acctUids[0], paths);
        if (!mailbox) {
          const msg = `UID ${acctUids[0]} not found in any mailbox on ${acct.name}`;
          stats.failed++;
          results.push({ status: "failed", account: acct.name, uids: acctUids.map(Number), error: msg });
          return;
        }
      }

      if (opts.dryRun) {
        stats.skipped++;
        results.push({
          status: "skipped",
          dryRun: true,
          uids: acctUids.map(Number),
          added: changes.add,
          removed: changes.remove,
          account: acct.name,
          mailbox,
        });
        return;
      }

      await withMailboxLock(
        client,
        mailbox,
        async () => {
          try {
            const flagResult = await applyFlagChanges(client, uidRange, changes);
            stats.flagged++;
            results.push({
              status: "flagged",
              dryRun: false,
              uids: acctUids.map(Number),
              added: flagResult.added,
              removed: flagResult.removed,
              account: acct.name,
              mailbox,
            });
          } catch (err) {
            stats.failed++;
            results.push({
              status: "failed",
              account: acct.name,
              uids: acctUids.map(Number),
              mailbox,
              error: err.message,
            });
          }
        },
        {
          onLockFailed: (err) => {
            const msg = `Could not open mailbox "${mailbox}" on ${acct.name}: ${err.message}`;
            stats.failed++;
            results.push({ status: "failed", account: acct.name, uids: acctUids.map(Number), error: msg });
          },
        },
      );
    });
  }

  return { stats, results };
}
