import {
  scanForReceipts as _scanForReceipts,
  listMailboxes as _listMailboxes,
  filterScanMailboxes as _filterScanMailboxes,
  forEachAccount as _forEachAccount,
} from "./imap-client.js";
import { loadAccounts as _loadAccounts } from "./accounts.js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { BIZ_FOLDER, PERSONAL_FOLDER, planMoves } from "./sort-logic.js";
import { groupByMailbox, forEachMailboxGroup } from "./imap-orchestration.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

/**
 * Ensure IMAP folders exist, creating them if needed.
 * @param {import("imapflow").ImapFlow} client
 */
async function ensureFolders(client) {
  for (const folder of [BIZ_FOLDER, PERSONAL_FOLDER]) {
    try {
      await client.mailboxOpen(folder);
      await client.mailboxClose();
      console.error(`   ✅ Folder exists: ${folder}`);
    } catch {
      try {
        await client.mailboxCreate(folder);
        console.error(`   📁 Created folder: ${folder}`);
      } catch (err) {
        console.error(`   ❌ Failed to create ${folder}: ${err.message}`);
      }
    }
  }
}

/**
 * Load classifications from disk.
 * @returns {Record<string, string>}
 */
function loadClassifications() {
  const path = join(DATA_DIR, "classifications.json");
  if (!existsSync(path)) {
    throw new Error("No classifications.json found. Run scan + classify first.");
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

/**
 * Real implementations used in production. Tests override individual keys.
 */
const defaultGateways = {
  loadClassifications,
  loadAccounts:        _loadAccounts,
  forEachAccount:      _forEachAccount,
  listMailboxes:       _listMailboxes,
  filterScanMailboxes: _filterScanMailboxes,
  scanForReceipts:     _scanForReceipts,
};

/**
 * Sort receipt messages into Business/Personal folders.
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=false]  - just report what would be moved
 * @param {number}  [opts.months=24]     - how far back to scan
 * @param {string}  [opts.account]       - only sort this account (case-insensitive)
 * @param {object} [gateways] - injectable implementations for testing
 */
export async function sortReceipts(opts = {}, gateways = {}) {
  const {
    loadClassifications,
    loadAccounts,
    forEachAccount,
    listMailboxes,
    filterScanMailboxes,
    scanForReceipts,
  } = { ...defaultGateways, ...gateways };

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
    console.error(`\n📬 Sorting ${account.name} (${account.user})...`);

    await ensureFolders(client);

    const list = await listMailboxes(client);
    const mailboxes = filterScanMailboxes(list, {
      excludeSent: true,
      excludePaths: ["Receipts/"],
    });

    const results = await scanForReceipts(client, account.name, mailboxes, { since });
    console.error(`   🔍 Found ${results.length} receipt messages to sort`);

    await forEachMailboxGroup(client, groupByMailbox(results), async (mailbox, messages) => {
      const { business: bizUids, personal: personalUids } = planMoves(messages, classifications);

      // Count unclassified (those not explicitly in classifications)
      for (const msg of messages) {
        if (!classifications[msg.address]) stats.unclassified++;
      }

      if (bizUids.length > 0) {
        const label = `${mailbox} → ${BIZ_FOLDER}`;
        if (dryRun) {
          console.error(`   🏢 [DRY RUN] Would move ${bizUids.length} messages: ${label}`);
        } else {
          try {
            await client.messageMove(bizUids.join(","), BIZ_FOLDER, { uid: true });
            console.error(`   🏢 Moved ${bizUids.length} messages: ${label}`);
            stats.moved += bizUids.length;
          } catch (err) {
            console.error(`   ⚠️  Move failed (${label}): ${err.message}`);
            stats.skipped += bizUids.length;
          }
        }
      }

      if (personalUids.length > 0) {
        const label = `${mailbox} → ${PERSONAL_FOLDER}`;
        if (dryRun) {
          console.error(`   🏠 [DRY RUN] Would move ${personalUids.length} messages: ${label}`);
        } else {
          try {
            await client.messageMove(personalUids.join(","), PERSONAL_FOLDER, { uid: true });
            console.error(`   🏠 Moved ${personalUids.length} messages: ${label}`);
            stats.moved += personalUids.length;
          } catch (err) {
            console.error(`   ⚠️  Move failed (${label}): ${err.message}`);
            stats.skipped += personalUids.length;
          }
        }
      }
    });
  });

  return stats;
}
