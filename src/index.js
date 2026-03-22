// Public API
export { connect, scanForReceipts, listMailboxes, filterScanMailboxes, filterSearchMailboxes, forEachAccount } from "./imap-client.js";
export { loadAccounts, discoverAccountsFromEnv } from "./accounts.js";
export { loadConfig, getConfigAccounts } from "./config.js";
export { scanAllAccounts, aggregateBySender } from "./scanner.js";
export { sortReceipts } from "./sorter.js";
export { downloadReceipts, vendorName, buildFilename, getVendorNames } from "./downloader.js";
export { downloadReceiptEmails } from "./download-receipts.js";

// Shared utilities
export { htmlToText } from "./html-to-text.js";
export { sanitizeString, headerValueToString, collectValues } from "./cli-helpers.js";

// Pure business logic
export { classifyMessage, planMoves, BIZ_FOLDER, PERSONAL_FOLDER } from "./sort-logic.js";
export { RECEIPT_SUBJECT_TERMS, RECEIPT_SUBJECT_EXCLUSIONS, BILLING_SENDER_PATTERNS } from "./receipt-terms.js";
export {
  titleCase, sanitizeFilename, vendorFromDomain, cleanVendorForFilename,
  extractForwardedSender, formatDate, inferCurrency, isCanadianMerchant,
  isValidInvoiceNumber, extractInvoiceNumber, extractAmount, extractTax,
  extractService, extractMetadata,
} from "./receipt-extraction.js";

// Reply
export { buildReplyHeaders, buildReplyBody, buildEditorTemplate, parseEditorContent } from "./reply.js";

// Gateways
export { ImapGateway } from "./gateways/imap-gateway.js";
export { SmtpGateway } from "./gateways/smtp-gateway.js";
export { FileSystemGateway } from "./gateways/fs-gateway.js";
export { SubprocessGateway } from "./gateways/subprocess-gateway.js";
