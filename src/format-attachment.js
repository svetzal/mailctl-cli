import { formatOutput } from "./cli-helpers.js";

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
