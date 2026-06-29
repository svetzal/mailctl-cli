/**
 * Scalar field extractors — the single responsibility of pulling individual
 * data points (amount, tax, currency, invoice number, service, date) out of
 * receipt email text.
 * No I/O, no side effects — all inputs are plain values, outputs are plain objects or primitives.
 */

import { getConfigCanadianDomains, getConfigInvoiceBlocklist } from "../config.js";
import { getDomain } from "../email-address.js";

/**
 * Minimum digit count for a valid invoice number.
 * Rejects pure-word matches and very short codes.
 */
export const MIN_INVOICE_DIGITS = 3;

/** Minimum total character count for a valid invoice code. */
export const MIN_INVOICE_CODE_LENGTH = 4;

/** Maximum characters for an extracted service or product name. */
export const MAX_SERVICE_LENGTH = 60;

/** Minimum characters for an extracted service or product name. */
export const MIN_SERVICE_LENGTH = 3;

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
