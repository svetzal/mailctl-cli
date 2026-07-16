/** @typedef {import('./receipt-types.js').ReceiptMetadata} ReceiptMetadata */
/** @typedef {import('./receipt-types.js').ReceiptMessageEnvelope} ReceiptMessageEnvelope */

import { simpleParser } from "mailparser";
import { htmlToText } from "../html-to-text.js";
import { doclingConversionFailed } from "./download-receipts-event-factories.js";
import { extractReceiptMetadata, sanitizeForAgentOutput } from "./llm-receipt-extraction.js";
import { resolveExtractionText } from "./pdf-converter.js";
import {
  classifyReceiptExtraction,
  contentHash,
  MIN_INVOICE_CONFIDENCE,
  receiptDecisionEvent,
} from "./receipt-decisions.js";
import { writeReceiptOutput } from "./receipt-output-tree.js";

const BODY_SNIPPET_MAX_CHARS = 2000;

/**
 * Download and parse a raw email message into its constituent parts.
 *
 * @param {object} client - connected IMAP client
 * @param {ReceiptMessageEnvelope} msg - envelope result
 * @returns {Promise<{ parsed: import("mailparser").ParsedMail, bodyText: string, emailDate: Date, pdfAttachments: Array }>}
 */
async function parseReceiptMessage(client, msg) {
  const raw = await client.download(String(msg.uid), undefined, { uid: true });
  const chunks = [];
  for await (const chunk of raw.content) chunks.push(chunk);
  const buf = Buffer.concat(chunks);
  const parsed = await simpleParser(buf);

  const bodyText = parsed.text || (parsed.html ? htmlToText(parsed.html) : "");
  const emailDate = parsed.date || msg.date || new Date();
  const pdfAttachments = (parsed.attachments || []).filter(
    (a) => a.contentType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf"),
  );

  return { parsed, bodyText, emailDate, pdfAttachments };
}

/**
 * Stamp account- and message-level provenance fields onto the extracted metadata object.
 * Mutates `metadata` in place.
 *
 * @param {ReceiptMetadata} metadata
 * @param {{ accountName: string, msg: ReceiptMessageEnvelope, bodyText: string }} context
 */
function stampMetadata(metadata, { accountName, msg, bodyText }) {
  metadata.source_account = accountName.toLowerCase();
  metadata.email_uid = msg.uid ?? null;
  metadata.source_body_snippet = sanitizeForAgentOutput(
    bodyText.length > BODY_SNIPPET_MAX_CHARS ? bodyText.slice(0, BODY_SNIPPET_MAX_CHARS) : bodyText,
  );
}

/**
 * @param {object} client - connected IMAP client
 * @param {ReceiptMessageEnvelope} msg - envelope result
 * @param {object} context
 * @param {string} context.accountName
 * @param {string} context.outputDir
 * @param {boolean} context.dryRun
 * @param {boolean} [context.includeEmpty]
 * @param {{ broker: any }|null} context.llm
 * @param {Set<string>} context.existingInvoiceNumbers
 * @param {Set<string>} context.existingHashes
 * @param {Set<string>} context.usedPaths
 * @param {import("../gateways/fs-gateway.js").FileSystemGateway} context.fs
 * @param {import("../gateways/subprocess-gateway.js").SubprocessGateway} context.subprocess
 * @param {function(object): void} [context.onProgress]
 * @returns {Promise<{ action: 'downloaded'|'noPdf'|'skipped'|'duplicate'|'skippedEmpty', metadata?: ReceiptMetadata }>}
 */
export async function processReceiptMessage(client, msg, context) {
  const {
    accountName,
    outputDir,
    dryRun,
    includeEmpty = false,
    llm,
    existingInvoiceNumbers,
    existingHashes,
    usedPaths,
    fs,
    subprocess,
    onProgress = () => {},
  } = context;

  const { parsed, bodyText, emailDate, pdfAttachments } = await parseReceiptMessage(client, msg);

  const extractionText = resolveExtractionText(
    pdfAttachments,
    bodyText,
    /** @type {number} */ (msg.uid),
    fs,
    subprocess,
    onProgress,
    (err, ctx) => onProgress(doclingConversionFailed(err, msg.uid, ctx.pdfPath)),
  );
  const metadata = await extractReceiptMetadata(
    llm,
    extractionText,
    parsed.subject || msg.subject,
    msg.fromAddress,
    msg.fromName,
    emailDate,
    onProgress,
  );

  stampMetadata(metadata, { accountName, msg, bodyText });

  const decision = classifyReceiptExtraction(metadata, pdfAttachments, {
    includeEmpty,
    existingInvoiceNumbers,
    minConfidence: MIN_INVOICE_CONFIDENCE,
  });

  if (decision.action !== "proceed") {
    const ev = receiptDecisionEvent(decision, metadata, msg, emailDate);
    if (ev) onProgress(ev);
    return { action: decision.action };
  }

  const result = writeReceiptOutput({
    metadata,
    pdfAttachments,
    msg,
    bodyText,
    parsed,
    emailDate,
    outputDir,
    dryRun,
    existingHashes,
    usedPaths,
    fs,
    onProgress,
  });

  if (result.action === "downloaded" && metadata.invoice_number) {
    existingInvoiceNumbers.add(metadata.invoice_number);
  }
  if (result.action === "downloaded" && pdfAttachments.length > 0) {
    existingHashes.add(contentHash(pdfAttachments[0].content));
  }

  return result;
}
