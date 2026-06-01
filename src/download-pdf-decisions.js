import { createHash } from "node:crypto";

/**
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function isValidPdf(buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString() === "%PDF-";
}

/**
 * @param {Buffer} buffer
 * @returns {string} SHA-256 hex digest
 */
export function contentHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * @param {"no-pdf"|"duplicate"|"downloaded"} status
 * @param {{ filename?: string, hash?: string, date?: Date|string, vendor?: string }} [fields]
 * @returns {object}
 */
export function buildManifestRecord(status, { filename, hash, date, vendor } = {}) {
  if (status === "no-pdf") return { status, date };
  if (status === "duplicate") return { status, hash: (hash ?? "").slice(0, 12), date, vendor };
  if (status === "downloaded") return { status, filename, hash: (hash ?? "").slice(0, 12), date, vendor };
  return { status, date };
}
