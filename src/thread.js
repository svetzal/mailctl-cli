/**
 * Email thread reconstruction logic.
 * Follows References and In-Reply-To headers to find related messages,
 * with a subject-based fallback when header search is limited.
 */

import { sanitizeForAgentOutput } from "./content-sanitizer.js";
import { htmlToText } from "./html-to-text.js";

/**
 * Strip common reply/forward prefixes from a subject line.
 * @param {string} subject
 * @returns {string}
 */
export function stripSubjectPrefixes(subject) {
  let result = subject;
  let prev;
  do {
    prev = result;
    result = result.replace(/^(Re|Fwd|Fw)\s*:\s*/i, "").trim();
  } while (result !== prev);
  return result;
}

/**
 * Extract all Message-IDs from a References header value.
 * References is a space-separated list of Message-IDs in angle brackets.
 * @param {string | null} references
 * @returns {string[]}
 */
export function parseReferences(references) {
  if (!references) return [];
  const matches = references.match(/<[^>]+>/g);
  return matches ? matches.map((m) => m.slice(1, -1)) : [];
}

/**
 * Search a single mailbox for messages matching any of the given Message-IDs
 * via header search (Message-ID, References, In-Reply-To).
 *
 * @param {any} client - connected IMAP client
 * @param {string} mailboxPath
 * @param {string[]} messageIds - Message-IDs to search for
 * @param {function(object): void} onProgress
 * @returns {Promise<number[]>} UIDs found
 */
async function searchMailboxForThread(client, mailboxPath, messageIds, onProgress) {
  let lock;
  try {
    lock = await client.getMailboxLock(mailboxPath);
  } catch (err) {
    // Mailbox inaccessible — skip gracefully
    onProgress({ type: "mailbox-lock-failed", mailbox: mailboxPath, error: err });
    return [];
  }

  try {
    const uidSet = new Set();

    for (const mid of messageIds) {
      const headerSearches = [
        { header: { "Message-ID": mid } },
        { header: { References: mid } },
        { header: { "In-Reply-To": mid } },
      ];

      for (const criteria of headerSearches) {
        try {
          const uids = await client.search(criteria, { uid: true });
          if (uids && uids.length > 0) {
            for (const uid of uids) uidSet.add(uid);
          }
        } catch (err) {
          // Header search not supported, caller will handle fallback
          onProgress({ type: "search-failed", mailbox: mailboxPath, error: err });
        }
      }
    }

    return [...uidSet];
  } finally {
    lock.release();
  }
}

/**
 * Search a single mailbox for messages with a matching subject (fallback).
 *
 * @param {any} client - connected IMAP client
 * @param {string} mailboxPath
 * @param {string} baseSubject - subject with Re:/Fwd: stripped
 * @param {function(object): void} onProgress
 * @returns {Promise<number[]>} UIDs found
 */
async function searchMailboxBySubject(client, mailboxPath, baseSubject, onProgress) {
  let lock;
  try {
    lock = await client.getMailboxLock(mailboxPath);
  } catch (err) {
    // Mailbox inaccessible — skip gracefully
    onProgress({ type: "mailbox-lock-failed", mailbox: mailboxPath, error: err });
    return [];
  }

  try {
    const uids = await client.search({ subject: baseSubject }, { uid: true });
    return uids && uids.length > 0 ? [...uids] : [];
  } catch (err) {
    // Search failed — return empty results
    onProgress({ type: "search-failed", mailbox: mailboxPath, error: err });
    return [];
  } finally {
    lock.release();
  }
}

/**
 * Fetch envelope + snippet data for a set of UIDs in a mailbox.
 *
 * @param {any} client - connected IMAP client
 * @param {string} accountName
 * @param {string} mailboxPath
 * @param {number[]} uids
 * @param {boolean} [fullBody=false] - fetch full body text
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<Array<{uid: number, account: string, mailbox: string, date: Date, from: string, fromName: string, subject: string, messageId: string, snippet: string, body: string}>>}
 */
async function fetchThreadMessages(client, accountName, mailboxPath, uids, fullBody = false, onProgress = () => {}) {
  if (uids.length === 0) return [];

  let lock;
  try {
    lock = await client.getMailboxLock(mailboxPath);
  } catch (err) {
    // Mailbox inaccessible — skip gracefully
    onProgress({ type: "mailbox-lock-failed", mailbox: mailboxPath, error: err });
    return [];
  }

  try {
    const uidRange = uids.join(",");
    const results = [];
    const fetchFields = {
      envelope: true,
      uid: true,
      source: true,
    };

    for await (const msg of client.fetch(uidRange, fetchFields, { uid: true })) {
      const env = msg.envelope;
      const from = env.from?.[0];

      let bodyText = "";
      if (msg.source) {
        const { simpleParser } = await import("mailparser");
        const parsed = await simpleParser(msg.source);
        bodyText = parsed.text || (parsed.html ? htmlToText(parsed.html) : "");
      }

      const snippet = bodyText.substring(0, 150).replace(/\n/g, " ").trim();

      results.push({
        uid: msg.uid,
        account: accountName,
        mailbox: mailboxPath,
        date: env.date,
        from: from?.address || "",
        fromName: sanitizeForAgentOutput(from?.name || ""),
        subject: sanitizeForAgentOutput(env.subject || ""),
        messageId: env.messageId || "",
        snippet: sanitizeForAgentOutput(snippet),
        body: sanitizeForAgentOutput(fullBody ? bodyText : ""),
      });
    }

    return results;
  } finally {
    lock.release();
  }
}

/**
 * Find all messages in the same thread as the given UID.
 *
 * @param {any} client - connected IMAP client
 * @param {string} accountName
 * @param {string} mailboxPath - mailbox of the anchor message
 * @param {number|string} uid - anchor message UID
 * @param {string[]} searchMailboxPaths - mailboxes to search for thread members
 * @param {object} [opts]
 * @param {number} [opts.limit=50]
 * @param {boolean} [opts.full=false] - fetch full message bodies
 * @param {function(object): void} [opts.onProgress] - receives structured progress events
 * @returns {Promise<{messages: Array, fallback: boolean}>}
 */
export async function findThread(client, accountName, mailboxPath, uid, searchMailboxPaths, opts = {}) {
  const limit = opts.limit || 50;
  const full = opts.full || false;
  const onProgress = opts.onProgress || (() => {});

  // Step 1: Fetch anchor message headers
  let anchorMessageId = "";
  let anchorReferences = "";
  let anchorInReplyTo = "";
  let anchorSubject = "";

  let lock;
  try {
    lock = await client.getMailboxLock(mailboxPath);
  } catch (err) {
    // Mailbox inaccessible — skip gracefully
    onProgress({ type: "mailbox-lock-failed", mailbox: mailboxPath, error: err });
    return { messages: [], fallback: false };
  }

  try {
    const uidStr = String(uid);
    for await (const msg of client.fetch(
      uidStr,
      {
        envelope: true,
        headers: true,
        uid: true,
      },
      { uid: true },
    )) {
      anchorMessageId = msg.envelope.messageId || "";
      anchorSubject = msg.envelope.subject || "";
      if (msg.headers) {
        const headersText = msg.headers.toString();
        const refsMatch = headersText.match(/^References:\s*(.+?)(?=\r?\n\S|\r?\n\r?\n)/ims);
        if (refsMatch) anchorReferences = refsMatch[1].replace(/\r?\n\s+/g, " ").trim();
        const replyMatch = headersText.match(/^In-Reply-To:\s*(.+?)$/im);
        if (replyMatch) anchorInReplyTo = replyMatch[1].trim();
      }
    }
  } finally {
    lock.release();
  }

  if (!anchorMessageId && !anchorReferences && !anchorInReplyTo) {
    // No threading headers at all — return just the anchor
    const messages = await fetchThreadMessages(client, accountName, mailboxPath, [Number(uid)], full, onProgress);
    return { messages: messages.slice(0, limit), fallback: false };
  }

  // Step 2: Collect all related Message-IDs
  const relatedIds = new Set();
  if (anchorMessageId) relatedIds.add(anchorMessageId);
  for (const mid of parseReferences(anchorReferences)) {
    relatedIds.add(mid);
  }
  if (anchorInReplyTo) {
    // In-Reply-To may have angle brackets
    const cleaned = anchorInReplyTo.replace(/^<|>$/g, "");
    if (cleaned) relatedIds.add(cleaned);
  }

  // Step 3: Search across mailboxes for related messages
  /** @type {Map<string, Set<number>>} mailbox -> UIDs */
  const uidsByMailbox = new Map();

  let headerSearchFoundResults = false;

  for (const mbPath of searchMailboxPaths) {
    const foundUids = await searchMailboxForThread(client, mbPath, [...relatedIds], onProgress);
    if (foundUids.length > 0) {
      headerSearchFoundResults = true;
      uidsByMailbox.set(mbPath, new Set(foundUids));
    }
  }

  // Step 4: Fallback to subject-based matching if header search found nothing
  let fallback = false;
  if (!headerSearchFoundResults) {
    fallback = true;
    const baseSubject = stripSubjectPrefixes(anchorSubject);
    if (baseSubject) {
      for (const mbPath of searchMailboxPaths) {
        const foundUids = await searchMailboxBySubject(client, mbPath, baseSubject, onProgress);
        if (foundUids.length > 0) {
          const existing = uidsByMailbox.get(mbPath) || new Set();
          for (const u of foundUids) existing.add(u);
          uidsByMailbox.set(mbPath, existing);
        }
      }
    }
  }

  // Ensure anchor is included
  const anchorSet = uidsByMailbox.get(mailboxPath) || new Set();
  anchorSet.add(Number(uid));
  uidsByMailbox.set(mailboxPath, anchorSet);

  // Step 5: Fetch all messages and deduplicate by Message-ID
  /** @type {Array} */
  const allMessages = [];

  for (const [mbPath, uidSetForMb] of uidsByMailbox) {
    const fetched = await fetchThreadMessages(client, accountName, mbPath, [...uidSetForMb], full, onProgress);
    allMessages.push(...fetched);
  }

  // Deduplicate by messageId
  const seen = new Set();
  const unique = [];
  for (const msg of allMessages) {
    const key = msg.messageId || `${msg.account}:${msg.mailbox}:${msg.uid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(msg);
  }

  // Step 6: Sort chronologically
  unique.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return { messages: unique.slice(0, limit), fallback };
}

/**
 * Format thread results as human-readable text.
 *
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
    const dateStr = msg.date
      ? new Date(msg.date).toLocaleString("en-US", {
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "unknown";
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
