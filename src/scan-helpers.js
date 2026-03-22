/**
 * Pure helper functions for IMAP receipt scanning.
 * Extracted from imap-client.js so they can be tested independently of IMAP I/O.
 */

/**
 * Build a normalised scan result object from an IMAP message envelope.
 *
 * @param {string} accountName
 * @param {string} mailbox - mailbox path the message lives in
 * @param {{ uid: number, envelope?: { from?: Array<{ name?: string, address?: string }>, subject?: string, date?: Date } }} msg - imapflow message with envelope
 * @returns {{ account: string, from: string, address: string, name: string, subject: string, date: Date|undefined, mailbox: string, uid: number }}
 */
export function buildScanResult(accountName, mailbox, msg) {
  const env = msg.envelope ?? {};
  const from = env.from?.[0];
  const fromAddr = from ? `${from.name || ""} <${from.address}>`.trim() : "unknown";

  return {
    account: accountName,
    from: fromAddr,
    address: from?.address?.toLowerCase() || "unknown",
    name: from?.name || "",
    subject: env.subject || "",
    date: env.date,
    mailbox,
    uid: msg.uid,
  };
}
