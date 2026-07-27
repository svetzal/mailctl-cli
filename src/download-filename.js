import { getLocalPart } from "./email-address.js";
import { MAX_VENDOR_NAME_LENGTH } from "./receipts/receipt-extraction.js";
import { stripVendorSuffixes } from "./receipts/receipt-terms.js";
import { truncateAtTokenBoundary } from "./truncate-name.js";
import { getVendorDisplayNames } from "./vendor-map.js";

/**
 * Loaded from config via vendor-map.js.
 * @returns {Record<string, string>}
 */
export function getVendorNames() {
  return getVendorDisplayNames();
}

/**
 * @param {string} address - sender email address
 * @param {string} [senderName] - sender display name
 * @returns {string}
 */
export function vendorName(address, senderName) {
  const addrLower = (address || "").toLowerCase();
  const vendorNames = getVendorNames();
  if (vendorNames[addrLower]) return vendorNames[addrLower];

  let name = senderName || getLocalPart(address);
  name = stripVendorSuffixes(name)
    .replace(/[^\w\s.-]/g, "")
    .trim();

  name = truncateAtTokenBoundary(name, MAX_VENDOR_NAME_LENGTH).trim();

  return name || getLocalPart(address);
}

/**
 * Build a predictable filename: "Vendor YYYY-MM-DD[_N].pdf"
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

  let n = 1;
  while (existingFiles.has(filename.toLowerCase())) {
    n++;
    filename = `${base}_${n}.pdf`;
  }

  return filename;
}
