/**
 * Pure formatting functions for the reply command.
 * No I/O — same inputs always produce the same outputs.
 */

/**
 * @typedef {object} ReplyMessage
 * @property {string} from - sender address
 * @property {string} to - recipient address
 * @property {string} [cc] - CC addresses (optional)
 * @property {string} subject - email subject
 * @property {string} text - email body text
 * @property {string} inReplyTo - In-Reply-To header value
 * @property {string} references - References header value
 */

/**
 * @typedef {object} ReplySentResult
 * @property {boolean} sent - always true for sent results
 * @property {string} messageId - the sent message's Message-ID
 * @property {string[]} accepted - accepted recipient addresses
 * @property {ReplyMessage} message - the composed message
 */

/**
 * Format a human-readable dry-run preview of a composed reply.
 *
 * @param {ReplyMessage} message - the composed reply message
 * @returns {string}
 */
export function formatReplyDryRunText(message) {
  const lines = [];
  lines.push("--- Dry Run: Composed Reply ---");
  lines.push(`From: ${message.from}`);
  lines.push(`To: ${message.to}`);
  if (message.cc) lines.push(`CC: ${message.cc}`);
  lines.push(`Subject: ${message.subject}`);
  lines.push(`In-Reply-To: ${message.inReplyTo}`);
  lines.push(`References: ${message.references}`);
  lines.push(`\n${message.text}`);
  return lines.join("\n");
}

/**
 * Format a human-readable confirmation that a reply was sent.
 *
 * @param {ReplySentResult} result - the sent reply result
 * @returns {string}
 */
export function formatReplySentText(result) {
  return `Reply sent to ${result.message.to} (Message-ID: ${result.messageId})`;
}
