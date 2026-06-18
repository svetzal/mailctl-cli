/**
 * Pure functions for extracting structured metadata from receipt/invoice emails.
 * No I/O, no side effects — all inputs are plain values, outputs are plain objects.
 */

import { getConfigCanadianDomains, getConfigInvoiceBlocklist, getConfigSelfAddresses } from "../config.js";
import { getDomain, getLocalPart } from "../email-address.js";
import { CORPORATE_SUFFIX_PATTERN, stripVendorSuffixes } from "./receipt-terms.js";
import { getVendorDomainMap, getVendorFilenameNames } from "../vendor-map.js";

/** Local parts that indicate a generic/no-reply sender. */
export const GENERIC_SENDER_PREFIXES = new Set([
  "noreply",
  "no-reply",
  "no_reply",
  "donotreply",
  "do-not-reply",
  "orderstatus",
  "service",
  "billing",
  "notice",
  "notification",
  "deliverystatus",
  "info",
  "support",
  "orders",
  "receipts",
  "invoice",
  "sales",
  "accounting",
  "customerservice",
  "forms",
  "hello",
  "confirm",
  "confirmation",
  "alerts",
  "mailer",
]);

/** Domain prefixes to strip when deriving vendor name from domain. */
export const DOMAIN_STRIP_PREFIXES = [
  "sys.",
  "e.",
  "email.",
  "mail.",
  "info.",
  "order.",
  "orders.",
  "ora.",
  "marketing.",
  "notification.",
  "system.",
  "logistics.",
  "noreply.",
  "tm.",
  "am.",
];

/**
 * Minimum digit count for a valid invoice number.
 * Rejects pure-word matches and very short codes.
 */
export const MIN_INVOICE_DIGITS = 3;

/** Maximum characters for a derived vendor or filename name. */
export const MAX_VENDOR_NAME_LENGTH = 30;

/** Minimum characters for a derived vendor or filename name. */
export const MIN_VENDOR_NAME_LENGTH = 3;

/** Maximum characters for an extracted service or product name. */
export const MAX_SERVICE_LENGTH = 60;

/** Minimum characters for an extracted service or product name. */
export const MIN_SERVICE_LENGTH = 3;

/** Minimum total character count for a valid invoice code. */
export const MIN_INVOICE_CODE_LENGTH = 4;

/** Byte window after a forwarded-message marker to scan for the original sender. */
export const FORWARDED_SCAN_WINDOW = 1000;

/** Forwarded message markers. */
export const FORWARDED_MARKERS = [
  "---------- Forwarded message ----------",
  "Begin forwarded message:",
  "-------- Original Message --------",
  "-----Original Message-----",
];

/**
 * @param {string} s
 * @returns {string}
 */
export function titleCase(s) {
  return s.replace(/(?:^|[-. ])(\w)/g, (_, c) => _.replace(c, c.toUpperCase()));
}

/**
 * @param {string} str
 * @returns {string}
 */
export function sanitizeFilename(str) {
  return str
    .replace(/[/\\:*?"<>|,]/g, "")
    .replace(/\.+$/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Used when the local part is a generic sender prefix; strips common subdomains and titlecases.
 * Strips only the first matching subdomain prefix so "email.order.acme.com" → "order.acme.com"
 * rather than attempting to strip both layers at once.
 * @param {string} domain - full domain from email address
 * @param {Record<string, string>} [vendorDomainMap] - optional override for testing
 * @returns {string}
 */
export function vendorFromDomain(domain, vendorDomainMap) {
  const domainMap = vendorDomainMap || getVendorDomainMap();
  let d = domain.toLowerCase();
  // Check known domain map first (including subdomains)
  if (domainMap[d]) return domainMap[d];

  // Strip common prefixes (first match only — see JSDoc above)
  for (const prefix of DOMAIN_STRIP_PREFIXES) {
    if (d.startsWith(prefix)) {
      d = d.slice(prefix.length);
      break;
    }
  }

  // Check domain map again after stripping
  if (domainMap[d]) return domainMap[d];

  // Drop TLD and titlecase the main domain name
  const parts = d.split(".");
  if (parts.length >= 2) {
    const name = parts.slice(0, -1).join("-");
    return sanitizeFilename(titleCase(name));
  }
  return sanitizeFilename(titleCase(d));
}

/**
 * Attempts to extract the vendor name from the email subject line.
 * Matches patterns like:
 *   - "Receipt from Acme Co" / "Invoice by Widget Inc" — "from/by" followed by vendor
 *   - "Receipt for Acme" / "Order from Widget" — labeled receipt with vendor
 *   - "Your Acme receipt" / "Acme invoice" — vendor precedes receipt keyword
 * @param {string} subject
 * @param {string} _bodyText
 * @returns {string|null}
 */
export function extractVendorFromContent(subject, _bodyText) {
  const tail = `{${MIN_VENDOR_NAME_LENGTH - 1},}`;
  const patterns = [
    // "Receipt from Acme Co –" or "Invoice by Widget Inc\n"
    new RegExp(`(?:from|by)\\s+([A-Z][A-Za-z0-9 &.-]${tail})(?:\\s*[-–|]|\\n)`, "i"),
    // "Receipt for Acme Co" or "Fwd: Invoice from Widget"
    new RegExp(`^(?:Fwd?:\\s*)?(?:Receipt|Invoice|Order)\\s+(?:from|for)\\s+([A-Za-z][A-Za-z0-9 &.-]${tail})`, "i"),
    // "Your Acme Co receipt" or "Acme invoice"
    new RegExp(`(?:Your\\s+)?([A-Z][A-Za-z0-9 &.-]${tail})\\s+(?:receipt|invoice|order)`, "i"),
  ];

  for (const pat of patterns) {
    const match = subject.match(pat);
    if (match) {
      const name = match[1].trim();
      if (name.length >= MIN_VENDOR_NAME_LENGTH && name.length <= MAX_VENDOR_NAME_LENGTH) return sanitizeFilename(name);
    }
  }
  return null;
}

/**
 * @param {string} bodyText
 * @returns {{ address: string, name: string }|null}
 */
export function extractForwardedSender(bodyText) {
  let fwdStart = -1;
  for (const marker of FORWARDED_MARKERS) {
    const idx = bodyText.indexOf(marker);
    if (idx !== -1) {
      fwdStart = idx;
      break;
    }
  }
  if (fwdStart === -1) return null;

  const afterMarker = bodyText.slice(fwdStart, fwdStart + FORWARDED_SCAN_WINDOW);
  const fromMatch =
    afterMarker.match(/From:\s*(?:([^<\n]+?)\s*)?<([^>\n]+)>/i) || afterMarker.match(/From:\s*(\S+@\S+)/i);

  if (!fromMatch) return null;

  if (fromMatch[2]) {
    return { address: fromMatch[2].trim().toLowerCase(), name: (fromMatch[1] || "").trim() };
  }
  return { address: fromMatch[1].trim().toLowerCase(), name: "" };
}

// ─── cleanVendorForFilename helpers ─────────────────────────────────────────
//
// Priority cascade (first non-null wins):
//   1. Exact sender address in the vendor filename map
//   2. Forwarded email — use the original sender's address/domain/name
//   3. Self-sent email — parse vendor from subject/body content
//   4. Sender domain in the vendor domain map
//   5. Display name (after stripping corporate suffixes) or domain derivation

/**
 * @param {string} addrLower
 * @param {Record<string, string>} vendorDomains
 * @returns {string|null}
 */
function vendorFromExactAddress(addrLower, vendorDomains) {
  return vendorDomains[addrLower] ?? null;
}

/**
 * @param {string} bodyText
 * @param {Record<string, string>} vendorDomains
 * @param {Record<string, string>} vendorDomainMap
 * @returns {string|null}
 */
function vendorFromForwarded(bodyText, vendorDomains, vendorDomainMap) {
  const fwdSender = extractForwardedSender(bodyText);
  if (!fwdSender) return null;

  if (vendorDomains[fwdSender.address]) return vendorDomains[fwdSender.address];
  const fwdDomain = getDomain(fwdSender.address);
  if (fwdDomain && vendorDomainMap[fwdDomain]) return vendorDomainMap[fwdDomain];
  if (fwdSender.name) {
    const cleaned = sanitizeFilename(fwdSender.name.replace(CORPORATE_SUFFIX_PATTERN, "").trim());
    if (cleaned.length >= 2) return cleaned.slice(0, MAX_VENDOR_NAME_LENGTH).replace(/[-._]+$/, "");
  }
  if (fwdDomain) return vendorFromDomain(fwdDomain, vendorDomainMap);
  return null;
}

/**
 * @param {string} addrLower
 * @param {Set<string>} selfAddresses
 * @param {string|undefined} subject
 * @param {string|undefined} bodyText
 * @returns {string|null}
 */
function vendorFromSelfSent(addrLower, selfAddresses, subject, bodyText) {
  if (!selfAddresses.has(addrLower)) return null;
  return extractVendorFromContent(subject || "", bodyText || "");
}

/**
 * @param {string} domain
 * @param {string} localPart
 * @param {string} name
 * @param {Record<string, string>} vendorDomainMap
 * @returns {string}
 */
function vendorFromDomainMapOrName(domain, localPart, name, vendorDomainMap) {
  if (vendorDomainMap[domain]) return vendorDomainMap[domain];

  const localNormalized = localPart.replace(/[._]/g, "").toLowerCase();
  const localBase = localPart.split(/[._+]/)[0].toLowerCase();
  const isGenericSender =
    !name ||
    GENERIC_SENDER_PREFIXES.has(localPart.toLowerCase()) ||
    GENERIC_SENDER_PREFIXES.has(localNormalized) ||
    GENERIC_SENDER_PREFIXES.has(localBase);
  if (isGenericSender && domain) {
    return vendorFromDomain(domain, vendorDomainMap);
  }

  // Use display name, cleaning corporate suffixes
  let clean = name || localPart;
  clean = stripVendorSuffixes(clean);

  let result = sanitizeFilename(clean) || sanitizeFilename(localPart);
  if (result.length > MAX_VENDOR_NAME_LENGTH) {
    result = result.slice(0, MAX_VENDOR_NAME_LENGTH).replace(/-[^-]*$/, "");
  }
  result = result.replace(/[-._]+$/, "");

  return result || vendorFromDomain(domain, vendorDomainMap);
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * Clean a vendor name for use in filenames.
 * Priority: exact address match -> forwarded sender -> self-sent content -> domain map -> fromName -> domain derivation.
 * @param {string} address - sender email address
 * @param {string} name - sender display name
 * @param {string} [bodyText] - email body for forwarded detection
 * @param {string} [subject] - email subject for self-sent detection
 * @param {object} [overrides] - optional overrides for testing
 * @param {string[]} [overrides.selfAddresses]
 * @param {Record<string, string>} [overrides.vendorFilenameNames]
 * @param {Record<string, string>} [overrides.vendorDomainMap]
 * @returns {string}
 */
export function cleanVendorForFilename(address, name, bodyText, subject, overrides = {}) {
  const vendorDomains = overrides.vendorFilenameNames || getVendorFilenameNames();
  const vendorDomainMap = overrides.vendorDomainMap || getVendorDomainMap();
  const selfAddresses = new Set(overrides.selfAddresses || getConfigSelfAddresses());
  const addrLower = (address || "").toLowerCase();

  return (
    vendorFromExactAddress(addrLower, vendorDomains) ??
    (bodyText ? vendorFromForwarded(bodyText, vendorDomains, vendorDomainMap) : null) ??
    vendorFromSelfSent(addrLower, selfAddresses, subject, bodyText) ??
    vendorFromDomainMapOrName(getDomain(addrLower), getLocalPart(addrLower), name, vendorDomainMap)
  );
}

/**
 * @param {Date|string} d
 * @returns {string}
 */
export function formatDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * @param {string} text
 * @returns {string}
 */
export function inferCurrency(text) {
  if (/\bCAD\b/i.test(text)) return "CAD";
  if (/\b(?:HST|GST|PST|QST)\b/i.test(text)) return "CAD";
  if (/\bEUR\b/i.test(text)) return "EUR";
  if (/\bGBP\b/i.test(text)) return "GBP";
  if (/\bAUD\b/i.test(text)) return "AUD";
  return "USD";
}

/**
 * @param {string} fromAddress
 * @param {string} bodyText
 * @param {object} [overrides] - optional overrides for testing
 * @param {string[]} [overrides.canadianDomains]
 * @returns {boolean}
 */
export function isCanadianMerchant(fromAddress, bodyText, overrides = {}) {
  const canadianDomains = new Set(overrides.canadianDomains || getConfigCanadianDomains());
  const domain = getDomain(fromAddress || "").toLowerCase();

  if (canadianDomains.has(domain)) return true;

  // Check parent domain (e.g. email.apple.com -> apple.com)
  const parts = domain.split(".");
  if (parts.length > 2) {
    const parentDomain = parts.slice(-2).join(".");
    if (canadianDomains.has(parentDomain)) return true;
  }

  if (domain.endsWith(".ca")) return true;

  if (/\b(?:HST|GST|PST|QST)\b/i.test(bodyText)) return true;

  return false;
}

/**
 * Validate a candidate invoice number.
 * Rejects pure-word matches, known blocklisted values, tax registration numbers, and
 * strings without enough digits.
 * @param {string} s
 * @param {object} [overrides] - optional overrides for testing
 * @param {string[]} [overrides.invoiceBlocklist]
 * @returns {boolean}
 */
export function isValidInvoiceNumber(s, overrides = {}) {
  const digitCount = (s.match(/\d/g) || []).length;
  if (digitCount < MIN_INVOICE_DIGITS) return false;

  if (/^[A-Za-z]+$/.test(s)) return false;

  const blocklist = new Set(overrides.invoiceBlocklist || getConfigInvoiceBlocklist());
  if (blocklist.has(s)) return false;

  // CRA business number format, e.g. 135664738RT0001 — not an invoice number
  if (/\d{9}RT\d{4}/i.test(s)) return false;

  // Trailing tax-account registration suffix, e.g. "RT0001" — not an invoice number
  if (/RT\d+$/i.test(s)) return false;

  return true;
}

/**
 * Extract invoice/receipt number from subject and body text.
 * Only matches patterns that contain actual digits.
 * `isValidInvoiceNumber` gates each candidate to reject pure words, tax registration
 * numbers (e.g. 135664738RT0001), and codes with too few digits.
 * @param {string} subject
 * @param {string} bodyText
 * @param {object} [overrides] - optional overrides for testing
 * @param {string[]} [overrides.invoiceBlocklist]
 * @returns {string|null}
 */
export function extractInvoiceNumber(subject, bodyText, overrides = {}) {
  const combined = `${subject}\n${bodyText}`;
  const codeTail = `{${MIN_INVOICE_CODE_LENGTH - 1},}`;
  const patterns = [
    // "#INV-1234" or "#AB-9981" — leading sigil, ≥4-char alphanumeric code
    new RegExp(`#\\s*([A-Z0-9][-A-Z0-9]${codeTail})\\b`),
    // "Invoice #: INV-1234" or "Invoice 2024-0042"
    new RegExp(`Invoice\\s*#?\\s*:?\\s*([A-Z0-9][-A-Z0-9]${codeTail})`, "i"),
    // "INV-1234" or "INV_9981" — bare INV prefix
    new RegExp(`INV[-_]?([A-Z0-9]{${MIN_INVOICE_CODE_LENGTH},})`, "i"),
    // "Receipt #: R-20240601" or "Receipt 4421"
    new RegExp(`Receipt\\s*#?\\s*:?\\s*([A-Z0-9][-A-Z0-9]${codeTail})`, "i"),
    // "Order ID: AB-9981" or "Order #20240601"
    new RegExp(`Order\\s*(?:ID|#)\\s*:?\\s*([A-Z0-9][-A-Z0-9]${codeTail})`, "i"),
    // "Transaction ID: TXN-4421" or "Transaction #: 20240601"
    new RegExp(`Transaction\\s*(?:ID|#)\\s*:?\\s*([A-Z0-9][-A-Z0-9]${codeTail})`, "i"),
    // "Reference #: REF-1234" or "Reference: 20240601-AB"
    new RegExp(`Reference\\s*#?\\s*:?\\s*([A-Z0-9][-A-Z0-9]${codeTail})`, "i"),
  ];

  for (const pat of patterns) {
    const match = combined.match(pat);
    if (match && isValidInvoiceNumber(match[1], overrides)) return match[1];
  }
  return null;
}

/**
 * Extract currency amount from text. Prefers amounts near "total" or similar keywords.
 * Fallback takes the largest dollar amount in the text — grand totals are typically the
 * largest figure, above per-line-item prices.
 * @param {string} text
 * @returns {{ amount: number, currency: string }|null}
 */
export function extractAmount(text) {
  // "Total: CAD $1,234.56" or "Amount Due $99.00" or "charged 9.99 USD" — keyword-anchored, 2 decimal places
  const totalMatch = text.match(
    /(?:total|amount\s*(?:due|charged|paid)?|charged?|payment)\s*:?\s*(?:(CAD|USD|EUR|GBP|AUD)\s*)?\$?\s*([\d,]+\.\d{2})\s*(?:(CAD|USD|EUR|GBP|AUD))?/i,
  );
  if (totalMatch) {
    const amount = parseFloat(totalMatch[2].replace(/,/g, ""));
    const currency = (totalMatch[1] || totalMatch[3] || "").toUpperCase() || inferCurrency(text);
    if (!Number.isNaN(amount) && amount > 0) {
      return { amount, currency };
    }
  }

  // Fallback: largest dollar amount — grand totals are typically larger than line items
  const allAmounts = [...text.matchAll(/\$\s*([\d,]+\.\d{2})/g)];
  if (allAmounts.length > 0) {
    let max = 0;
    for (const m of allAmounts) {
      const a = parseFloat(m[1].replace(/,/g, ""));
      if (a > max) max = a;
    }
    if (max > 0) return { amount: max, currency: inferCurrency(text) };
  }

  return null;
}

/**
 * @param {string} text
 * @returns {{ amount: number, type: string }|null}
 */
export function extractTax(text) {
  const patterns = [
    // "HST: $13.00" or "GST $5.00" — tax type precedes amount
    /\b(HST|GST|PST|QST|VAT)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
    // "Tax (HST): $13.00" or "Tax GST $5.00" — labeled with parenthetical tax type
    /Tax\s*\(?\s*(HST|GST|PST|QST|VAT)\s*\)?\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
    // "$13.00 HST" — amount precedes label; capture groups are in reverse order
    /\$\s*([\d,]+\.\d{2})\s*(HST|GST|PST|QST|VAT)/i,
  ];

  for (const pat of patterns) {
    const match = text.match(pat);
    if (match) {
      let type, amtStr;
      // Third pattern flips group order: match[1] is the amount, match[2] is the type
      if (/^\d/.test(match[1])) {
        amtStr = match[1];
        type = match[2];
      } else {
        type = match[1];
        amtStr = match[2];
      }
      const amount = parseFloat(amtStr.replace(/,/g, ""));
      if (!Number.isNaN(amount) && amount > 0) {
        return { amount, type: type.toUpperCase() };
      }
    }
  }
  return null;
}

/**
 * Extract service/product name from email body.
 * Conservative: only returns a value when there's a clear labeled pattern.
 * Returns null rather than garbage — null is better than wrong data.
 * @param {string} text
 * @returns {string|null}
 */
export function extractService(text) {
  const serviceTail = `{${MIN_SERVICE_LENGTH - 1},}`;
  const patterns = [
    // "Plan: Pro Annual" or "Product: Widget" or "Subscription: Basic Monthly"
    new RegExp(`(?:Plan|Product|Subscription)\\s*:\\s*([A-Za-z][A-Za-z0-9 .&+-]${serviceTail})(?:\\n|$)`, "i"),
    // Line item with price: "Widget  $9.99" — indented name followed by a dollar amount
    new RegExp(`^[ \\t]*([A-Za-z][A-Za-z0-9 .&+-]${serviceTail})\\s+\\$[\\d,]+\\.\\d{2}`, "m"),
  ];

  const GARBAGE_PATTERNS = [
    /\d{5,}/, // long numeric IDs (order numbers, tracking codes) — not a product name
    /http|www\./i, // URLs in the matched text
    /admin center/i, // Microsoft billing admin noise
    /canceled|renew/i, // dunning/renewal notices, not a product name
    /Show to Staff/i, // Shopify internal label
    /settings|click|view/i, // UI action words — not a product
    /is due on/i, // dunning notice fragment, not a product name
    /-key=/, // tracking-link query parameter fragment
    /Agreement Number/i, // contract reference, not a service name
  ];

  for (const pat of patterns) {
    const match = text.match(pat);
    if (match) {
      const service = match[1].trim();
      if (service.length < MIN_SERVICE_LENGTH || service.length > MAX_SERVICE_LENGTH) continue;
      if (GARBAGE_PATTERNS.some((gp) => gp.test(service))) continue;
      return service;
    }
  }
  return null;
}

/**
 * @param {string} bodyText
 * @param {string} subject
 * @param {string} fromAddress
 * @param {string} fromName
 * @param {Date} emailDate
 * @returns {object}
 */
export function extractMetadata(bodyText, subject, fromAddress, fromName, emailDate) {
  const invoiceNumber = extractInvoiceNumber(subject, bodyText);
  const amountInfo = extractAmount(bodyText);
  const tax = extractTax(bodyText);
  const service = extractService(bodyText);
  const dateStr = formatDate(emailDate);

  const vendor = cleanVendorForFilename(fromAddress, fromName, bodyText, subject);

  let currency = amountInfo?.currency ?? null;
  if (tax && /^(HST|GST|PST|QST)$/.test(tax.type)) {
    currency = "CAD";
  } else if (currency && isCanadianMerchant(fromAddress, bodyText)) {
    currency = "CAD";
  }

  // Validate tax: must be less than total amount
  let validatedTax = tax;
  if (tax && amountInfo) {
    const subtotal = amountInfo.amount - tax.amount;
    if (tax.amount >= subtotal) {
      validatedTax = null;
    }
  }

  return {
    schema: "mailctl.receipt.v1",
    vendor,
    service: service || null,
    amount: amountInfo?.amount ?? null,
    currency,
    tax: validatedTax || null,
    date: dateStr,
    invoice_number: invoiceNumber || null,
    source_email: fromAddress,
    source_account: null,
    email_uid: null,
    receipt_file: null,
  };
}
