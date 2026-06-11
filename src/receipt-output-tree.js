/**
 * Output directory tree utilities for receipt files.
 * Handles walking the <root>/<YYYY>/<MM>/<file> tree, scanning existing
 * invoices and hashes, unique base name generation, sidecar collection,
 * and writing receipt output files.
 */

import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  downloadedPdf,
  dryRunJson,
  dryRunMetadata,
  dryRunPdf,
  skipDuplicate,
  wroteMetadata,
} from "./download-receipts-event-factories.js";
import { cleanVendorForFilename } from "./receipt-extraction.js";

// Cap derived filename base length
const MAX_RECEIPT_BASENAME_LENGTH = 60;

/**
 * Pure: computes the month subdirectory path for the given email date.
 * @param {string} outputDir
 * @param {Date|string} emailDate
 * @returns {string}
 */
export function receiptMonthDir(outputDir, emailDate) {
  const d = emailDate instanceof Date ? emailDate : new Date(emailDate);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return join(outputDir, yyyy, mm);
}

/**
 * Pure: derives the raw base filename for a receipt (before collision handling).
 * Applies vendor name cleaning, invoice-number sanitization, and the 60-char truncation rule.
 *
 * @param {object} metadata - extracted receipt metadata (invoice_number, date)
 * @param {object} msg - envelope (fromAddress, fromName)
 * @param {string} bodyText - plain-text email body
 * @param {string} subject - email subject
 * @returns {{ rawBase: string, vendorClean: string }}
 */
export function deriveReceiptBaseName(metadata, msg, bodyText, subject) {
  const vendorClean = cleanVendorForFilename(msg.fromAddress, msg.fromName, bodyText, subject);
  let rawBase;
  if (metadata.invoice_number) {
    const safeInvoice = metadata.invoice_number
      .replace(/[/\\:*?"<>|]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    rawBase = `${vendorClean}-${safeInvoice}`;
  } else {
    rawBase = `${vendorClean}-${metadata.date}`;
  }
  if (rawBase.length > MAX_RECEIPT_BASENAME_LENGTH) {
    rawBase = rawBase.slice(0, MAX_RECEIPT_BASENAME_LENGTH).replace(/[-_][^-_]*$/, "");
    rawBase = rawBase.replace(/[-._]+$/, "");
  }
  return { rawBase, vendorClean };
}

/**
 * Pure: computes a write plan for a receipt — no filesystem calls.
 * Hashes the PDF for dedup, returns action, file paths, content buffers, and updated metadata.
 *
 * @param {object} params
 * @param {object} params.metadata
 * @param {Array} params.pdfAttachments
 * @param {string} params.baseName - unique base name (post collision-check)
 * @param {string} params.monthDir - output month directory path
 * @param {Set<string>} params.existingHashes - known SHA-256 hashes of existing PDFs
 * @param {string} params.vendorClean - sanitized vendor name (used for dup label)
 * @returns {{ action: 'downloaded'|'noPdf'|'duplicate', writes?: Array<{path: string, content: any}>, metadata?: object, dupLabel?: string }}
 */
export function planReceiptWrite({ metadata, pdfAttachments, baseName, monthDir, existingHashes, vendorClean }) {
  const jsonFilename = `${baseName}.json`;
  const jsonPath = join(monthDir, jsonFilename);

  if (pdfAttachments.length > 0) {
    const att = pdfAttachments[0];
    const contentHash = createHash("sha256").update(att.content).digest("hex");

    if (existingHashes.has(contentHash)) {
      const dupLabel = metadata.invoice_number
        ? `${vendorClean} ${metadata.invoice_number}`
        : `${vendorClean} (${metadata.date})`;
      return { action: "duplicate", dupLabel };
    }

    const pdfFilename = `${baseName}.pdf`;
    const pdfPath = join(monthDir, pdfFilename);
    const updatedMetadata = { ...metadata, receipt_file: pdfFilename };

    return {
      action: "downloaded",
      writes: [
        { path: pdfPath, content: att.content },
        { path: jsonPath, content: JSON.stringify(updatedMetadata, null, 2) },
      ],
      metadata: updatedMetadata,
    };
  }

  const updatedMetadata = { ...metadata, receipt_file: null };
  return {
    action: "noPdf",
    writes: [{ path: jsonPath, content: JSON.stringify(updatedMetadata, null, 2) }],
    metadata: updatedMetadata,
  };
}

/**
 * Walk the year/month output directory tree, invoking visitor for each file.
 * Encapsulates the <root>/<YYYY>/<MM>/<file> directory convention.
 * @param {string} outputDir
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} fs
 * @param {(filePath: string, fileName: string) => void} visitor
 * @param {(err: Error, context: object) => void} [onError] - called when any directory read or visitor invocation fails
 * @returns {void}
 */
export function walkOutputTree(outputDir, fs, visitor, onError = () => {}) {
  if (!fs.exists(outputDir)) return;

  try {
    for (const yearDir of fs.readdir(outputDir)) {
      if (!/^\d{4}$/.test(yearDir)) continue;
      const yearPath = join(outputDir, yearDir);
      try {
        for (const monthDir of fs.readdir(yearPath)) {
          const monthPath = join(yearPath, monthDir);
          try {
            for (const file of fs.readdir(monthPath)) {
              try {
                visitor(join(monthPath, file), file);
              } catch (err) {
                onError(err, { path: join(monthPath, file), level: "file", op: "visitor" });
              }
            }
          } catch (err) {
            onError(err, { path: monthPath, level: "month", op: "readdir" });
          }
        }
      } catch (err) {
        onError(err, { path: yearPath, level: "year", op: "readdir" });
      }
    }
  } catch (err) {
    onError(err, { path: outputDir, level: "root", op: "readdir" });
  }
}

/**
 * @param {string} outputDir
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} fs
 * @param {(err: Error, context: object) => void} [onError] - called when any directory read or file read fails
 * @returns {Set<string>}
 */
export function loadExistingInvoiceNumbers(outputDir, fs, onError = () => {}) {
  const numbers = new Set();
  walkOutputTree(
    outputDir,
    fs,
    (filePath, fileName) => {
      if (!fileName.endsWith(".json")) return;
      const data = /** @type {any} */ (fs.readJson(filePath));
      if (data.invoice_number) numbers.add(data.invoice_number);
    },
    onError,
  );
  return numbers;
}

/**
 * @param {string} outputDir
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} fs
 * @param {(err: Error, context: object) => void} [onError] - called when any directory read or file read fails
 * @returns {Set<string>}
 */
export function loadExistingHashes(outputDir, fs, onError = () => {}) {
  const hashes = new Set();
  walkOutputTree(
    outputDir,
    fs,
    (filePath, fileName) => {
      if (!fileName.toLowerCase().endsWith(".pdf")) return;
      const buf = fs.readBuffer(filePath);
      hashes.add(createHash("sha256").update(buf).digest("hex"));
    },
    onError,
  );
  return hashes;
}

/**
 * Generate a unique base name for output files within a directory.
 * Appends _2, _3, etc. if name already used or files already exist on disk.
 * @param {string} dir
 * @param {string} base
 * @param {Set<string>} usedPaths - tracks names used in this run
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} fs
 * @returns {string}
 */
export function uniqueBaseName(dir, base, usedPaths, fs) {
  let name = base;
  let n = 1;
  const key = (suffix) => `${dir}/${suffix === 1 ? base : `${base}_${suffix}`}`.toLowerCase();

  while (usedPaths.has(key(n)) || fs.exists(join(dir, `${name}.json`)) || fs.exists(join(dir, `${name}.pdf`))) {
    n++;
    name = `${base}_${n}`;
  }

  usedPaths.add(`${dir}/${name}`.toLowerCase());
  return name;
}

/**
 * @param {string} outputDir
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} fs
 * @param {(err: Error, context: object) => void} [onError] - called when a file or directory cannot be read
 * @returns {Array<{ jsonPath: string, sidecar: object }>}
 */
export function collectSidecarFiles(outputDir, fs, onError = () => {}) {
  const results = [];
  walkOutputTree(
    outputDir,
    fs,
    (filePath, fileName) => {
      if (!fileName.endsWith(".json")) return;
      const sidecar = /** @type {any} */ (fs.readJson(filePath));
      results.push({ jsonPath: filePath, sidecar });
    },
    onError,
  );
  return results;
}

/**
 * Thin shell: orchestrates path derivation, collision checks, plan execution, and progress events
 * for writing one receipt to disk.
 *
 * @param {object} params
 * @param {object} params.metadata
 * @param {Array} params.pdfAttachments
 * @param {object} params.msg - envelope result
 * @param {string} params.bodyText
 * @param {object} params.parsed - parsed email
 * @param {Date} params.emailDate
 * @param {string} params.outputDir
 * @param {boolean} params.dryRun
 * @param {Set<string>} params.existingHashes
 * @param {Set<string>} params.usedPaths
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} params.fs
 * @param {function(object): void} [params.onProgress] - receives structured progress events
 * @returns {{ action: 'downloaded'|'noPdf'|'duplicate', metadata: object }}
 */
export function writeReceiptOutput({
  metadata,
  pdfAttachments,
  msg,
  bodyText,
  parsed,
  emailDate,
  outputDir,
  dryRun,
  existingHashes,
  usedPaths,
  fs,
  onProgress = () => {},
}) {
  const monthDir = receiptMonthDir(outputDir, emailDate);
  const { rawBase, vendorClean } = deriveReceiptBaseName(metadata, msg, bodyText, parsed.subject || msg.subject);
  const baseName = uniqueBaseName(monthDir, rawBase, usedPaths, fs);
  const plan = planReceiptWrite({ metadata, pdfAttachments, baseName, monthDir, existingHashes, vendorClean });

  if (plan.action === "duplicate") {
    onProgress(skipDuplicate(plan.dupLabel ?? ""));
    return { action: "duplicate", metadata };
  }

  const pdfFilename = `${baseName}.pdf`;
  const jsonFilename = `${baseName}.json`;

  if (!dryRun) {
    fs.mkdir(monthDir);
    for (const { path, content } of plan.writes ?? []) {
      fs.writeFile(path, content);
    }
  }

  if (plan.action === "downloaded") {
    if (dryRun) {
      onProgress(dryRunPdf(pdfFilename));
      onProgress(dryRunJson(jsonFilename));
    } else {
      onProgress(downloadedPdf(pdfFilename, pdfAttachments[0].content.length));
    }
  } else {
    if (dryRun) {
      onProgress(dryRunMetadata(jsonFilename));
    } else {
      onProgress(wroteMetadata(jsonFilename));
    }
  }

  return { action: plan.action, metadata: plan.metadata };
}
