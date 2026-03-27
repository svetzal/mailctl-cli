import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAccounts as _loadAccounts } from "./accounts.js";
import { FileSystemGateway } from "./gateways/fs-gateway.js";
import {
  filterScanMailboxes as _filterScanMailboxes,
  forEachAccount as _forEachAccount,
  listMailboxes as _listMailboxes,
  scanForReceipts as _scanForReceipts,
} from "./imap-client.js";
import { forEachMailboxGroup, groupByMailbox } from "./imap-orchestration.js";
import { requireClassificationsData } from "./scan-data.js";
import { BIZ_FOLDER, PERSONAL_FOLDER, planMoves } from "./sort-logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

/**
 * Ensure IMAP folders exist, creating them if needed.
 * @param {import("imapflow").ImapFlow} client
 * @param {function(object): void} onProgress
 */
async function ensureFolders(client, onProgress) {
  for (const folder of [BIZ_FOLDER, PERSONAL_FOLDER]) {
    try {
      await client.mailboxOpen(folder);
      await client.mailboxClose();
      onProgress({ type: "folder-exists", folder });
    } catch {
      try {
        await client.mailboxCreate(folder);
        onProgress({ type: "folder-created", folder });
      } catch (err) {
        onProgress({ type: "folder-error", folder, error: err });
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
 * Sort receipt messages into Business/Personal folders.
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=false]  - just report what would be moved
 * @param {number}  [opts.months=24]     - how far back to scan
 * @param {string}  [opts.account]       - only sort this account (case-insensitive)
 * @param {object} [gateways] - injectable implementations for testing
 * @param {function(object): void} [onProgress] - receives structured progress events
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
  const allAccounts = loadAccounts();

  if (allAccounts.length === 0) {
    throw new Error("No accounts configured.");
  }

  const accountFilter = opts.account || null;
  const accounts = accountFilter
    ? allAccounts.filter((a) => a.name.toLowerCase() === accountFilter.toLowerCase())
    : allAccounts;

  if (accounts.length === 0) {
    throw new Error(`Account "${accountFilter}" not found.`);
  }

  const stats = { moved: 0, skipped: 0, alreadySorted: 0, unclassified: 0 };

  await forEachAccount(accounts, async (client, account) => {
    onProgress({ type: "account-start", name: account.name, user: account.user });

    await ensureFolders(client, onProgress);

    const list = await listMailboxes(client);
    const mailboxes = filterScanMailboxes(list, {
      excludeSent: true,
      excludePaths: ["Receipts/"],
    });

    const results = await scanForReceipts(client, account.name, mailboxes, { since });
    onProgress({ type: "scan-complete", count: results.length });

    await forEachMailboxGroup(client, groupByMailbox(results), async (mailbox, messages) => {
      const { business: bizUids, personal: personalUids } = planMoves(messages, classifications);

      // Count unclassified (those not explicitly in classifications)
      for (const msg of messages) {
        if (!classifications[msg.address]) stats.unclassified++;
      }

      if (bizUids.length > 0) {
        const label = `${mailbox} → ${BIZ_FOLDER}`;
        if (dryRun) {
          onProgress({ type: "move-dry-run", icon: "🏢", count: bizUids.length, label });
        } else {
          try {
            await client.messageMove(bizUids.join(","), BIZ_FOLDER, { uid: true });
            onProgress({ type: "moved", icon: "🏢", count: bizUids.length, label });
            stats.moved += bizUids.length;
          } catch (err) {
            onProgress({ type: "move-error", label, error: err });
            stats.skipped += bizUids.length;
          }
        }
      }

      if (personalUids.length > 0) {
        const label = `${mailbox} → ${PERSONAL_FOLDER}`;
        if (dryRun) {
          onProgress({ type: "move-dry-run", icon: "🏠", count: personalUids.length, label });
        } else {
          try {
            await client.messageMove(personalUids.join(","), PERSONAL_FOLDER, { uid: true });
            onProgress({ type: "moved", icon: "🏠", count: personalUids.length, label });
            stats.moved += personalUids.length;
          } catch (err) {
            onProgress({ type: "move-error", label, error: err });
            stats.skipped += personalUids.length;
          }
        }
      }
    });
  });

  return stats;
}
