/**
 * Single source of truth for the lookback-month defaults used by every layer
 * (CLI option defaults, command orchestrators, and library functions) of each
 * receipt command. Change a default here — not at each call site.
 */

export const SCAN_DEFAULT_MONTHS = 12;
export const SORT_DEFAULT_MONTHS = 24;
export const DOWNLOAD_DEFAULT_MONTHS = 24;
export const EXTRACT_DEFAULT_MONTHS = 12;
