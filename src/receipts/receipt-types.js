/**
 * Shared JSDoc typedefs for the receipt processing cluster.
 * Import in consuming files with, for example:
 *   typedef {import('./receipt-types.js').ReceiptMetadata} ReceiptMetadata
 * (omit the at-sign prefix; this comment avoids being parsed by tsc)
 */

export {};

/**
 * Structured metadata extracted from a receipt email or PDF.
 * Returned by extractMetadataWithLLM / extractMetadata.
 * All fields are optional to allow test fixtures to supply only the relevant subset,
 * but the extraction functions always return every field (some as null).
 * Fields source_account, email_uid, receipt_file, and source_body_snippet
 * start as null and are stamped downstream by processReceiptMessage.
 *
 * @typedef {object} ReceiptMetadata
 * @property {string} [schema] - schema identifier, e.g. "mailctl.receipt.v1"
 * @property {string} [vendor] - vendor display name (cleaned of legal suffixes)
 * @property {string|null} [service] - specific product, plan, or item description
 * @property {number|null} [amount] - pre-tax subtotal amount
 * @property {string|null} [currency] - ISO 4217 currency code (e.g. "USD", "CAD")
 * @property {{ amount: number, type: string|null }|null} [tax] - tax details, or null if no tax
 * @property {string|null} [date] - billing date in YYYY-MM-DD format
 * @property {string|null} [invoice_number] - invoice/receipt/order reference number
 * @property {boolean|null} [is_invoice] - true when this is a completed monetary transaction
 * @property {number|null} [confidence] - LLM confidence 0–1; null for regex-extracted records
 * @property {string} [source_email] - sender email address
 * @property {string|null} [source_account] - account name (stamped by processReceiptMessage)
 * @property {number|null} [email_uid] - IMAP UID (stamped by processReceiptMessage)
 * @property {string|null} [receipt_file] - PDF filename as stored on disk (stamped at write time)
 * @property {string|null} [source_body_snippet] - truncated plain-text body (stamped by processReceiptMessage)
 */

/**
 * On-disk sidecar (.json) read from the output directory.
 * A superset of ReceiptMetadata with provenance fields added at download/reprocess time.
 * All fields are optional because sidecars may be written by older tool versions.
 *
 * @typedef {object} ReceiptSidecar
 * @property {string} [schema]
 * @property {string} [vendor]
 * @property {string|null} [service]
 * @property {number|null} [amount]
 * @property {string|null} [currency]
 * @property {{ amount: number, type: string|null }|null} [tax]
 * @property {string|null} [date]
 * @property {string|null} [invoice_number]
 * @property {boolean|null} [is_invoice]
 * @property {number|null} [confidence]
 * @property {string} [source_email]
 * @property {string|null} [source_account]
 * @property {number|null} [email_uid]
 * @property {string|null} [receipt_file]
 * @property {string|null} [source_body_snippet]
 * @property {string|null} [downloadedAt] - ISO timestamp when first downloaded
 * @property {string} [reprocessedAt] - ISO timestamp of most recent LLM reprocess
 * @property {string} [subject] - email subject preserved for reprocessing
 */

/**
 * Per-run counters for downloadReceiptEmails.
 * timedOut and searchFailures are optional for backwards-compat with test fixtures.
 *
 * @typedef {object} ReceiptStats
 * @property {number} found - messages discovered by IMAP search
 * @property {number} downloaded - PDFs or sidecars successfully written
 * @property {number} noPdf - messages processed with no PDF attachment
 * @property {number} skipped - messages skipped by classification (non-invoice, low-confidence)
 * @property {number} skippedEmpty - messages skipped because extraction produced no bookkeeping data
 * @property {number} alreadyHave - duplicate PDFs skipped by content-hash match
 * @property {number} errors - messages that failed with an error
 * @property {number} [timedOut] - messages that exceeded the per-message timeout
 * @property {number} [searchFailures] - IMAP search errors
 */

/**
 * A PDF attachment from a parsed email (subset of mailparser Attachment).
 *
 * @typedef {object} ReceiptPdfAttachment
 * @property {Buffer} content - raw PDF bytes
 * @property {string} [filename] - attachment filename, if present
 * @property {string} [contentType] - MIME content type
 */

/**
 * Receipt search result envelope — one message returned from the IMAP search pipeline.
 * uid, subject, mailbox, and date are optional because some functions only use fromAddress/fromName.
 *
 * @typedef {object} ReceiptMessageEnvelope
 * @property {number} [uid] - IMAP message UID
 * @property {string} fromAddress - sender email address
 * @property {string} fromName - sender display name
 * @property {string} [subject] - email subject line
 * @property {Date} [date] - email envelope date
 * @property {string} [mailbox] - IMAP mailbox path
 */

/**
 * Manifest record written to the download manifest JSON.
 *
 * @typedef {object} ManifestRecord
 * @property {'no-pdf'|'duplicate'|'downloaded'} status
 * @property {string} [filename] - output filename (status: 'downloaded' only)
 * @property {string} [hash] - SHA-256 hex prefix (status: 'duplicate'|'downloaded')
 * @property {Date|string} [date] - email date
 * @property {string} [vendor] - vendor name
 */

/**
 * Mutable state threaded through a download run.
 *
 * @typedef {object} ReceiptRunState
 * @property {ReceiptStats} stats - running counters
 * @property {ReceiptMetadata[]} records - successfully processed metadata records
 * @property {number} processedCount - total messages attempted so far
 * @property {boolean} stopped - true when a --max or --budget limit was hit
 */

/**
 * Context object passed to processReceiptMessage.
 *
 * @typedef {object} ReceiptProcessContext
 * @property {string} accountName
 * @property {string} outputDir
 * @property {boolean} dryRun
 * @property {boolean} [includeEmpty]
 * @property {{ broker: any }|null} llm
 * @property {Set<string>} existingInvoiceNumbers
 * @property {Set<string>} existingHashes
 * @property {Set<string>} usedPaths
 * @property {import('../gateways/fs-gateway.js').FileSystemGateway} fs
 * @property {import('../gateways/subprocess-gateway.js').SubprocessGateway} subprocess
 * @property {function(object): void} [onProgress]
 */

/**
 * Cohesive write-side collaborator: all I/O and dedup state for a download run.
 *
 * @typedef {object} ReceiptWriteContext
 * @property {string} outputDir
 * @property {boolean} dryRun
 * @property {boolean} includeEmpty
 * @property {Set<string>} existingInvoiceNumbers
 * @property {Set<string>} existingHashes
 * @property {Set<string>} usedPaths
 * @property {import('../gateways/fs-gateway.js').FileSystemGateway} fs
 * @property {import('../gateways/subprocess-gateway.js').SubprocessGateway} subprocess
 */

/**
 * Time and count limits for a download run.
 *
 * @typedef {object} ReceiptRunLimits
 * @property {number} startedAt - performance.now() timestamp at run start
 * @property {number|null} maxMessages - stop after this many messages (null = unlimited)
 * @property {number|null} budgetMs - overall wall-clock budget in ms (null = unlimited)
 * @property {number} perMessageTimeoutMs - per-message timeout in ms
 */

/**
 * Everything needed to execute one download run.
 *
 * @typedef {object} ReceiptRun
 * @property {ReceiptWriteContext} writeContext
 * @property {ReceiptRunLimits} limits
 * @property {{ broker: any }|null} llm
 * @property {ReceiptRunState} runState
 * @property {string|null} vendorFilter
 * @property {function} processMessage
 * @property {function(object): void} onProgress
 */
