/**
 * Extract-attachment command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js extract-attachment handler
 * so it can be tested independently. All I/O is injected via deps.
 */
import { join, resolve } from "node:path";
import { findAttachmentParts } from "./attachment-parts.js";
import { buildAttachmentListing, validateAttachmentIndex } from "./extract-attachment-logic.js";
import { uidNotFoundError, withMessage } from "./find-message.js";

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
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<
 *   | { found: true, list: true, account: string, uid: number, attachments: Array }
 *   | { found: true, list: false, path: string, filename: string, size: number, contentType: string }
 * >}
 * @throws {Error} when the UID is not found in any account
 */
export async function extractAttachmentCommand(uid, attachmentIndex, opts, deps, onProgress = () => {}) {
  const { targetAccounts, forEachAccount, listMailboxes, fsGateway } = deps;

  const { result } = await withMessage(
    uid,
    opts,
    { targetAccounts, forEachAccount, listMailboxes },
    async (client, acct, mailbox) => {
      // Fetch BODYSTRUCTURE to enumerate attachments without downloading the full message
      let bodyStructure;
      try {
        for await (const fetched of client.fetch(String(uid), { bodyStructure: true }, { uid: true })) {
          bodyStructure = fetched.bodyStructure;
        }
      } catch (err) {
        onProgress({ type: "search-failed", mailbox, error: err });
        throw uidNotFoundError(uid);
      }

      if (!bodyStructure) throw uidNotFoundError(uid);

      const listing = buildAttachmentListing(findAttachmentParts(bodyStructure));

      if (opts.list) {
        return {
          found: true,
          list: true,
          account: acct.name,
          uid: parseInt(uid, 10),
          attachments: listing,
        };
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

      return {
        found: true,
        list: false,
        path: outPath,
        filename,
        size: buffer.length,
        contentType: att.contentType,
      };
    },
    onProgress,
  );

  return /** @type {any} */ (result);
}
