import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAccounts as _loadAccounts } from "./accounts.js";
import { resolveAccounts } from "./cli-helpers.js";
import { debug } from "./debug.js";
import { FileSystemGateway } from "./gateways/fs-gateway.js";
import {
  filterScanMailboxes as _filterScanMailboxes,
  forEachAccount as _forEachAccount,
  listMailboxes as _listMailboxes,
  scanForReceipts as _scanForReceipts,
} from "./imap-client.js";
import { forEachMailboxGroup, groupByMailbox } from "./imap-orchestration.js";
import { requireClassificationsData } from "./scan-data.js";
import {
  accountStart,
  folderCreated,
  folderError,
  folderExists,
  moveDryRun,
  moved,
  moveError,
  scanComplete,
} from "./sort-event-factories.js";
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
        onProgress(folderError(err, folder));
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
 * @param {import("imapflow").ImapFlow} client
 * @param {Array<number|string>} uids
 * @param {string} folder
 * @param {string} icon
 * @param {string} mailbox
 * @param {boolean} dryRun
 * @param {function(object): void} onProgress
 * @param {{moved: number, skipped: number}} stats
 */
async function moveGroup(client, uids, folder, icon, mailbox, dryRun, onProgress, stats) {
  if (uids.length === 0) return;
  const label = `${mailbox} → ${folder}`;
  if (dryRun) {
    onProgress(moveDryRun(icon, uids.length, label));
  } else {
    try {
      await client.messageMove(uids.join(","), folder, { uid: true });
      onProgress(moved(icon, uids.length, label));
      stats.moved += uids.length;
    } catch (err) {
      onProgress(moveError(err, label));
      stats.skipped += uids.length;
    }
  }
}

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

      await moveGroup(client, bizUids, BIZ_FOLDER, "🏢", mailbox, dryRun, onProgress, stats);
      await moveGroup(client, personalUids, PERSONAL_FOLDER, "🏠", mailbox, dryRun, onProgress, stats);
    });
  });

  return stats;
}
