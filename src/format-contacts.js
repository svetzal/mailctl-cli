import { formatOutput } from "./cli-helpers.js";
import { formatShortDate } from "./format-date.js";

/**
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
    const dateStr = formatShortDate(c.lastSeen);
    lines.push(`${num}. ${display.padEnd(50)} ${msgs.padStart(8)}  (${dir})   last: ${dateStr}`);
  }

  return lines.join("\n");
}

/**
 * @param {Array<{address: string, name: string, count: number, lastSeen: Date, direction: string}>} contacts
 * @param {object} opts
 * @param {string} opts.sinceLabel
 * @returns {object}
 */
export function buildContactsJson(contacts, opts) {
  return {
    sinceLabel: opts.sinceLabel,
    contacts: contacts.map((c) => ({
      address: c.address,
      name: c.name,
      count: c.count,
      lastSeen: c.lastSeen instanceof Date ? c.lastSeen.toISOString() : c.lastSeen,
      direction: c.direction,
    })),
  };
}

/**
 * @param {boolean} json
 * @param {Array<{address: string, name: string, count: number, lastSeen: Date, direction: string}>} contacts
 * @param {object} opts
 * @param {string} opts.sinceLabel
 * @returns {string}
 */
export function formatContactsOutput(json, contacts, opts) {
  return formatOutput(json, buildContactsJson(contacts, opts), formatContactsText(contacts, opts));
}
