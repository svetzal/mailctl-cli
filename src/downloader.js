import { join } from "node:path";
import { loadAccounts as _loadAccounts } from "./accounts.js";
import { resolveAccounts } from "./cli-helpers.js";
import { getConfigDownloadDir } from "./config.js";
import { DATA_DIR } from "./data-dir.js";
import { downloadAccountStart, downloadBizCount, hashReadError } from "./download-event-factories.js";
import { FileSystemGateway } from "./gateways/fs-gateway.js";
import {
  filterScanMailboxes as _filterScanMailboxes,
  forEachAccount as _forEachAccount,
  listMailboxes as _listMailboxes,
  scanForReceipts as _scanForReceipts,
} from "./imap-client.js";
import { forEachMailboxGroup, groupByMailbox } from "./imap-orchestration.js";
import { processDownloadMessage } from "./receipts/process-download-message.js";
import { contentHash } from "./receipts/receipt-decisions.js";
import { requireClassificationsData } from "./scan-data.js";

export { buildFilename, getVendorNames, vendorName } from "./download-filename.js";

const _defaultFs = new FileSystemGateway();

/** @returns {Record<string, object>} */
function loadManifest() {
  const path = join(DATA_DIR, "download-manifest.json");
  return _defaultFs.exists(path) ? /** @type {Record<string, object>} */ (_defaultFs.readJson(path)) : {};
}

function saveManifest(manifest) {
  _defaultFs.mkdir(DATA_DIR);
  _defaultFs.writeJson(join(DATA_DIR, "download-manifest.json"), manifest);
}

/**
 * Default implementations used in production. Tests override individual keys.
 */
const defaultGateways = {
  loadAccounts: _loadAccounts,
  forEachAccount: _forEachAccount,
  listMailboxes: _listMailboxes,
  filterScanMailboxes: _filterScanMailboxes,
  scanForReceipts: _scanForReceipts,
  loadClassifications: () => requireClassificationsData(DATA_DIR, new FileSystemGateway()),
  loadManifest,
  saveManifest,
  fs: _defaultFs,
};

/**
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=false]
 * @param {number}  [opts.months=24]
 * @param {string}  [opts.outputDir] - override output directory
 * @param {string}  [opts.account]   - only download from this account (case-insensitive)
 * @param {object} [gateways] - injectable implementations for testing
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{downloaded: number, skipped: number, noPdf: number, alreadyHave: number}>}
 */
export async function downloadReceipts(opts = {}, gateways = {}, onProgress = () => {}) {
  const {
    loadAccounts,
    forEachAccount,
    listMailboxes,
    filterScanMailboxes,
    scanForReceipts,
    loadClassifications,
    loadManifest,
    saveManifest,
    fs,
  } = { ...defaultGateways, ...gateways };

  const dryRun = opts.dryRun ?? false;
  const months = opts.months ?? 24;
  const outputDir = opts.outputDir || getConfigDownloadDir();
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const classifications = loadClassifications();

  // Ensure output directory exists
  if (!dryRun) {
    fs.mkdir(outputDir);
  }

  const manifest = loadManifest();
  const accounts = resolveAccounts(opts.account || null, loadAccounts);

  const stats = { downloaded: 0, skipped: 0, noPdf: 0, alreadyHave: 0 };

  // Track existing files and content hashes for dedup
  const existingFiles = new Set();
  const existingHashes = new Set();
  const fileListing = fs.exists(outputDir) ? fs.readdir(outputDir) : [];

  for (const f of fileListing) {
    existingFiles.add(f.toLowerCase());
    // Hash existing PDFs for content-level dedup
    if (f.toLowerCase().endsWith(".pdf")) {
      try {
        const buf = fs.readBuffer(join(outputDir, f));
        existingHashes.add(contentHash(buf));
      } catch (err) {
        onProgress(hashReadError(err, f));
      }
    }
  }

  await forEachAccount(accounts, async (client, account) => {
    onProgress(downloadAccountStart(account.name, account.user));

    const list = await listMailboxes(client);
    const mailboxes = filterScanMailboxes(list, {
      excludeSent: true,
      excludePaths: ["Receipts/Personal"],
    });

    const { results } = await scanForReceipts(client, account.name, mailboxes, { since });

    // Filter to business only
    const bizResults = results.filter((r) => classifications[r.address] === "business");
    onProgress(downloadBizCount(bizResults.length));

    await forEachMailboxGroup(client, groupByMailbox(bizResults), async (mailbox, messages) => {
      for (const msg of messages) {
        const { action } = await processDownloadMessage(client, msg, mailbox, {
          account,
          manifest,
          dryRun,
          outputDir,
          existingFiles,
          existingHashes,
          fs,
          onProgress,
        });
        if (action === "downloaded") stats.downloaded++;
        else if (action === "noPdf") stats.noPdf++;
        else if (action === "alreadyHave") stats.alreadyHave++;
        else if (action === "skipped") stats.skipped++;
      }
    });
  });

  if (!dryRun) {
    saveManifest(manifest);
  }

  return stats;
}
