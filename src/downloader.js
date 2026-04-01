import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAccounts as _loadAccounts } from "./accounts.js";
import { findPdfParts } from "./attachment-parts.js";
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
import { getVendorDisplayNames } from "./vendor-map.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

import { getConfigDownloadDir } from "./config.js";

/**
 * Vendor name mappings for clean filenames.
 * Loaded from config via vendor-map.js.
 * @returns {Record<string, string>}
 */
export function getVendorNames() {
  return getVendorDisplayNames();
}

/**
 * Derive a clean vendor name from sender info.
 * @param {string} address - sender email address
 * @param {string} [senderName] - sender display name
 * @returns {string}
 */
export function vendorName(address, senderName) {
  const addrLower = (address || "").toLowerCase();
  const vendorNames = getVendorNames();
  if (vendorNames[addrLower]) return vendorNames[addrLower];

  // Try to clean up the sender name
  let name = senderName || address.split("@")[0];
  // Remove common suffixes
  name = name
    .replace(/,?\s*(Inc\.?|LLC|Ltd\.?|Corp\.?|PBC|Limited|Co\.?)\s*/gi, "")
    .replace(/\s*(via Stripe|via Clover|via FastSpring Checkout)\s*/gi, "")
    .replace(/[^\w\s.-]/g, "")
    .trim();

  // Truncate at word boundary if too long
  if (name.length > 30) {
    name = name
      .slice(0, 30)
      .replace(/\s+\S*$/, "")
      .trim();
  }

  return name || address.split("@")[0];
}

/**
 * Build a predictable filename: "Vendor YYYY-MM-DD[_N].pdf"
 * Matches the convention in the 2025 receipts folder.
 * @param {string} vendor
 * @param {Date|string} date
 * @param {string|null} _attachmentName
 * @param {Set<string>} existingFiles - lowercase filenames already used
 * @returns {string}
 */
export function buildFilename(vendor, date, _attachmentName, existingFiles) {
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  const base = `${vendor} ${yyyy}-${mm}-${dd}`;
  let filename = `${base}.pdf`;

  // Handle duplicates with incrementing suffix
  let n = 1;
  while (existingFiles.has(filename.toLowerCase())) {
    n++;
    filename = `${base}_${n}.pdf`;
  }

  return filename;
}

const _defaultFs = new FileSystemGateway();

/**
 * Load the download manifest (tracks what we've already downloaded).
 */
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
 * Download PDF attachments from business receipt emails.
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=false]
 * @param {number}  [opts.months=24]
 * @param {string}  [opts.outputDir] - override output directory
 * @param {string}  [opts.account]   - only download from this account (case-insensitive)
 * @param {object} [gateways] - injectable implementations for testing
 * @param {function(object): void} [onProgress] - receives structured progress events
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
        existingHashes.add(createHash("sha256").update(buf).digest("hex"));
      } catch (err) {
        // Hash file missing or unreadable — treat as not downloaded
        debug("downloader", "hash read failed, will re-download", err);
      }
    }
  }

  await forEachAccount(accounts, async (client, account) => {
    onProgress({ type: "download-account-start", name: account.name, user: account.user });

    const list = await listMailboxes(client);
    const mailboxes = filterScanMailboxes(list, {
      excludeSent: true,
      excludePaths: ["Receipts/Personal"],
    });

    const results = await scanForReceipts(client, account.name, mailboxes, { since });

    // Filter to business only
    const bizResults = results.filter((r) => classifications[r.address] === "business");
    onProgress({ type: "download-biz-count", count: bizResults.length });

    await forEachMailboxGroup(client, groupByMailbox(bizResults), async (mailbox, messages) => {
      for (const msg of messages) {
        const manifestKey = `${account.user}:${mailbox}:${msg.uid}`;

        if (manifest[manifestKey]) {
          stats.alreadyHave++;
          continue;
        }

        // Fetch body structure to find PDF attachments
        let bodyStructure;
        try {
          for await (const fetched of client.fetch(String(msg.uid), { bodyStructure: true }, { uid: true })) {
            bodyStructure = fetched.bodyStructure;
          }
        } catch (err) {
          onProgress({ type: "fetch-structure-error", uid: msg.uid, error: err });
          continue;
        }

        if (!bodyStructure) continue;

        // Find PDF parts
        const pdfParts = findPdfParts(bodyStructure);

        if (pdfParts.length === 0) {
          stats.noPdf++;
          manifest[manifestKey] = { status: "no-pdf", date: msg.date };
          continue;
        }

        const vendor = vendorName(msg.address, msg.name);

        for (const part of pdfParts) {
          const filename = buildFilename(vendor, msg.date, part.filename, existingFiles);

          if (dryRun) {
            onProgress({ type: "download-dry-run", filename });
            stats.downloaded++;
          } else {
            try {
              // Download the attachment
              const { content } = await client.download(String(msg.uid), part.part, { uid: true });

              const chunks = [];
              for await (const chunk of content) {
                chunks.push(chunk);
              }
              const buffer = Buffer.concat(chunks);

              // Verify it's actually a PDF
              if (buffer.length < 5 || buffer.subarray(0, 5).toString() !== "%PDF-") {
                onProgress({ type: "invalid-pdf", filename });
                continue;
              }

              // Content-level dedup: skip if we already have this exact file
              const contentHash = createHash("sha256").update(buffer).digest("hex");
              if (existingHashes.has(contentHash)) {
                onProgress({ type: "duplicate-content", filename });
                stats.alreadyHave++;
                manifest[manifestKey] = { status: "duplicate", hash: contentHash.slice(0, 12), date: msg.date, vendor };
                continue;
              }
              existingHashes.add(contentHash);

              const outPath = join(outputDir, filename);
              fs.writeFile(outPath, buffer);
              existingFiles.add(filename.toLowerCase());
              onProgress({ type: "downloaded", filename, size: buffer.length });
              stats.downloaded++;

              // Record content hash in manifest for cross-run dedup
              const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 12);
              manifest[manifestKey] = {
                status: "downloaded",
                filename,
                hash,
                date: msg.date,
                vendor,
              };
            } catch (err) {
              onProgress({ type: "download-failed", filename, error: err });
              stats.skipped++;
            }
          }
        }
      }
    });
  });

  if (!dryRun) {
    saveManifest(manifest);
  }

  return stats;
}
