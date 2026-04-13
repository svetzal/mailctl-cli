/**
 * Contact extraction — scan envelopes from recent messages to build a frequency-ranked contact list.
 */

import { sanitizeForAgentOutput } from "./content-sanitizer.js";
import { listMailboxes } from "./imap-client.js";

/**
 * Extract contacts from recent email envelopes.
 * Scans INBOX for received messages (From) and Sent folder for sent messages (To/CC).
 * @param {any} client - connected IMAP client
 * @param {string} _accountName
 * @param {object} opts
 * @param {Date} opts.since
 * @param {number} opts.limit
 * @param {boolean} [opts.sentOnly] - only count recipients of sent mail
 * @param {boolean} [opts.receivedOnly] - only count senders of received mail
 * @param {function(object): void} [opts.onProgress] - receives structured progress events
 * @returns {Promise<Array<{address: string, name: string, date: Date, direction: 'sent'|'received'}>>}
 */
export async function extractContacts(client, _accountName, opts) {
  const { since, sentOnly, receivedOnly } = opts;
  const onProgress = opts.onProgress || (() => {});
  const entries = [];

  // Find the Sent mailbox
  const mailboxes = await listMailboxes(client);
  const sentMailbox = mailboxes.find((mb) => mb.specialUse === "\\Sent");
  const sentPath = sentMailbox ? sentMailbox.path : "Sent";

  // Scan INBOX for received messages (extract From addresses)
  if (!sentOnly) {
    const received = await scanMailboxContacts(client, "INBOX", since, "received", onProgress);
    entries.push(...received);
  }

  // Scan Sent folder for sent messages (extract To/CC addresses)
  if (!receivedOnly) {
    const sent = await scanMailboxContacts(client, sentPath, since, "sent", onProgress);
    entries.push(...sent);
  }

  return entries;
}

/**
 * Scan a single mailbox and extract contact entries from envelopes.
 * @param {any} client
 * @param {string} mailboxPath
 * @param {Date} since
 * @param {'sent'|'received'} direction
 * @param {function(object): void} onProgress
 * @returns {Promise<Array<{address: string, name: string, date: Date, direction: 'sent'|'received'}>>}
 */
async function scanMailboxContacts(client, mailboxPath, since, direction, onProgress) {
  /** @type {Array<{address: string, name: string, date: Date, direction: 'sent'|'received'}>} */
  const entries = [];

  let lock;
  try {
    lock = await client.getMailboxLock(mailboxPath);
  } catch (err) {
    // Mailbox inaccessible — skip gracefully
    onProgress({ type: "mailbox-lock-failed", mailbox: mailboxPath, error: err });
    return entries;
  }

  try {
    let uids;
    try {
      uids = await client.search({ since }, { uid: true });
    } catch (err) {
      // Search failed — return empty results
      onProgress({ type: "search-failed", mailbox: mailboxPath, error: err });
      return entries;
    }

    if (!uids || uids.length === 0) return entries;

    const uidRange = uids.join(",");

    for await (const msg of client.fetch(uidRange, { envelope: true, uid: true }, { uid: true })) {
      const env = msg.envelope;
      const date = env.date || new Date(0);

      if (direction === "received") {
        // Extract From addresses
        for (const addr of env.from || []) {
          if (addr.address) {
            entries.push({
              address: addr.address.toLowerCase(),
              name: sanitizeForAgentOutput(addr.name || ""),
              date,
              direction: "received",
            });
          }
        }
      } else {
        // Extract To and CC addresses
        for (const list of [env.to, env.cc]) {
          for (const addr of list || []) {
            if (addr.address) {
              entries.push({
                address: addr.address.toLowerCase(),
                name: sanitizeForAgentOutput(addr.name || ""),
                date,
                direction: "sent",
              });
            }
          }
        }
      }
    }
  } finally {
    lock.release();
  }

  return entries;
}

/**
 * Aggregate raw contact entries into deduplicated, ranked contacts.
 * Pure function — no I/O.
 * @param {Array<{address: string, name: string, date: Date, direction: 'sent'|'received'}>} entries
 * @param {object} [opts]
 * @param {string} [opts.search] - filter by name or address substring
 * @param {number} [opts.limit=25]
 * @param {string[]} [opts.selfAddresses] - addresses to exclude (user's own)
 * @returns {Array<{address: string, name: string, count: number, lastSeen: Date, direction: 'sent'|'received'|'both'}>}
 */
export function aggregateContacts(entries, opts = {}) {
  const { search, limit = 25, selfAddresses = [] } = opts;

  const selfSet = new Set(selfAddresses.map((a) => a.toLowerCase()));

  /** @type {Map<string, {address: string, name: string, count: number, lastSeen: Date, directions: Set<string>}>} */
  const map = new Map();

  for (const entry of entries) {
    const key = entry.address.toLowerCase();

    if (selfSet.has(key)) continue;

    let contact = map.get(key);
    if (!contact) {
      contact = {
        address: key,
        name: entry.name,
        count: 0,
        lastSeen: entry.date,
        directions: new Set(),
      };
      map.set(key, contact);
    }

    contact.count++;
    contact.directions.add(entry.direction);

    if (entry.date > contact.lastSeen) {
      contact.lastSeen = entry.date;
      if (entry.name) {
        contact.name = entry.name;
      }
    } else if (entry.date.getTime() === contact.lastSeen.getTime() && entry.name && !contact.name) {
      contact.name = entry.name;
    }
  }

  let results = [...map.values()].map((c) => ({
    address: c.address,
    name: c.name,
    count: c.count,
    lastSeen: c.lastSeen,
    direction: /** @type {'sent'|'received'|'both'} */ (
      c.directions.size === 2 ? "both" : [...c.directions][0] || "received"
    ),
  }));

  if (search) {
    const lower = search.toLowerCase();
    results = results.filter((c) => c.address.includes(lower) || c.name.toLowerCase().includes(lower));
  }

  results.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.lastSeen.getTime() - a.lastSeen.getTime();
  });

  return results.slice(0, limit);
}

/**
 * Format contacts as human-readable text.
 * @param {Array<{address: string, name: string, count: number, lastSeen: Date, direction: string}>} contacts
 * @param {object} opts
 * @param {string} opts.sinceLabel
 * @returns {string}
 */
export function formatContactsText(contacts, opts) {
  const lines = [];
  lines.push(`Contacts (${opts.sinceLabel}, ${contacts.length} found)`);
  lines.push("");

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    const num = String(i + 1).padStart(4);
    const display = c.name ? `${c.name} <${c.address}>` : c.address;
    const msgs = `${c.count} msgs`;
    const dir = c.direction === "both" ? "both" : c.direction === "sent" ? "sent" : "recv";
    const dateStr = formatContactDate(c.lastSeen);
    lines.push(`${num}. ${display.padEnd(50)} ${msgs.padStart(8)}  (${dir})   last: ${dateStr}`);
  }

  return lines.join("\n");
}

/**
 * Format a contact's last-seen date for display.
 * @param {Date} date
 * @returns {string}
 */
function formatContactDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}
