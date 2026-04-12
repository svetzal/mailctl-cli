/**
 * Output directory tree utilities for receipt files.
 * Handles walking the <root>/<YYYY>/<MM>/<file> tree, scanning existing
 * invoices and hashes, unique base name generation, sidecar collection,
 * and writing receipt output files.
 */

import { createHash } from "node:crypto";
import { join } from "node:path";
import { cleanVendorForFilename } from "./receipt-extraction.js";

/**
 * Walk the year/month output directory tree, invoking visitor for each file.
 * Encapsulates the <root>/<YYYY>/<MM>/<file> directory convention.
 * @param {string} outputDir
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} fs
 * @param {(filePath: string, fileName: string) => void} visitor
 * @param {(err: Error, context: object) => void} [onError] - called when any directory read or visitor invocation fails
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
                onError(err, { path: join(monthPath, file), level: "file" });
              }
            }
          } catch (err) {
            onError(err, { path: monthPath, level: "month" });
          }
        }
      } catch (err) {
        onError(err, { path: yearPath, level: "year" });
      }
    }
  } catch (err) {
    onError(err, { path: outputDir, level: "root" });
  }
}

/**
 * Scan the output directory tree for existing receipt JSON files.
 * Returns a Set of invoice numbers that already have sidecars.
 * @param {string} outputDir
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} fs
 * @returns {Set<string>}
 */
export function loadExistingInvoiceNumbers(outputDir, fs) {
  const numbers = new Set();
  walkOutputTree(
    outputDir,
    fs,
    (filePath, fileName) => {
      if (!fileName.endsWith(".json")) return;
      const data = /** @type {any} */ (fs.readJson(filePath));
      if (data.invoice_number) numbers.add(data.invoice_number);
    },
    (err, ctx) => console.error(`mailctl: error reading output tree at ${ctx.path} (${ctx.level}): ${err.message}`),
  );
  return numbers;
}

/**
 * Scan existing PDF files in the output tree for SHA-256 content hashes.
 * @param {string} outputDir
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} fs
 * @returns {Set<string>}
 */
export function loadExistingHashes(outputDir, fs) {
  const hashes = new Set();
  walkOutputTree(
    outputDir,
    fs,
    (filePath, fileName) => {
      if (!fileName.toLowerCase().endsWith(".pdf")) return;
      const buf = fs.readBuffer(filePath);
      hashes.add(createHash("sha256").update(buf).digest("hex"));
    },
    (err, ctx) => console.error(`mailctl: error reading output tree at ${ctx.path} (${ctx.level}): ${err.message}`),
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
 * Scan the output directory tree for existing .json sidecar files.
 * Returns an array of { jsonPath, sidecar } for each valid sidecar found.
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
 * Write receipt output files (PDF + JSON sidecar) to the output directory.
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
  const d = emailDate instanceof Date ? emailDate : new Date(emailDate);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const monthDir = join(outputDir, yyyy, mm);

  const vendorClean = cleanVendorForFilename(msg.fromAddress, msg.fromName, bodyText, parsed.subject || msg.subject);
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

  if (rawBase.length > 60) {
    rawBase = rawBase.slice(0, 60).replace(/[-_][^-_]*$/, "");
    rawBase = rawBase.replace(/[-._]+$/, "");
  }

  const baseName = uniqueBaseName(monthDir, rawBase, usedPaths, fs);

  if (pdfAttachments.length > 0) {
    const att = pdfAttachments[0];
    const contentHash = createHash("sha256").update(att.content).digest("hex");

    if (existingHashes.has(contentHash)) {
      const dupLabel = metadata.invoice_number
        ? `${vendorClean} ${metadata.invoice_number}`
        : `${vendorClean} (${metadata.date})`;
      onProgress({ type: "skip-duplicate", label: dupLabel });
      return { action: "duplicate", metadata };
    }

    const pdfFilename = `${baseName}.pdf`;
    const jsonFilename = `${baseName}.json`;
    const pdfPath = join(monthDir, pdfFilename);
    const jsonPath = join(monthDir, jsonFilename);

    metadata.receipt_file = pdfFilename;

    if (dryRun) {
      onProgress({ type: "dry-run-pdf", filename: pdfFilename });
      onProgress({ type: "dry-run-json", filename: jsonFilename });
    } else {
      fs.mkdir(monthDir);
      fs.writeFile(pdfPath, att.content);
      fs.writeFile(jsonPath, JSON.stringify(metadata, null, 2));
      onProgress({ type: "downloaded-pdf", filename: pdfFilename, size: att.content.length });
    }

    return { action: "downloaded", metadata };
  } else {
    metadata.receipt_file = null;
    const jsonFilename = `${baseName}.json`;
    const jsonPath = join(monthDir, jsonFilename);

    if (dryRun) {
      onProgress({ type: "dry-run-metadata", filename: jsonFilename });
    } else {
      fs.mkdir(monthDir);
      fs.writeFile(jsonPath, JSON.stringify(metadata, null, 2));
      onProgress({ type: "wrote-metadata", filename: jsonFilename });
    }

    return { action: "noPdf", metadata };
  }
}
