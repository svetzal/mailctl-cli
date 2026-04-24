/**
 * Pure formatting functions for the contacts command.
 * No I/O — same inputs always produce the same outputs.
 */

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
 * Build a JSON-ready object for contacts results.
 *
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
 * Format a contact's last-seen date for display.
 * @param {Date} date
 * @returns {string}
 */
function formatContactDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}
