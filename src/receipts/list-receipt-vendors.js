import { resolveAccounts } from "../cli-helpers.js";
import { monthsAgo } from "../parse-date.js";
import { EXTRACT_DEFAULT_MONTHS } from "../receipt-defaults.js";
import { resolveGateways } from "./receipt-gateways.js";
import { forEachReceiptSearchAccount } from "./receipt-search-pipeline.js";

/**
 * Folds one message into the vendor counts map.
 * @param {Map<string, { vendor: string, address: string, count: number }>} vendorCounts
 * @param {{ fromAddress: string, fromName: string }} msg
 */
function tallyVendor(vendorCounts, msg) {
  const key = msg.fromAddress;
  const existing = vendorCounts.get(key);
  if (existing) {
    existing.count++;
  } else {
    vendorCounts.set(key, { vendor: msg.fromName || msg.fromAddress, address: msg.fromAddress, count: 1 });
  }
}

/**
 * Returns an array of { vendor, count } sorted by count descending.
 * @param {object} [opts]
 * @param {number}  [opts.months=12] - how far back to search
 * @param {Date}    [opts.since] - search from this date instead of months
 * @param {string}  [opts.account] - only search this account
 * @param {object} [gateways] - injectable implementations for testing
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<Array<{ vendor: string, address: string, count: number }>>}
 */
export async function listReceiptVendors(opts = {}, gateways = {}, onProgress = () => {}) {
  const { loadAccounts, forEachAccount, listMailboxes } = resolveGateways(gateways);

  const months = opts.months ?? EXTRACT_DEFAULT_MONTHS;
  const accountFilter = opts.account || null;
  const since = opts.since ? opts.since : monthsAgo(months);
  const targetAccounts = resolveAccounts(accountFilter, loadAccounts);

  /** @type {Map<string, { vendor: string, address: string, count: number }>} */
  const vendorCounts = new Map();

  await forEachReceiptSearchAccount(
    targetAccounts,
    since,
    { forEachAccount, listMailboxes, onProgress },
    async (_client, _account, unique) => {
      for (const msg of unique) {
        tallyVendor(vendorCounts, msg);
      }
    },
  );

  return [...vendorCounts.values()].sort((a, b) => b.count - a.count);
}
