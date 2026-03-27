import { loadAccounts as _loadAccounts } from "./accounts.js";
import {
  filterScanMailboxes as _filterScanMailboxes,
  forEachAccount as _forEachAccount,
  listMailboxes as _listMailboxes,
  scanForReceipts as _scanForReceipts,
} from "./imap-client.js";

/**
 * Real implementations used in production. Tests override individual keys.
 * @type {Required<ScannerGateways>}
 */
const defaultGateways = {
  loadAccounts: _loadAccounts,
  forEachAccount: _forEachAccount,
  listMailboxes: _listMailboxes,
  filterScanMailboxes: _filterScanMailboxes,
  scanForReceipts: _scanForReceipts,
};

/**
 * @typedef {object} ScannerGateways
 * @property {typeof _loadAccounts}        [loadAccounts]
 * @property {typeof _forEachAccount}      [forEachAccount]
 * @property {typeof _listMailboxes}       [listMailboxes]
 * @property {typeof _filterScanMailboxes} [filterScanMailboxes]
 * @property {typeof _scanForReceipts}     [scanForReceipts]
 */

/**
 * Scan all configured accounts for receipt emails.
 * @param {object}          [opts]
 * @param {number}          [opts.months=12]      - how many months back to search
 * @param {string[]}        [opts.mailboxes]      - override which mailboxes to scan
 * @param {boolean}         [opts.allMailboxes=false] - scan all mailboxes (slow)
 * @param {string}          [opts.account]        - only scan this account (case-insensitive)
 * @param {object}          [gateways]            - injectable implementations for testing
 * @param {function(object): void} [onProgress]  - receives structured progress events
 * @returns {Promise<Array>} receipt messages
 */
export async function scanAllAccounts(opts = {}, gateways = {}, onProgress = () => {}) {
  const { loadAccounts, forEachAccount, listMailboxes, filterScanMailboxes, scanForReceipts } = {
    ...defaultGateways,
    ...gateways,
  };

  const months = opts.months ?? 12;
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const allAccounts = loadAccounts();
  if (allAccounts.length === 0) {
    throw new Error("No accounts configured. Check keychain credentials and bin/run wrapper.");
  }

  const accountFilter = opts.account || null;
  const accounts = accountFilter
    ? allAccounts.filter((a) => a.name.toLowerCase() === accountFilter.toLowerCase())
    : allAccounts;

  if (accounts.length === 0) {
    throw new Error(`Account "${accountFilter}" not found.`);
  }

  const allResults = [];

  await forEachAccount(accounts, async (client, account) => {
    onProgress({ type: "scan-account-start", name: account.name, user: account.user });

    let mailboxes;
    if (opts.mailboxes) {
      mailboxes = opts.mailboxes;
    } else {
      const list = await listMailboxes(client);
      if (opts.allMailboxes) {
        mailboxes = list.map((mb) => mb.path);
      } else {
        mailboxes = filterScanMailboxes(list);
      }
    }

    const results = await scanForReceipts(client, account.name, mailboxes, { since });
    onProgress({ type: "scan-account-complete", name: account.name, count: results.length });
    allResults.push(...results);
  });

  return allResults;
}

/**
 * Deduplicate and aggregate results by sender address.
 * Returns sorted array of { address, name, count, accounts, sampleSubjects, latestDate }.
 */
export function aggregateBySender(results) {
  const map = new Map();

  for (const r of results) {
    const key = r.address;
    if (!map.has(key)) {
      map.set(key, {
        address: r.address,
        name: r.name,
        count: 0,
        accounts: new Set(),
        sampleSubjects: new Set(),
        latestDate: r.date,
      });
    }
    const entry = map.get(key);
    entry.count++;
    entry.accounts.add(r.account);
    if (entry.sampleSubjects.size < 3) {
      entry.sampleSubjects.add(r.subject);
    }
    if (r.date > entry.latestDate) {
      entry.latestDate = r.date;
      entry.name = r.name || entry.name; // prefer most recent name
    }
  }

  return [...map.values()]
    .map((e) => ({
      ...e,
      accounts: [...e.accounts],
      sampleSubjects: [...e.sampleSubjects],
    }))
    .sort((a, b) => b.count - a.count);
}
