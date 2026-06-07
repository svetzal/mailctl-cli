/**
 * Pure logic for the `extract-attachment` command.
 * No I/O — takes plain data, returns plain data.
 */

/**
 * @typedef {object} AttachmentListing
 * @property {number} index - 0-based position in the listing
 * @property {string} filename - display name, "(unnamed)" when unknown
 * @property {string} contentType - MIME content-type, "unknown" when absent
 * @property {number} size - size in bytes
 * @property {string} part - IMAP part number (e.g. "2.1")
 */

/**
 * Map raw BODYSTRUCTURE attachment parts to a UI-friendly listing array.
 *
 * @param {Array<{filename?: string|null, type?: string, size?: number, part: string}>} attachments
 * @returns {AttachmentListing[]}
 */
export function buildAttachmentListing(attachments) {
  return attachments.map((a, i) => ({
    index: i,
    filename: a.filename || "(unnamed)",
    contentType: a.type || "unknown",
    size: a.size || 0,
    part: a.part,
  }));
}

/**
 * Validate that an attachment index is in range for the given listing
 * and return the attachment at that index.
 *
 * @param {AttachmentListing[]} attachments
 * @param {number} index
 * @param {string|number} uid - used only for error message context
 * @returns {AttachmentListing}
 * @throws {Error} when the index is out of range or there are no attachments
 */
export function validateAttachmentIndex(attachments, index, uid) {
  if (attachments.length === 0) {
    throw new Error(`No attachments found on UID ${uid}.`);
  }

  if (index < 0 || index >= attachments.length) {
    throw new Error(`Attachment index ${index} out of range (0-${attachments.length - 1}).`);
  }

  return attachments[index];
}

/**
 * Select the best default attachment when no explicit index is given.
 *
 * Preference order:
 * 1. First `application/pdf` part (most likely the document the user wants)
 * 2. First non-signature part (smime.p7s is the canonical filename for detached S/MIME signatures)
 * 3. First part (fallback — only when everything else is a signature)
 *
 * @param {AttachmentListing[]} attachments
 * @returns {AttachmentListing}
 * @throws {Error} when the listing is empty
 */
export function selectDefaultAttachment(attachments) {
  if (attachments.length === 0) {
    throw new Error("No attachments found.");
  }

  const pdf = attachments.find((a) => a.contentType === "application/pdf");
  if (pdf) return pdf;

  const nonSignature = attachments.find(
    (a) => a.filename?.toLowerCase() !== "smime.p7s" && a.contentType !== "application/pkcs7-signature",
  );
  if (nonSignature) return nonSignature;

  return attachments[0];
}
