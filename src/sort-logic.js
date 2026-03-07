/**
 * Pure classification logic for receipt sorting.
 * No I/O — takes plain data, returns plain data.
 */

/** IMAP folder for business receipts. */
export const BIZ_FOLDER = "Receipts/Business";

/** IMAP folder for personal receipts. */
export const PERSONAL_FOLDER = "Receipts/Personal";

/**
 * Classify a message by its sender address against the loaded classifications map.
 * @param {string} address - lowercase sender email address
 * @param {Record<string, string>} classifications - address → "business"|"personal"
 * @returns {"business"|"personal"|"unclassified"}
 */
export function classifyMessage(address, classifications) {
  const cls = classifications[address];
  if (cls === "business") return "business";
  if (cls === "personal") return "personal";
  return "unclassified";
}

/**
 * Plan IMAP moves by grouping UIDs into business and personal buckets.
 * Unclassified messages default to personal.
 * @param {Array<{ uid: number|string, address: string }>} messages
 * @param {Record<string, string>} classifications
 * @returns {{ business: Array<number|string>, personal: Array<number|string> }}
 */
export function planMoves(messages, classifications) {
  const business = [];
  const personal = [];

  for (const msg of messages) {
    const cls = classifyMessage(msg.address, classifications);
    if (cls === "business") {
      business.push(msg.uid);
    } else {
      personal.push(msg.uid);
    }
  }

  return { business, personal };
}
