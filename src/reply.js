/**
 * Pure functions for building email replies.
 * No I/O — same inputs always produce the same outputs.
 */

import { htmlToText } from "./html-to-text.js";

/**
 * Build reply headers from the original parsed email.
 * @param {object} original - parsed email (from mailparser)
 * @param {string} _fromAddress - sender's address (the replying user)
 * @returns {{ to: string, subject: string, inReplyTo: string, references: string }}
 */
export function buildReplyHeaders(original, _fromAddress) {
  // Reply-To takes precedence over From
  const replyTo = original.replyTo?.text || original.from?.text || "";
  // Extract just the email address if Reply-To has "Name <addr>" format
  const to = replyTo;

  // Subject: prepend "Re: " unless already present
  const rawSubject = original.subject || "";
  const subject = /^re:\s/i.test(rawSubject) ? rawSubject : `Re: ${rawSubject}`;

  // In-Reply-To: original's Message-ID
  const messageId = original.messageId || "";
  const inReplyTo = messageId;

  // References: original's References + original's Message-ID
  const existingRefs = original.headers?.get("references") || "";
  const refsStr = typeof existingRefs === "string" ? existingRefs : String(existingRefs);
  const refs = refsStr ? `${refsStr} ${messageId}`.trim() : messageId;

  return { to, subject, inReplyTo, references: refs };
}

/**
 * Build the reply body with the user's message and quoted original.
 * @param {string} userMessage - the reply text
 * @param {object} original - parsed email (from mailparser)
 * @param {object} [opts]
 * @param {number} [opts.maxQuoteLines=50] - max lines to quote from original
 * @returns {string}
 */
export function buildReplyBody(userMessage, original, opts = {}) {
  const maxQuoteLines = opts.maxQuoteLines ?? 50;

  // Get plain text from original
  let originalText = original.text || "";
  if (!originalText && original.html) {
    originalText = htmlToText(original.html);
  }

  // Quote the original text
  const lines = originalText.split("\n");
  const truncated = lines.slice(0, maxQuoteLines);
  const quoted = truncated.map((line) => `> ${line}`).join("\n");

  const fromLabel = original.from?.text || "Unknown";
  const dateLabel = original.date ? original.date.toISOString().slice(0, 10) : "Unknown date";
  const attribution = `On ${dateLabel}, ${fromLabel} wrote:`;

  const parts = [userMessage, "", attribution, quoted];
  if (lines.length > maxQuoteLines) {
    parts.push(`> [... ${lines.length - maxQuoteLines} more lines truncated]`);
  }

  return parts.join("\n");
}

/**
 * Build the editor template for --edit mode.
 * Lines starting with # are comments and will be stripped before sending.
 * @param {object} headers - from buildReplyHeaders
 * @param {string} quotedBody - from buildReplyBody with empty user message
 * @returns {string}
 */
export function buildEditorTemplate(headers, quotedBody) {
  const lines = [
    `# Reply to: ${headers.to}`,
    `# Subject: ${headers.subject}`,
    `# Lines starting with # will be removed before sending.`,
    `# Write your reply below:`,
    "",
    "",
    ...quotedBody.split("\n"),
  ];
  return lines.join("\n");
}

/**
 * Parse editor content: strip comment lines and return the reply text.
 * @param {string} content - raw editor file content
 * @returns {string}
 */
export function parseEditorContent(content) {
  return content
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n")
    .trim();
}
