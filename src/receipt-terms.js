/**
 * Single source of truth for receipt-matching constants.
 *
 * Both the `scan` command (via imap-client.js) and the `download` command
 * (via download-receipts.js) use these constants to identify receipt emails.
 * Keeping them here prevents the two commands from silently diverging on what
 * constitutes a receipt.
 */

/**
 * Subject keywords indicating receipt/invoice emails.
 * Merged from the 14-term list used by scan and the 6-term list used by
 * download; the union is the correct canonical set.
 */
export const RECEIPT_SUBJECT_TERMS = [
  "receipt",
  "order confirmation",
  "payment confirmation",
  "your order",
  "invoice",
  "purchase confirmation",
  "billing statement",
  "transaction",
  "payment received",
  "subscription confirmation",
  "renewal confirmation",
  "thank you for your purchase",
  "your payment",
  "order shipped",
  "payment processed",
  "subscription",
];

/**
 * Regex patterns for subjects that match receipt terms but aren't actual
 * invoices (e.g. upcoming-payment reminders, trial notices, credit grants).
 */
export const RECEIPT_SUBJECT_EXCLUSIONS = [
  /\bapproaching\b/i,
  /\breminder\b/i,
  /\byour credits?\b/i,
  /\bpre-order\b/i,
  /\btrial\b.*\bconvert\b/i,
  /\bsent\b.*\bin error\b/i,
  /\bfree trial\b/i,
  /\bwill\s+(be\s+)?charg/i,
  /\bpayment date\b.*\bapproaching\b/i,
  /\bwelcome to\b/i,
  /\bget started\b/i,
  /\byou.ve got \d+ credits?\b/i,
];

/**
 * Sender address patterns indicating billing/payment emails (substring match
 * against the From address).
 */
export const BILLING_SENDER_PATTERNS = [
  "stripe.com",
  "paddle.com",
  "billing@",
  "invoice@",
  "noreply@orders.",
];
