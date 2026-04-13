/**
 * Single source of truth for vendor name mappings.
 *
 * All maps are loaded from ~/.config/mailctl/config.json via src/config.js.
 * Functions return plain objects for bracket-access lookups.
 */
import { getConfigVendorAddressMap, getConfigVendorDomainMap } from "./config.js";

/**
 * Get sender-address -> display-name map.
 * Values use spaces (e.g. "Springer Nature").
 * @returns {Record<string, string>}
 */
export function getVendorDisplayNames() {
  return getConfigVendorAddressMap();
}

/**
 * Get sender-address -> filesystem-safe name map (spaces replaced with hyphens).
 * @returns {Record<string, string>}
 */
export function getVendorFilenameNames() {
  const map = getConfigVendorAddressMap();
  return Object.fromEntries(Object.entries(map).map(([addr, name]) => [addr, name.replace(/ /g, "-")]));
}

/**
 * Get email domain -> vendor name map for fallback lookups.
 * @returns {Record<string, string>}
 */
export function getVendorDomainMap() {
  return getConfigVendorDomainMap();
}

/**
 * Check if a message matches a vendor filter.
 * Matches against: vendor display name, sender address, sender domain,
 * and configured vendor names from vendorAddressMap/vendorDomainMap.
 * Case-insensitive, substring match.
 *
 * @param {string} filter - user's vendor filter string
 * @param {string | null} fromAddress - sender email address
 * @param {string | null} [fromName] - sender display name
 * @returns {boolean}
 */
export function matchesVendor(filter, fromAddress, fromName) {
  const f = filter.toLowerCase();

  // 1. Check sender display name
  if (fromName?.toLowerCase().includes(f)) return true;

  // 2. Check sender email address
  if (fromAddress?.toLowerCase().includes(f)) return true;

  // 3. Check configured vendor names (address map and domain map)
  const addressMap = getConfigVendorAddressMap();
  const domainMap = getConfigVendorDomainMap();

  const addr = (fromAddress || "").toLowerCase();

  // Check if sender address is in the address map and the vendor name matches
  if (addressMap[addr]?.toLowerCase().includes(f)) return true;

  // Check if sender domain is in the domain map and the vendor name matches
  const domain = addr.includes("@") ? addr.split("@").pop() : "";
  if (domain) {
    // Check exact domain match in domain map
    if (domainMap[domain]?.toLowerCase().includes(f)) return true;

    // Check parent domains (e.g. mail.anthropic.com -> anthropic.com)
    const parts = domain.split(".");
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join(".");
      if (domainMap[parent]?.toLowerCase().includes(f)) return true;
    }
  }

  // 4. Check domain portion of the sender address
  if (domain?.includes(f)) return true;

  return false;
}
