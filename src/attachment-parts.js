/**
 * Helpers for extracting attachment metadata from IMAP BODYSTRUCTURE.
 * Avoids downloading full raw messages just to list or find attachments.
 */

/**
 * Checks both Content-Disposition parameters and Content-Type parameters.
 * @param {object} part - BODYSTRUCTURE part node
 * @returns {string|null}
 */
export function getPartFilename(part) {
  return part.dispositionParameters?.filename || part.parameters?.name || null;
}

/**
 * Determine whether a BODYSTRUCTURE part is an inline image (CID-referenced).
 * These are embedded in HTML body and should not be treated as user-facing attachments.
 * @param {object} part
 * @returns {boolean}
 */
function isInlineImage(part) {
  if (!part.type) return false;
  const isImage = part.type.startsWith("image/");
  const isInline = part.disposition === "inline" || !part.disposition;
  const hasCid = !!part.id;
  return isImage && isInline && hasCid;
}

/**
 * Determine whether a BODYSTRUCTURE part is an S/MIME cryptographic signature.
 * These should never be treated as user-facing attachments — users want the
 * actual document (PDF/etc.), not the detached signature.
 * @param {object} part
 * @returns {boolean}
 */
export function isSignaturePart(part) {
  if (!part.type) return false;
  if (part.type === "application/pkcs7-signature" || part.type === "application/x-pkcs7-signature") {
    return true;
  }
  // Some MTAs encode the signature as application/pkcs7-mime with smime-type=signed-data,
  // or simply name it smime.p7s — match by filename as a safety net.
  const filename = getPartFilename(part);
  if (filename && filename.toLowerCase() === "smime.p7s") {
    return true;
  }
  return false;
}

/**
 * Recursively find all user-facing attachment parts from a BODYSTRUCTURE tree.
 * Excludes inline CID images (embedded in HTML body).
 *
 * @param {object} structure - BODYSTRUCTURE root node from ImapFlow
 * @returns {Array<{part: string, type: string, size: number, filename: string|null, disposition: string|null}>}
 */
export function findAttachmentParts(structure) {
  const parts = [];
  if (!structure) return parts;
  collectAttachmentParts(structure, parts);
  return parts;
}

function collectAttachmentParts(node, parts) {
  if (!node) return;

  // Recurse into multipart children
  if (node.childNodes) {
    for (const child of node.childNodes) {
      collectAttachmentParts(child, parts);
    }
    return;
  }

  // Skip inline CID images
  if (isInlineImage(node)) return;

  // Skip S/MIME signature parts — users want the document, not the detached signature
  if (isSignaturePart(node)) return;

  // Skip text/plain and text/html body parts (unless explicitly attached)
  if ((node.type === "text/plain" || node.type === "text/html") && node.disposition !== "attachment") {
    return;
  }

  // This is an attachment-like part
  const filename = getPartFilename(node);
  parts.push({
    part: node.part || "1",
    type: node.type,
    size: node.size || 0,
    filename,
    disposition: node.disposition || null,
  });
}

/**
 * Recursively find PDF attachment parts in a BODYSTRUCTURE.
 * Checks both Content-Type and Content-Disposition filename for PDF detection.
 *
 * @param {object} structure - BODYSTRUCTURE root node
 * @returns {Array<{part: string, type: string, size: number, filename: string|null, disposition: string|null}>}
 */
export function findPdfParts(structure) {
  const parts = [];
  if (!structure) return parts;
  collectPdfParts(structure, parts);
  return parts;
}

function collectPdfParts(node, parts) {
  if (!node) return;

  if (node.childNodes) {
    for (const child of node.childNodes) {
      collectPdfParts(child, parts);
    }
    return;
  }

  const filename = getPartFilename(node);
  const isPdf =
    node.type === "application/pdf" ||
    (node.type === "application/octet-stream" && filename?.toLowerCase().endsWith(".pdf"));

  if (isPdf) {
    parts.push({
      part: node.part || "1",
      type: node.type,
      size: node.size || 0,
      filename,
      disposition: node.disposition || null,
    });
  }
}
