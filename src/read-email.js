/**
 * Pure formatting functions for the `read` command.
 * Accepts a parsed mailparser result and options; returns structured data or text.
 * No I/O — same inputs always produce the same outputs.
 */

import { headerValueToString, sanitizeString } from "./cli-helpers.js";
import { htmlToText } from "./html-to-text.js";
import { extractUnsubscribeLinks } from "./unsubscribe.js";

/**
 * @typedef {object} ReadResultOptions
 * @property {number} maxBody - max characters to include in body/bodyHtml
 * @property {boolean} includeHeaders - whether to include raw headers map
 */

/**
 * Build a structured JSON-friendly result object from a parsed email.
 *
 * @param {object} parsed - mailparser ParsedMail result
 * @param {string} acctName - account name (e.g. "icloud")
 * @param {string|number} uid - message UID
 * @param {ReadResultOptions} opts
 * @returns {object}
 */
export function buildReadResult(parsed, acctName, uid, opts) {
  const bodyText = parsed.text || (parsed.html ? htmlToText(parsed.html) : "");

  const result = /** @type {Record<string, any>} */ ({
    account: acctName,
    uid: typeof uid === "string" ? parseInt(uid, 10) : uid,
    date: parsed.date,
    from: sanitizeString(parsed.from?.text || ""),
    to: sanitizeString(parsed.to?.text || ""),
    subject: sanitizeString(parsed.subject || ""),
    attachments: parsed.attachments?.map((a) => a.filename || "(unnamed)") || [],
    body: sanitizeString(bodyText.substring(0, opts.maxBody)),
    unsubscribeLinks: extractUnsubscribeLinks(parsed),
  });

  if (parsed.html) {
    result.bodyHtml = sanitizeString(parsed.html.substring(0, opts.maxBody));
  }

  if (opts.includeHeaders) {
    const headersObj = /** @type {Record<string, any>} */ ({});
    parsed.headers.forEach((value, key) => {
      headersObj[key] = headerValueToString(value);
    });
    result.headers = headersObj;
  }

  return result;
}

/**
 * @typedef {object} FormatTextOptions
 * @property {number} maxBody - max characters for body output
 * @property {boolean} showHeaders - whether to print raw headers
 * @property {boolean} showRaw - output raw HTML instead of plain text
 */

/**
 * Format a parsed email as a human-readable terminal string.
 *
 * @param {object} parsed - mailparser ParsedMail result
 * @param {FormatTextOptions} opts
 * @returns {string}
 */
export function formatReadResultText(parsed, opts) {
  const bodyText = parsed.text || (parsed.html ? htmlToText(parsed.html) : "");
  const lines = [];

  lines.push(`\nDate: ${parsed.date}`);
  lines.push(`From: ${parsed.from?.text}`);
  lines.push(`To: ${parsed.to?.text}`);
  lines.push(`Subject: ${parsed.subject}`);

  if (parsed.attachments?.length) {
    const names = parsed.attachments.map((a) => a.filename || "(unnamed)").join(", ");
    lines.push(`Attachments: ${names}`);
  }

  if (opts.showHeaders) {
    lines.push("\n--- Headers ---");
    parsed.headers.forEach((value, key) => {
      const display = typeof value === "string" ? value : value?.text || String(value);
      lines.push(`${key}: ${display}`);
    });
  }

  if (opts.showRaw && parsed.html) {
    lines.push(`\n${parsed.html.substring(0, opts.maxBody)}`);
  } else {
    lines.push(`\n${bodyText.substring(0, opts.maxBody) || "(no text body)"}`);
  }

  return lines.join("\n");
}
