// Public API

export { discoverAccountsFromEnv, loadAccounts } from "./accounts.js";
export { collectValues, headerValueToString, sanitizeString } from "./cli-helpers.js";
export { getConfigAccounts, loadConfig } from "./config.js";
export { downloadReceiptEmails } from "./download-receipts.js";
export { buildFilename, downloadReceipts, getVendorNames, vendorName } from "./downloader.js";
export { FileSystemGateway } from "./gateways/fs-gateway.js";
// Gateways
export { ImapGateway } from "./gateways/imap-gateway.js";
export { SmtpGateway } from "./gateways/smtp-gateway.js";
export { SubprocessGateway } from "./gateways/subprocess-gateway.js";
// Shared utilities
export { htmlToText } from "./html-to-text.js";
export {
  connect,
  filterScanMailboxes,
  filterSearchMailboxes,
  forEachAccount,
  listMailboxes,
  scanForReceipts,
} from "./imap-client.js";
export {
  cleanVendorForFilename,
  extractAmount,
  extractForwardedSender,
  extractInvoiceNumber,
  extractMetadata,
  extractService,
  extractTax,
  formatDate,
  inferCurrency,
  isCanadianMerchant,
  isValidInvoiceNumber,
  sanitizeFilename,
  titleCase,
  vendorFromDomain,
} from "./receipt-extraction.js";
export { BILLING_SENDER_PATTERNS, RECEIPT_SUBJECT_EXCLUSIONS, RECEIPT_SUBJECT_TERMS } from "./receipt-terms.js";
// Reply
export { buildEditorTemplate, buildReplyBody, buildReplyHeaders, parseEditorContent } from "./reply.js";
export { aggregateBySender, scanAllAccounts } from "./scanner.js";
// Pure business logic
export { BIZ_FOLDER, classifyMessage, PERSONAL_FOLDER, planMoves } from "./sort-logic.js";
export { sortReceipts } from "./sorter.js";
