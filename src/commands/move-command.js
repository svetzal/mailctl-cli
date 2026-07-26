/**
 * Move command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js move handler so it can
 * be tested independently. All IMAP I/O is injected via deps.
 */

import { createBatchAccumulator, expandPerUid } from "../batch-results.js";
import { filterAccountsByName } from "../cli-helpers.js";
import { withMailboxLock } from "../imap-orchestration.js";
import { parseAndGroupUids } from "../move-logic.js";

/**
 * @typedef {object} MoveCommandDeps
 * @property {object[]} accounts - all configured accounts
 * @property {string|null} account - value of --account flag (or null)
 * @property {Function} forEachAccount - (accounts, fn) → Promise<void>
 * @property {Function} listMailboxes - (client) → Promise<Array>
 */

/**
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

  const byAccount = parseAndGroupUids(uids, account || null);

  const acc = createBatchAccumulator(["moved", "failed", "skipped"]);

  for (const [acctKey, acctUids] of byAccount) {
    const targetAccounts = filterAccountsByName(accounts, acctKey);

    if (targetAccounts.length === 0) {
      const msg = `Account "${acctKey}" not found.`;
      acc.record("failed", expandPerUid(acctUids, { account: acctKey, status: "failed", error: msg }));
      continue;
    }

    const { accountFailures = [] } =
      (await forEachAccount(targetAccounts, async (client, acct) => {
        // Validate destination folder exists
        const folders = await listMailboxes(client);
        const folderExists = folders.some((f) => f.path === destination);
        if (!folderExists) {
          const available = folders.map((f) => f.path).join(", ");
          const msg = `Destination folder "${destination}" does not exist on ${acct.name}. Available: ${available}`;
          acc.record("failed", expandPerUid(acctUids, { account: acct.name, status: "failed", error: msg }));
          return;
        }

        // Lock source mailbox
        const lockResult = await withMailboxLock(client, sourceMailbox, async () => {
          const uidRange = acctUids.join(",");

          if (dryRun) {
            acc.record("skipped", expandPerUid(acctUids, { account: acct.name, status: "skipped", reason: "dry-run" }));
          } else {
            try {
              await client.messageMove(uidRange, destination, { uid: true });
              acc.record("moved", expandPerUid(acctUids, { account: acct.name, status: "moved" }));
            } catch (err) {
              acc.record(
                "failed",
                expandPerUid(acctUids, { account: acct.name, status: "failed", error: err.message }),
              );
            }
          }
        });

        if (lockResult === null) {
          const msg = `Could not open source mailbox "${sourceMailbox}" on ${acct.name}`;
          acc.record("failed", expandPerUid(acctUids, { account: acct.name, status: "failed", error: msg }));
        }
      })) ?? {};

    for (const failure of accountFailures) {
      const msg = `Could not connect to ${failure.account}: ${failure.error}`;
      acc.record("failed", expandPerUid(acctUids, { account: failure.account, status: "failed", error: msg }));
    }
  }

  return /** @type {{ stats: { moved: number, failed: number, skipped: number }, results: Array<{ account: string, uid: string, status: string, error?: string, reason?: string }> }} */ (
    acc.getResult()
  );
}
