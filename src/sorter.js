import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAccounts as _loadAccounts } from "./accounts.js";
import { resolveAccounts } from "./cli-helpers.js";
import { debug } from "./debug.js";
import { errorEvent } from "./error-event.js";
import { FileSystemGateway } from "./gateways/fs-gateway.js";
import {
  filterScanMailboxes as _filterScanMailboxes,
  forEachAccount as _forEachAccount,
  listMailboxes as _listMailboxes,
  scanForReceipts as _scanForReceipts,
} from "./imap-client.js";
import { forEachMailboxGroup, groupByMailbox } from "./imap-orchestration.js";
import { requireClassificationsData } from "./scan-data.js";
import { accountStart, folderCreated, folderExists, moveDryRun, moved, scanComplete } from "./sort-event-factories.js";
import { BIZ_FOLDER, PERSONAL_FOLDER, planMoves } from "./sort-logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

/**
 * @param {import("imapflow").ImapFlow} client
 * @param {function(object): void} onProgress
 */
async function ensureFolders(client, onProgress) {
  for (const folder of [BIZ_FOLDER, PERSONAL_FOLDER]) {
    try {
      await client.mailboxOpen(folder);
      await client.mailboxClose();
      onProgress(folderExists(folder));
    } catch (err) {
      // Folder doesn't exist — fall through to create it
      debug("sorter", "folder not found, will create", err);
      try {
        await client.mailboxCreate(folder);
        onProgress(folderCreated(folder));
      } catch (err) {
        onProgress(errorEvent("folder-error", "error", err, { folder }));
      }
    }
  }
}

/**
 * Real implementations used in production. Tests override individual keys.
 */
const defaultGateways = {
  loadClassifications: () => requireClassificationsData(DATA_DIR, new FileSystemGateway()),
  loadAccounts: _loadAccounts,
  forEachAccount: _forEachAccount,
  listMailboxes: _listMailboxes,
  filterScanMailboxes: _filterScanMailboxes,
  scanForReceipts: _scanForReceipts,
};

/**
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=false]  - just report what would be moved
 * @param {number}  [opts.months=24]     - how far back to scan
 * @param {string}  [opts.account]       - only sort this account (case-insensitive)
 * @param {object} [gateways] - injectable implementations for testing
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{moved: number, skipped: number, alreadySorted: number, unclassified: number}>}
 */
export async function sortReceipts(opts = {}, gateways = {}, onProgress = () => {}) {
  const { loadClassifications, loadAccounts, forEachAccount, listMailboxes, filterScanMailboxes, scanForReceipts } = {
    ...defaultGateways,
    ...gateways,
  };

  const dryRun = opts.dryRun ?? false;
  const months = opts.months ?? 24;
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const classifications = loadClassifications();
  const accounts = resolveAccounts(opts.account || null, loadAccounts);

  const stats = { moved: 0, skipped: 0, alreadySorted: 0, unclassified: 0 };

  await forEachAccount(accounts, async (client, account) => {
    onProgress(accountStart(account.name, account.user));

    await ensureFolders(client, onProgress);

    const list = await listMailboxes(client);
    const mailboxes = filterScanMailboxes(list, {
      excludeSent: true,
      excludePaths: ["Receipts/"],
    });

    const results = await scanForReceipts(client, account.name, mailboxes, { since });
    onProgress(scanComplete(results.length));

    await forEachMailboxGroup(client, groupByMailbox(results), async (mailbox, messages) => {
      const { business: bizUids, personal: personalUids } = planMoves(messages, classifications);

      // Count unclassified (those not explicitly in classifications)
      for (const msg of messages) {
        if (!classifications[msg.address]) stats.unclassified++;
      }

      if (bizUids.length > 0) {
        const label = `${mailbox} → ${BIZ_FOLDER}`;
        if (dryRun) {
          onProgress(moveDryRun("🏢", bizUids.length, label));
        } else {
          try {
            await client.messageMove(bizUids.join(","), BIZ_FOLDER, { uid: true });
            onProgress(moved("🏢", bizUids.length, label));
            stats.moved += bizUids.length;
          } catch (err) {
            onProgress(errorEvent("move-error", "error", err, { label }));
            stats.skipped += bizUids.length;
          }
        }
      }

      if (personalUids.length > 0) {
        const label = `${mailbox} → ${PERSONAL_FOLDER}`;
        if (dryRun) {
          onProgress(moveDryRun("🏠", personalUids.length, label));
        } else {
          try {
            await client.messageMove(personalUids.join(","), PERSONAL_FOLDER, { uid: true });
            onProgress(moved("🏠", personalUids.length, label));
            stats.moved += personalUids.length;
          } catch (err) {
            onProgress(errorEvent("move-error", "error", err, { label }));
            stats.skipped += personalUids.length;
          }
        }
      }
    });
  });

  return stats;
}
