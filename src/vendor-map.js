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
  return Object.fromEntries(
    Object.entries(map).map(([addr, name]) => [addr, name.replace(/ /g, "-")])
  );
}

/**
 * Get email domain -> vendor name map for fallback lookups.
 * @returns {Record<string, string>}
 */
export function getVendorDomainMap() {
  return getConfigVendorDomainMap();
}
