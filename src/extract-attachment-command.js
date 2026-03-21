/**
 * Extract-attachment command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js extract-attachment handler
 * so it can be tested independently. All I/O is injected via deps.
 */
import { resolve, join } from "path";
import { filterSearchMailboxes } from "./imap-client.js";
import { detectMailbox } from "./mailbox-detect.js";
import { findAttachmentParts } from "./attachment-parts.js";
import { buildAttachmentListing, validateAttachmentIndex } from "./extract-attachment-logic.js";

/**
 * @typedef {object} ExtractAttachmentCommandDeps
 * @property {object[]} targetAccounts - accounts to search
 * @property {Function} forEachAccount - (accounts, fn) → Promise<void>
 * @property {Function} listMailboxes - (client) → Promise<Array>
 * @property {object} fsGateway - { mkdir(path), writeFile(path, data) }
 */

/**
 * Orchestrate listing or saving an attachment from a message by UID.
 *
 * In list mode (opts.list): returns attachment metadata without downloading.
 * In save mode: downloads the specified attachment and writes it to disk.
 *
 * @param {string} uid - message UID
 * @param {number} attachmentIndex - 0-based attachment index to save (ignored in list mode)
 * @param {object} opts - CLI options (list, mailbox, output)
 * @param {ExtractAttachmentCommandDeps} deps - injected dependencies
 * @returns {Promise<
 *   | { found: false }
 *   | { found: true, list: true, account: string, uid: number, attachments: Array }
 *   | { found: true, list: false, path: string, filename: string, size: number, contentType: string }
 * >}
 */
export async function extractAttachmentCommand(uid, attachmentIndex, opts, deps) {
  const { targetAccounts, forEachAccount, listMailboxes, fsGateway } = deps;

  /** @type {any} */
  let result = { found: false };

  await forEachAccount(targetAccounts, async (client, acct) => {
    if (result.found) return;

    let mailbox = opts.mailbox;
    if (!mailbox) {
      const allBoxes = await listMailboxes(client);
      const paths = filterSearchMailboxes(allBoxes);
      mailbox = await detectMailbox(client, uid, paths);
      if (!mailbox) return;
    }

    let lock;
    try {
      lock = await client.getMailboxLock(mailbox);
    } catch {
      return;
    }

    try {
      // Fetch BODYSTRUCTURE to enumerate attachments without downloading the full message
      let bodyStructure;
      try {
        for await (const fetched of client.fetch(String(uid), { bodyStructure: true }, { uid: true })) {
          bodyStructure = fetched.bodyStructure;
        }
      } catch {
        return;
      }

      if (!bodyStructure) return;

      const listing = buildAttachmentListing(findAttachmentParts(bodyStructure));

      if (opts.list) {
        result = {
          found: true,
          list: true,
          account: acct.name,
          uid: parseInt(uid, 10),
          attachments: listing,
        };
        return;
      }

      // Save mode — validateAttachmentIndex throws on invalid index
      const att = validateAttachmentIndex(listing, attachmentIndex, uid);
      const filename = att.filename !== "(unnamed)" ? att.filename : `attachment_${attachmentIndex}`;

      // Download just the specific MIME part, not the entire message
      const { content } = await client.download(String(uid), att.part, { uid: true });
      const chunks = [];
      for await (const chunk of content) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      const outputDir = resolve(opts.output ?? ".");
      fsGateway.mkdir(outputDir);
      const outPath = join(outputDir, filename);
      fsGateway.writeFile(outPath, buffer);

      result = {
        found: true,
        list: false,
        path: outPath,
        filename,
        size: buffer.length,
        contentType: att.contentType,
      };
    } finally {
      lock.release();
    }
  });

  return result;
}
