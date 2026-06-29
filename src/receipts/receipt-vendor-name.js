/**
 * Vendor name derivation — the single responsibility of turning a sender
 * address + display name into a filename-safe vendor string.
 * Priority cascade (first non-null wins):
 *   1. Exact sender address in the vendor filename map
 *   2. Forwarded email — use the original sender's address/domain/name
 *   3. Self-sent email — parse vendor from subject/body content
 *   4. Sender domain in the vendor domain map
 *   5. Display name (after stripping corporate suffixes) or domain derivation
 */

import { getConfigSelfAddresses } from "../config.js";
import { getDomain, getLocalPart } from "../email-address.js";
import { getVendorDomainMap, getVendorFilenameNames } from "../vendor-map.js";
import { CORPORATE_SUFFIX_PATTERN, stripVendorSuffixes } from "./receipt-terms.js";

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

/** Maximum characters for a derived vendor or filename name. */
export const MAX_VENDOR_NAME_LENGTH = 30;

/** Minimum characters for a derived vendor or filename name. */
export const MIN_VENDOR_NAME_LENGTH = 3;

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
