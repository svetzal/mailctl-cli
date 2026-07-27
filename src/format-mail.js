// Combined formatter module for all read-only mail commands (mail-cli.js consumers).
// Previously split across format-read, format-search, format-folders, format-thread,
// format-inbox, format-contacts, and format-attachment.

import { createFormatOutput, formatOutput, headerValueToString } from "./cli-helpers.js";
import { assessContent, sanitizeForAgentOutput } from "./content-sanitizer.js";
import { formatDatetime, formatMessageDate, formatShortDate } from "./format-date.js";
import { htmlToText } from "./html-to-text.js";
import { extractUnsubscribeLinks } from "./unsubscribe.js";

/**
 * Builds the "results may be incomplete" warning line for a non-empty list of
 * per-account connect failures, mirroring the pattern used by
 * formatDownloadReceiptsText for search failures. Returns null when there are
 * no failures to report.
 *
 * @param {Array<{account: string, error: string}>} [accountFailures]
 * @returns {string|null}
 */
export function accountFailuresWarning(accountFailures = []) {
  if (accountFailures.length === 0) return null;
  const names = accountFailures.map((f) => f.account).join(", ");
  return `⚠ ${accountFailures.length} account${accountFailures.length === 1 ? "" : "s"} failed to connect (${names}) — results may be incomplete`;
}

/**
 * Single home for the --json account-failure envelope rule shared by every
 * read-only command's JSON builder: when there are no account failures, the
 * payload is returned unchanged; when there are failures, they're attached
 * alongside it. Array payloads get wrapped under `arrayKey` (since a bare
 * array can't carry an extra field); object payloads are merged directly.
 *
 * @param {object[] | object} payload - the array or object JSON payload
 * @param {Array<{account: string, error: string}>} accountFailures
 * @param {string} [arrayKey] - required when payload is an array; the key to nest it under
 * @returns {object[] | object}
 */
export function attachAccountFailures(payload, accountFailures = [], arrayKey) {
  if (accountFailures.length === 0) return payload;
  if (arrayKey) return { [arrayKey]: payload, accountFailures };
  return { .../** @type {object} */ (payload), accountFailures };
}

// ── format-read ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_BODY_CHARS = 3000;

/**
 * @typedef {object} ReadResultOptions
 * @property {number} maxBody - max characters to include in body/bodyHtml
 * @property {boolean} includeHeaders - whether to include raw headers map
 */

/**
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
    from: sanitizeForAgentOutput(parsed.from?.text || ""),
    to: sanitizeForAgentOutput(parsed.to?.text || ""),
    subject: sanitizeForAgentOutput(parsed.subject || ""),
    attachments: parsed.attachments?.map((a) => a.filename || "(unnamed)") || [],
    body: sanitizeForAgentOutput(bodyText.substring(0, opts.maxBody)),
    unsubscribeLinks: extractUnsubscribeLinks(parsed),
    injectionRisk: assessContent(bodyText.substring(0, opts.maxBody)),
  });

  if (parsed.html) {
    result.bodyHtml = sanitizeForAgentOutput(parsed.html.substring(0, opts.maxBody));
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
 * @param {object} parsed - mailparser ParsedMail result
 * @param {FormatTextOptions} opts
 * @returns {string}
 */
export function formatReadText(parsed, opts) {
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

/**
 * In JSON mode, includes the full body unless --max-body was explicitly set.
 *
 * @param {object} parsed - mailparser ParsedMail result
 * @param {string} acctName - account name
 * @param {string|number} uid - message UID
 * @param {{ maxBody: number, maxBodyExplicit: boolean, includeHeaders: boolean }} opts
 * @returns {object}
 */
export function buildReadJson(parsed, acctName, uid, opts) {
  const effectiveMaxBody = opts.maxBodyExplicit ? opts.maxBody : Infinity;
  return buildReadResult(parsed, acctName, uid, {
    maxBody: effectiveMaxBody,
    includeHeaders: opts.includeHeaders,
  });
}

/**
 * @param {boolean} json
 * @param {object} parsed - mailparser ParsedMail result
 * @param {string} acctName - account name
 * @param {string} uid - message UID
 * @param {{ maxBody?: string|number, headers?: boolean, raw?: boolean }} opts
 * @returns {string}
 */
export function formatReadOutput(json, parsed, acctName, uid, opts) {
  const maxBody = opts.maxBody !== undefined ? parseInt(String(opts.maxBody), 10) : DEFAULT_MAX_BODY_CHARS;
  const maxBodyExplicit = opts.maxBody !== undefined;
  return formatOutput(
    json,
    buildReadJson(parsed, acctName, uid, { maxBody, maxBodyExplicit, includeHeaders: !!opts.headers }),
    formatReadText(parsed, { maxBody, showHeaders: !!opts.headers, showRaw: !!opts.raw }),
  );
}

// ── format-search ─────────────────────────────────────────────────────────────

/**
 * @typedef {object} SearchResult
 * @property {string} mailbox - mailbox path where the result was found
 * @property {string|number} uid - message UID
 * @property {string} [messageId] - internal message ID (stripped from JSON output)
 * @property {string|Date} [date] - message date
 * @property {string} [fromName] - sender display name
 * @property {string} [from] - sender email address
 * @property {string} [to] - recipient email address
 * @property {string} [toName] - recipient display name
 * @property {string} [subject] - message subject
 */

/**
 * Each result appears on one line: [mailbox] UID:N date | fromName <from> | subject
 *
 * @param {SearchResult[]} results
 * @param {Array<{account: string, error: string}>} [accountFailures]
 * @returns {string}
 */
export function formatSearchText(results, accountFailures = []) {
  const warning = accountFailuresWarning(accountFailures);
  if (results.length === 0) {
    return warning ?? "";
  }

  const lines = results.map((r) => {
    const fromPart = `${r.fromName || ""} <${r.from ?? ""}>`;
    const toPart = r.to ? ` → ${r.toName || ""} <${r.to}>` : "";
    return `  [${r.mailbox}] UID:${r.uid} ${r.date ?? ""} | ${fromPart}${toPart} | ${r.subject ?? ""}`;
  });

  if (warning) lines.push(warning);

  return lines.join("\n");
}

/**
 * Strips the internal messageId field (used for dedup) before output.
 * When there are account connect failures, wraps the results so consumers of
 * --json output can distinguish "no results" from "some accounts unreachable".
 *
 * @param {SearchResult[]} results
 * @param {Array<{account: string, error: string}>} [accountFailures]
 * @returns {object[] | { results: object[], accountFailures: Array<{account: string, error: string}> }}
 */
export function buildSearchJson(results, accountFailures = []) {
  const stripped = results.map(({ messageId, ...rest }) => rest);
  return attachAccountFailures(stripped, accountFailures, "results");
}

/** @type {(json: boolean, results: SearchResult[], accountFailures?: Array<{account: string, error: string}>) => string} */
export const formatSearchOutput = createFormatOutput(buildSearchJson, formatSearchText);

// ── format-folders ────────────────────────────────────────────────────────────

/**
 * @typedef {object} FolderInfo
 * @property {string} path - IMAP folder path
 * @property {string|null} specialUse - special-use attribute (e.g. "\\Trash") or null
 */

/**
 * @typedef {object} AccountFolders
 * @property {string} account - account display name
 * @property {FolderInfo[]} folders - folders belonging to this account
 */

/**
 * @param {AccountFolders[]} foldersByAccount - folder data grouped by account
 * @param {Array<{account: string, error: string}>} [accountFailures]
 * @returns {string}
 */
export function formatFoldersText(foldersByAccount, accountFailures = []) {
  const warning = accountFailuresWarning(accountFailures);
  if (foldersByAccount.length === 0) {
    return warning ?? "";
  }

  const lines = [];

  for (const { account, folders } of foldersByAccount) {
    lines.push(`\n=== ${account} ===`);
    for (const f of folders) {
      const special = f.specialUse ? ` (${f.specialUse})` : "";
      lines.push(`  ${f.path}${special}`);
    }
  }

  if (warning) lines.push(`\n${warning}`);

  return lines.join("\n");
}

/**
 * Flattens per-account folder groups into a single array, tagging each entry with its account name.
 * When there are account connect failures, wraps the array with an accountFailures field.
 *
 * @param {AccountFolders[]} foldersByAccount
 * @param {Array<{account: string, error: string}>} [accountFailures]
 * @returns {{ account: string, path: string, specialUse: string|null }[] | { folders: { account: string, path: string, specialUse: string|null }[], accountFailures: Array<{account: string, error: string}> }}
 */
export function buildFoldersJson(foldersByAccount, accountFailures = []) {
  const folders = foldersByAccount.flatMap((af) => af.folders.map((f) => ({ account: af.account, ...f })));
  return attachAccountFailures(folders, accountFailures, "folders");
}

/** @type {(json: boolean, foldersByAccount: AccountFolders[], accountFailures?: Array<{account: string, error: string}>) => string} */
export const formatFoldersOutput = createFormatOutput(buildFoldersJson, formatFoldersText);

// ── format-thread ─────────────────────────────────────────────────────────────

/**
 * @param {Array} messages
 * @param {object} [opts]
 * @param {boolean} [opts.full=false] - show full bodies
 * @param {boolean} [opts.fallback=false] - indicate subject-match fallback
 * @returns {string}
 */
export function formatThreadText(messages, opts = {}) {
  if (messages.length === 0) return "No thread messages found.";

  const lines = [];
  const threadSubject = messages[messages.length - 1].subject || messages[0].subject || "(no subject)";
  const note = opts.fallback ? " (thread reconstructed by subject match)" : "";
  lines.push(`Thread: ${threadSubject} (${messages.length} message${messages.length === 1 ? "" : "s"})${note}`);
  lines.push("");

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const dateStr = msg.date ? formatDatetime(new Date(msg.date)) || "unknown" : "unknown";
    const sender = msg.fromName ? `${msg.fromName} <${msg.from}>` : msg.from;

    lines.push(`  ${i + 1}. ${dateStr}  ${sender}`);
    lines.push(`     ${msg.subject}`);

    if (opts.full && msg.body) {
      lines.push(`     ${"─".repeat(60)}`);
      lines.push(
        msg.body
          .split("\n")
          .map((l) => `     ${l}`)
          .join("\n"),
      );
      lines.push("");
    } else {
      lines.push(`     ${msg.snippet}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * @param {string} acctName - account name
 * @param {number} threadSize - number of messages in the thread
 * @param {boolean} fallback - true if thread was reconstructed by subject match
 * @param {object[]} messages - thread messages
 * @returns {{ account: string, threadSize: number, fallback: boolean, messages: object[] }}
 */
export function buildThreadJson(acctName, threadSize, fallback, messages) {
  return { account: acctName, threadSize, fallback, messages };
}

/**
 * @param {boolean} json
 * @param {Array<{ account: string, threadSize: number, fallback: boolean, messages: object[] }>} results
 * @param {{ full?: boolean }} opts
 * @returns {Array<{ account: string, output: string }>}
 */
export function formatThreadOutput(json, results, opts) {
  return results.map(({ account, threadSize, fallback, messages }) => ({
    account,
    output: formatOutput(
      json,
      buildThreadJson(account, threadSize, fallback, messages),
      formatThreadText(messages, { full: opts.full, fallback }),
    ),
  }));
}

// ── format-inbox ──────────────────────────────────────────────────────────────

/**
 * @param {Map<string, Array<{account: string, uid: number, date: Date, from: string, fromName: string, subject: string, unread: boolean, mailbox: string}>>} resultsByAccount
 * @param {Array<{account: string, error: string}>} [accountFailures]
 * @returns {string}
 */
export function formatInboxText(resultsByAccount, accountFailures = []) {
  const lines = [];

  for (const [accountName, messages] of resultsByAccount) {
    const unreadCount = messages.filter((m) => m.unread).length;
    const unreadLabel = unreadCount > 0 ? ` (${unreadCount} unread)` : "";
    lines.push(`=== ${accountName}${unreadLabel} ===`);

    if (messages.length === 0) {
      lines.push("  (no messages)");
    }

    for (const msg of messages) {
      const marker = msg.unread ? "●" : "○";
      const dateStr = formatMessageDate(msg.date);
      const sender = msg.fromName ? `${msg.fromName} <${msg.from}>` : msg.from;
      lines.push(`  ${marker} UID:${msg.uid}  ${dateStr}  ${sender}`);
      lines.push(`    ${msg.subject}`);
    }

    lines.push("");
  }

  const warning = accountFailuresWarning(accountFailures);
  if (warning) lines.push(warning);

  return lines.join("\n");
}

/**
 * @param {Array<{account: string, uid: number, date: Date, from: string, fromName: string, subject: string, unread: boolean, mailbox: string}>} allResults
 * @param {Array<{account: string, error: string}>} [accountFailures]
 * @returns {object[] | { results: object[], accountFailures: Array<{account: string, error: string}> }}
 */
export function buildInboxJson(allResults, accountFailures = []) {
  const results = allResults.map((msg) => ({
    account: msg.account,
    uid: msg.uid,
    date: msg.date instanceof Date ? msg.date.toISOString() : msg.date,
    from: msg.from,
    fromName: msg.fromName,
    subject: msg.subject,
    unread: msg.unread,
    mailbox: msg.mailbox,
  }));
  return attachAccountFailures(results, accountFailures, "results");
}

/**
 * @param {boolean} json
 * @param {Array<{account: string, uid: number, date: Date, from: string, fromName: string, subject: string, unread: boolean, mailbox: string}>} allResults
 * @param {Map<string, Array<{account: string, uid: number, date: Date, from: string, fromName: string, subject: string, unread: boolean, mailbox: string}>>} resultsByAccount
 * @param {Array<{account: string, error: string}>} [accountFailures]
 * @returns {string}
 */
export function formatInboxOutput(json, allResults, resultsByAccount, accountFailures = []) {
  return formatOutput(
    json,
    buildInboxJson(allResults, accountFailures),
    formatInboxText(resultsByAccount, accountFailures),
  );
}

// ── format-contacts ───────────────────────────────────────────────────────────

/**
 * @param {Array<{address: string, name: string, count: number, lastSeen: Date, direction: string}>} contacts
 * @param {object} opts
 * @param {string} opts.sinceLabel
 * @param {Array<{account: string, error: string}>} [opts.accountFailures]
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

  const warning = accountFailuresWarning(opts.accountFailures);
  if (warning) lines.push(warning);

  return lines.join("\n");
}

/**
 * @param {Array<{address: string, name: string, count: number, lastSeen: Date, direction: string}>} contacts
 * @param {object} opts
 * @param {string} opts.sinceLabel
 * @param {Array<{account: string, error: string}>} [opts.accountFailures]
 * @returns {object}
 */
export function buildContactsJson(contacts, opts) {
  const payload = {
    sinceLabel: opts.sinceLabel,
    contacts: contacts.map((c) => ({
      address: c.address,
      name: c.name,
      count: c.count,
      lastSeen: c.lastSeen instanceof Date ? c.lastSeen.toISOString() : c.lastSeen,
      direction: c.direction,
    })),
  };
  return attachAccountFailures(payload, opts.accountFailures);
}

/** @type {(json: boolean, contacts: Array<{address: string, name: string, count: number, lastSeen: Date, direction: string}>, opts: {sinceLabel: string, accountFailures?: Array<{account: string, error: string}>}) => string} */
export const formatContactsOutput = createFormatOutput(buildContactsJson, formatContactsText);

// ── format-attachment ─────────────────────────────────────────────────────────

/**
 * @typedef {object} AttachmentEntry
 * @property {number} index - 0-based attachment index
 * @property {string} filename - attachment filename (or "(unnamed)")
 * @property {string} contentType - MIME content type
 * @property {number} size - size in bytes
 * @property {string} part - BODYSTRUCTURE part identifier
 */

/**
 * @param {AttachmentEntry[]} attachments - list of attachment entries
 * @returns {string}
 */
export function formatAttachmentListText(attachments) {
  if (attachments.length === 0) {
    return "No attachments.";
  }

  return attachments
    .map((entry) => `[${entry.index}] ${entry.filename}  ${entry.contentType}  ${entry.size} bytes`)
    .join("\n");
}

/**
 * @param {string} path - the absolute path where the attachment was saved
 * @returns {string}
 */
export function formatAttachmentSavedText(path) {
  return path;
}

/**
 * @param {{ account: string, uid: string|number, attachments: AttachmentEntry[] }} result
 * @returns {{ account: string, uid: string|number, attachments: AttachmentEntry[] }}
 */
export function buildAttachmentListJson(result) {
  return { account: result.account, uid: result.uid, attachments: result.attachments };
}

/**
 * @param {{ path: string, filename: string, size: number, contentType: string }} result
 * @returns {{ path: string, filename: string, size: number, contentType: string }}
 */
export function buildAttachmentSavedJson(result) {
  return { path: result.path, filename: result.filename, size: result.size, contentType: result.contentType };
}

/**
 * @typedef {{ list: boolean, account: string, uid: string|number, attachments: AttachmentEntry[] }} AttachmentListResult
 * @typedef {{ path: string, filename: string, size: number, contentType: string }} AttachmentSavedResult
 */

/**
 * @param {boolean} json
 * @param {AttachmentListResult | AttachmentSavedResult} result
 * @returns {string}
 */
export function formatAttachmentOutput(json, result) {
  if (/** @type {AttachmentListResult} */ (result).list) {
    const listResult = /** @type {AttachmentListResult} */ (result);
    return formatOutput(json, buildAttachmentListJson(listResult), formatAttachmentListText(listResult.attachments));
  }
  const savedResult = /** @type {AttachmentSavedResult} */ (result);
  return formatOutput(json, buildAttachmentSavedJson(savedResult), formatAttachmentSavedText(savedResult.path));
}
