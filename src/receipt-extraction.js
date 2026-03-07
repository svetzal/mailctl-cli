/**
 * Pure functions for extracting structured metadata from receipt/invoice emails.
 * No I/O, no side effects — all inputs are plain values, outputs are plain objects.
 */
import { getVendorFilenameNames, getVendorDomainMap } from "./vendor-map.js";
import { getConfigSelfAddresses, getConfigInvoiceBlocklist, getConfigCanadianDomains } from "./config.js";

/** Local parts that indicate a generic/no-reply sender. */
export const GENERIC_SENDER_PREFIXES = new Set([
  "noreply", "no-reply", "no_reply", "donotreply", "do-not-reply",
  "orderstatus", "service", "billing", "notice", "notification",
  "deliverystatus", "info", "support", "orders", "receipts",
  "invoice", "sales", "accounting", "customerservice", "forms",
  "hello", "confirm", "confirmation", "alerts", "mailer",
]);

/** Domain prefixes to strip when deriving vendor name from domain. */
export const DOMAIN_STRIP_PREFIXES = [
  "sys.", "e.", "email.", "mail.", "info.", "order.", "orders.",
  "ora.", "marketing.", "notification.", "system.", "logistics.",
  "noreply.", "tm.", "am.",
];

/**
 * Minimum digit count for a valid invoice number.
 * Rejects pure-word matches and very short codes.
 */
export const MIN_INVOICE_DIGITS = 3;

/** Forwarded message markers. */
export const FORWARDED_MARKERS = [
  "---------- Forwarded message ----------",
  "Begin forwarded message:",
  "-------- Original Message --------",
  "-----Original Message-----",
];

/**
 * Titlecase a domain-derived name.
 * "best-buy" -> "Best-Buy", "vevor" -> "Vevor"
 * @param {string} s
 * @returns {string}
 */
export function titleCase(s) {
  return s.replace(/(?:^|[-. ])(\w)/g, (_, c) => _.replace(c, c.toUpperCase()));
}

/**
 * Sanitize a string for use as a filename component.
 * @param {string} str
 * @returns {string}
 */
export function sanitizeFilename(str) {
  return str
    .replace(/[\/\\:*?"<>|,]/g, "")
    .replace(/\.+$/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Derive a vendor name from the email domain when the local part is generic.
 * Strips common subdomains and titlecases the result.
 * @param {string} domain - full domain from email address
 * @param {Record<string, string>} [vendorDomainMap] - optional override for testing
 * @returns {string}
 */
export function vendorFromDomain(domain, vendorDomainMap) {
  const domainMap = vendorDomainMap || getVendorDomainMap();
  let d = domain.toLowerCase();
  // Check known domain map first (including subdomains)
  if (domainMap[d]) return domainMap[d];

  // Strip common prefixes
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
 * Try to extract a vendor name from subject or body for self-sent emails.
 * @param {string} subject
 * @param {string} bodyText
 * @returns {string|null}
 */
export function extractVendorFromContent(subject, bodyText) {
  const patterns = [
    /(?:from|by)\s+([A-Z][A-Za-z0-9 &.-]{2,30})(?:\s*[-–|]|\n)/i,
    /^(?:Fwd?:\s*)?(?:Receipt|Invoice|Order)\s+(?:from|for)\s+([A-Za-z][A-Za-z0-9 &.-]{2,30})/i,
    /(?:Your\s+)?([A-Z][A-Za-z0-9 &.-]{2,30})\s+(?:receipt|invoice|order)/i,
  ];

  for (const pat of patterns) {
    const match = subject.match(pat);
    if (match) {
      const name = match[1].trim();
      if (name.length >= 3 && name.length <= 30) return sanitizeFilename(name);
    }
  }
  return null;
}

/**
 * Detect if an email body is a forwarded message and extract the original sender.
 * Returns { address, name } of the original sender, or null if not forwarded.
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

  const afterMarker = bodyText.slice(fwdStart, fwdStart + 1000);
  const fromMatch = afterMarker.match(/From:\s*(?:([^<\n]+?)\s*)?<([^>\n]+)>/i)
    || afterMarker.match(/From:\s*(\S+@\S+)/i);

  if (!fromMatch) return null;

  if (fromMatch[2]) {
    return { address: fromMatch[2].trim().toLowerCase(), name: (fromMatch[1] || "").trim() };
  }
  return { address: fromMatch[1].trim().toLowerCase(), name: "" };
}

/**
 * Clean a vendor name for use in filenames.
 * Priority: exact address match -> forwarded sender -> domain map -> fromName -> domain derivation.
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

  // Exact match on sender address
  if (vendorDomains[addrLower]) return vendorDomains[addrLower];

  // Check for forwarded emails — use original sender as vendor
  if (bodyText) {
    const fwdSender = extractForwardedSender(bodyText);
    if (fwdSender) {
      if (vendorDomains[fwdSender.address]) return vendorDomains[fwdSender.address];
      const fwdDomain = fwdSender.address.split("@")[1];
      if (fwdDomain && vendorDomainMap[fwdDomain]) return vendorDomainMap[fwdDomain];
      if (fwdSender.name) {
        const cleaned = sanitizeFilename(fwdSender.name.replace(/,?\s*(Inc\.?|LLC|Ltd\.?|Corp\.?|PBC|Limited|Co\.?)\s*/gi, "").trim());
        if (cleaned.length >= 2) return cleaned.slice(0, 30).replace(/[-._]+$/, "");
      }
      if (fwdDomain) return vendorFromDomain(fwdDomain, vendorDomainMap);
    }
  }

  // Self-sent emails — try to extract vendor from subject/body
  if (selfAddresses.has(addrLower)) {
    const contentVendor = extractVendorFromContent(subject || "", bodyText || "");
    if (contentVendor) return contentVendor;
  }

  const domain = addrLower.split("@")[1] || "";
  const localPart = addrLower.split("@")[0] || "";

  // Check domain map
  if (vendorDomainMap[domain]) return vendorDomainMap[domain];

  const localNormalized = localPart.replace(/[._]/g, "").toLowerCase();
  const localBase = localPart.split(/[._+]/)[0].toLowerCase();
  const isGenericSender = !name
    || GENERIC_SENDER_PREFIXES.has(localPart.toLowerCase())
    || GENERIC_SENDER_PREFIXES.has(localNormalized)
    || GENERIC_SENDER_PREFIXES.has(localBase);
  if (isGenericSender && domain) {
    return vendorFromDomain(domain, vendorDomainMap);
  }

  // Use fromName, cleaning corporate suffixes
  let clean = name || localPart;
  clean = clean
    .replace(/,?\s*(Inc\.?|LLC|Ltd\.?|Corp\.?|PBC|Limited|Co\.?)\s*/gi, "")
    .replace(/\s*(via Stripe|via Clover|via FastSpring Checkout)\s*/gi, "")
    .trim();

  let result = sanitizeFilename(clean) || sanitizeFilename(localPart);

  if (result.length > 30) {
    result = result.slice(0, 30).replace(/-[^-]*$/, "");
  }

  result = result.replace(/[-._]+$/, "");

  return result || vendorFromDomain(domain, vendorDomainMap);
}

/**
 * Format a Date as YYYY-MM-DD string.
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
 * Infer currency from surrounding text context.
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
 * Check if the sender is a known Canadian merchant.
 * @param {string} fromAddress
 * @param {string} bodyText
 * @param {object} [overrides] - optional overrides for testing
 * @param {string[]} [overrides.canadianDomains]
 * @returns {boolean}
 */
export function isCanadianMerchant(fromAddress, bodyText, overrides = {}) {
  const canadianDomains = new Set(overrides.canadianDomains || getConfigCanadianDomains());
  const domain = (fromAddress || "").split("@")[1]?.toLowerCase() || "";

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

  // Reject tax registration numbers (e.g. 135664738RT0001)
  if (/\d{9}RT\d{4}/i.test(s)) return false;

  if (/RT\d+$/i.test(s)) return false;

  return true;
}

/**
 * Extract invoice/receipt number from subject and body text.
 * Only matches patterns that contain actual digits.
 * @param {string} subject
 * @param {string} bodyText
 * @param {object} [overrides] - optional overrides for testing
 * @param {string[]} [overrides.invoiceBlocklist]
 * @returns {string|null}
 */
export function extractInvoiceNumber(subject, bodyText, overrides = {}) {
  const combined = `${subject}\n${bodyText}`;
  const patterns = [
    /#\s*([A-Z0-9][-A-Z0-9]{3,})\b/,
    /Invoice\s*#?\s*:?\s*([A-Z0-9][-A-Z0-9]{3,})/i,
    /INV[-_]?([A-Z0-9]{4,})/i,
    /Receipt\s*#?\s*:?\s*([A-Z0-9][-A-Z0-9]{3,})/i,
    /Order\s*(?:ID|#)\s*:?\s*([A-Z0-9][-A-Z0-9]{3,})/i,
    /Transaction\s*(?:ID|#)\s*:?\s*([A-Z0-9][-A-Z0-9]{3,})/i,
    /Reference\s*#?\s*:?\s*([A-Z0-9][-A-Z0-9]{3,})/i,
  ];

  for (const pat of patterns) {
    const match = combined.match(pat);
    if (match && isValidInvoiceNumber(match[1], overrides)) return match[1];
  }
  return null;
}

/**
 * Extract currency amount from text. Prefers amounts near "total" or similar keywords.
 * @param {string} text
 * @returns {{ amount: number, currency: string }|null}
 */
export function extractAmount(text) {
  const totalMatch = text.match(
    /(?:total|amount\s*(?:due|charged|paid)?|charged?|payment)\s*:?\s*(?:(CAD|USD|EUR|GBP|AUD)\s*)?\$?\s*([\d,]+\.\d{2})\s*(?:(CAD|USD|EUR|GBP|AUD))?/i
  );
  if (totalMatch) {
    const amount = parseFloat(totalMatch[2].replace(/,/g, ""));
    const currency = (totalMatch[1] || totalMatch[3] || "").toUpperCase() || inferCurrency(text);
    if (!isNaN(amount) && amount > 0) {
      return { amount, currency };
    }
  }

  // Fallback: largest dollar amount in the text
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
 * Extract tax information from text.
 * @param {string} text
 * @returns {{ amount: number, type: string }|null}
 */
export function extractTax(text) {
  const patterns = [
    /\b(HST|GST|PST|QST|VAT)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
    /Tax\s*\(?\s*(HST|GST|PST|QST|VAT)\s*\)?\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
    /\$\s*([\d,]+\.\d{2})\s*(HST|GST|PST|QST|VAT)/i,
  ];

  for (const pat of patterns) {
    const match = text.match(pat);
    if (match) {
      let type, amtStr;
      if (/^\d/.test(match[1])) {
        amtStr = match[1];
        type = match[2];
      } else {
        type = match[1];
        amtStr = match[2];
      }
      const amount = parseFloat(amtStr.replace(/,/g, ""));
      if (!isNaN(amount) && amount > 0) {
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
  const patterns = [
    /(?:Plan|Product|Subscription)\s*:\s*([A-Za-z][A-Za-z0-9 .&+-]{1,60})(?:\n|$)/i,
    /^[ \t]*([A-Za-z][A-Za-z0-9 .&+-]{2,40})\s+\$[\d,]+\.\d{2}/m,
  ];

  const GARBAGE_PATTERNS = [
    /\d{5,}/,
    /http|www\./i,
    /admin center/i,
    /canceled|renew/i,
    /Show to Staff/i,
    /settings|click|view/i,
    /is due on/i,
    /-key=/,
    /Agreement Number/i,
  ];

  for (const pat of patterns) {
    const match = text.match(pat);
    if (match) {
      const service = match[1].trim();
      if (service.length < 3 || service.length > 60) continue;
      if (GARBAGE_PATTERNS.some((gp) => gp.test(service))) continue;
      return service;
    }
  }
  return null;
}

/**
 * Extract structured receipt metadata from email content.
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
