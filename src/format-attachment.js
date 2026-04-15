/**
 * Pure formatting functions for the extract-attachment command.
 * No I/O — same inputs always produce the same outputs.
 */

/**
 * @typedef {object} AttachmentEntry
 * @property {number} index - 0-based attachment index
 * @property {string} filename - attachment filename (or "(unnamed)")
 * @property {string} contentType - MIME content type
 * @property {number} size - size in bytes
 * @property {string} part - BODYSTRUCTURE part identifier
 */

/**
 * Format a human-readable listing of attachments.
 *
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
 * Format the saved attachment path as a human-readable string.
 *
 * @param {string} path - the absolute path where the attachment was saved
 * @returns {string}
 */
export function formatAttachmentSavedText(path) {
  return path;
}

/**
 * Build a JSON-ready object for an attachment listing result.
 *
 * @param {{ account: string, uid: string|number, attachments: AttachmentEntry[] }} result
 * @returns {{ account: string, uid: string|number, attachments: AttachmentEntry[] }}
 */
export function buildAttachmentListJson(result) {
  return { account: result.account, uid: result.uid, attachments: result.attachments };
}

/**
 * Build a JSON-ready object for a saved attachment result.
 *
 * @param {{ path: string, filename: string, size: number, contentType: string }} result
 * @returns {{ path: string, filename: string, size: number, contentType: string }}
 */
export function buildAttachmentSavedJson(result) {
  return { path: result.path, filename: result.filename, size: result.size, contentType: result.contentType };
}
