/**
 * Composition root: assembles vendor-name derivation and scalar field extractors
 * into the canonical `mailctl.receipt.v1` metadata object.
 * No I/O, no side effects — all inputs are plain values, outputs are plain objects.
 */

import {
  extractAmount,
  extractInvoiceNumber,
  extractService,
  extractTax,
  formatDate,
  isCanadianMerchant,
} from "./receipt-fields.js";
import { cleanVendorForFilename } from "./receipt-vendor-name.js";

export {
  extractAmount,
  extractInvoiceNumber,
  extractService,
  extractTax,
  formatDate,
  inferCurrency,
  isCanadianMerchant,
  isValidInvoiceNumber,
  MAX_SERVICE_LENGTH,
  MIN_INVOICE_CODE_LENGTH,
  MIN_INVOICE_DIGITS,
  MIN_SERVICE_LENGTH,
} from "./receipt-fields.js";
export {
  cleanVendorForFilename,
  DOMAIN_STRIP_PREFIXES,
  extractForwardedSender,
  extractVendorFromContent,
  FORWARDED_MARKERS,
  FORWARDED_SCAN_WINDOW,
  GENERIC_SENDER_PREFIXES,
  MAX_VENDOR_NAME_LENGTH,
  MIN_VENDOR_NAME_LENGTH,
  sanitizeFilename,
  titleCase,
  vendorFromDomain,
} from "./receipt-vendor-name.js";

/**
 * @param {string} bodyText
 * @param {string} subject
 * @param {string} fromAddress
 * @param {string} fromName
 * @param {Date} emailDate
 * @returns {object}
 */
export function extractMetadata(bodyText, subject, fromAddress, fromName, emailDate) {
  const invoiceNumber = extractInvoiceNumber(subject, bodyText);
  const amountInfo = extractAmount(bodyText);
  const tax = extractTax(bodyText);
  const service = extractService(bodyText);
  const dateStr = formatDate(emailDate);

  const vendor = cleanVendorForFilename(fromAddress, fromName, bodyText, subject);

  let currency = amountInfo?.currency ?? null;
  if (tax && /^(HST|GST|PST|QST)$/.test(tax.type)) {
    currency = "CAD";
  } else if (currency && isCanadianMerchant(fromAddress, bodyText)) {
    currency = "CAD";
  }

  // Validate tax: must be less than total amount
  let validatedTax = tax;
  if (tax && amountInfo) {
    const subtotal = amountInfo.amount - tax.amount;
    if (tax.amount >= subtotal) {
      validatedTax = null;
    }
  }

  return {
    schema: "mailctl.receipt.v1",
    vendor,
    service: service || null,
    amount: amountInfo?.amount ?? null,
    currency,
    tax: validatedTax || null,
    date: dateStr,
    invoice_number: invoiceNumber || null,
    source_email: fromAddress,
    source_account: null,
    email_uid: null,
    receipt_file: null,
  };
}
