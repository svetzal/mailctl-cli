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
