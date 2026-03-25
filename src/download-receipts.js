import {
  listMailboxes as _listMailboxes,
  forEachAccount as _forEachAccount,
} from "./imap-client.js";
import { searchAccountForReceipts } from "./receipt-search-pipeline.js";
import { applyReceiptFilters } from "./receipt-filters.js";
import { groupByMailbox, forEachMailboxGroup } from "./imap-orchestration.js";
import { loadAccounts as _loadAccounts } from "./accounts.js";
import { join, resolve } from "path";
import { createHash } from "crypto";
import { simpleParser } from "mailparser";
import { OpenAIGateway, LlmBroker, Message, isOk } from "mojentic";
import { htmlToText } from "./html-to-text.js";
import {
  sanitizeFilename,
  cleanVendorForFilename,
  formatDate,
  extractMetadata,
} from "./receipt-extraction.js";
import { matchesVendor } from "./vendor-map.js";
import { FileSystemGateway } from "./gateways/fs-gateway.js";
import { SubprocessGateway } from "./gateways/subprocess-gateway.js";
import {
  RECEIPT_SUBJECT_TERMS,
  RECEIPT_SUBJECT_EXCLUSIONS,
  BILLING_SENDER_PATTERNS,
} from "./receipt-terms.js";

export { RECEIPT_SUBJECT_EXCLUSIONS } from "./receipt-terms.js";


/** JSON schema for LLM-based receipt data extraction. */
export const RECEIPT_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    vendor: {
      type: "string",
      description: "The company or merchant that charged the payment. Use their common brand name, cleaned of legal suffixes (Inc, LLC, Ltd, Corp, PBC). Examples: 'Apple', 'GitHub', 'Costco', 'Anthropic', 'Zoom', 'JetBrains'. For payment processors like Paddle or PayPal, use the ACTUAL product vendor if identifiable (e.g. Paddle billing for Tidewave → 'Tidewave'), otherwise use the processor name. For forwarded invoices from individuals, use the business/practice name if present, otherwise the person's full name."
    },
    service: {
      type: ["string", "null"],
      description: "The specific product, subscription, plan, or item(s) being paid for. Be as specific as possible using the actual product/plan name from the receipt. Examples: 'ChatGPT Plus', 'Zoom Workplace Pro', 'GitHub Copilot Business', 'iCloud+ 200GB', 'Apple Music Family', 'Suno Pro', 'JetBrains All Products Pack', 'Microsoft 365 Business Standard', 'Apple Pencil Pro for iPad'. For Apple receipts listing multiple subscriptions, join ALL subscription names with commas (e.g. 'Paramount+, Apple Music Family, iCloud+ 200GB'). For retail purchases with line items, list the items. NEVER use generic labels like 'Subtotal', 'Total', 'Subscription', 'Payment', or 'Invoice'. If you truly cannot identify the product name, return null."
    },
    amount: {
      type: ["number", "null"],
      description: "The subtotal amount BEFORE tax as a number. If the receipt shows a subtotal and tax separately, use the subtotal. If only a grand total is shown with no tax breakdown, use that total. If multiple line items exist, use the overall subtotal/total before tax. ALWAYS extract this — a receipt without an amount is almost useless. Look for dollar amounts near words like 'Total', 'Subtotal', 'Amount Due', 'Amount Charged', 'Price'. Return null ONLY if no monetary amount appears anywhere in the content."
    },
    currency: {
      type: ["string", "null"],
      description: "3-letter ISO currency code (USD, CAD, EUR, GBP, etc.). Determining currency requires judgment: (1) Look for EXPLICIT indicators first: 'US$', 'CA$', 'USD', 'CAD', 'C$' in the receipt. (2) If Canadian sales tax appears (HST, GST, PST, QST) the charge is in CAD. (3) Consider the vendor's billing country: US-headquartered SaaS companies (GitHub, Anthropic, OpenAI, Zoom, Suno, AWS, Lyft, Netflix) typically bill in USD. Canadian companies (Bell, Costco, Canadian Tire, Shoppers Drug Mart, Best Buy Canada) bill in CAD. (4) Payment processors like Paddle may bill in either currency — check the invoice details. (5) If the receipt shows '$' with no country qualifier and no tax info, lean toward the vendor's home currency. ALWAYS provide your best assessment — null only if completely ambiguous."
    },
    tax_amount: {
      type: ["number", "null"],
      description: "The tax as a DOLLAR AMOUNT (not a percentage). If the receipt says 'HST: $1.56', return 1.56. If tax is shown ONLY as a percentage (e.g. '13%') with no dollar figure, calculate it: subtotal × rate (e.g. $11.99 × 0.13 = 1.56). If multiple tax lines exist (e.g. GST + PST), sum them. Return null if no tax information appears."
    },
    tax_type: {
      type: ["string", "null"],
      description: "The type of tax charged: HST, GST, PST, QST, VAT, Sales Tax. If multiple taxes (e.g. GST + PST), combine as 'GST+PST'. Return null if no tax type is specified."
    },
    date: {
      type: ["string", "null"],
      description: "The billing, invoice, or transaction date in YYYY-MM-DD format. Prefer the date the charge was made (Invoice Date, Billing Date, Transaction Date, Payment Date) over the email send date. If the receipt shows a billing period, use the start date. Return null only if no date appears in the content."
    },
    invoice_number: {
      type: ["string", "null"],
      description: "The invoice number, receipt number, order number, or transaction reference. Use the most specific identifier available. Examples: 'INV-2024-0042', 'MNJ104XT91', '1669669', 'DLAENQQZ0009'. Do NOT include long base64 strings, URLs, or tracking numbers. Must be filesystem-safe (no slashes, backslashes, or special characters beyond hyphens and dots). Return null if no clear identifier exists."
    },
    is_invoice: {
      type: "boolean",
      description: "Is this email an actual invoice, receipt, or payment confirmation that records a completed monetary transaction? Return true for: invoices, receipts, payment confirmations, billing statements, renewal charges. Return false for: payment reminders ('we will charge you on...'), credit-based orders with no dollar amount, trial conversion notices, subscription welcome emails, shipping notifications without prices, account notifications, marketing emails, pricing change announcements, or apology/correction emails. When in doubt, return false."
    },
    confidence: {
      type: "number",
      description: "Your confidence that this is a real invoice/receipt with accurate extracted data, from 0.0 (no confidence) to 1.0 (certain). Score 0.9+ when you see a clear invoice with amount, date, and vendor. Score 0.5-0.8 when some fields are ambiguous or missing. Score below 0.5 when the email doesn't appear to be an actual invoice/receipt."
    },
  },
  required: ["vendor", "is_invoice", "confidence"],
};

const LLM_SYSTEM_PROMPT = `You extract structured data from receipts, invoices, and payment confirmations. Your input is either an email body or a PDF converted to markdown.

You are processing receipts for a Canadian customer. Most purchases are in CAD (Canadian dollars) or USD. The customer subscribes to many SaaS services, buys retail goods, and receives therapy invoices.

Key situations you will encounter:
- APPLE RECEIPTS: Apple sends HTML emails listing subscription renewals. Each email may contain MULTIPLE subscriptions — extract ALL of their names. The amounts shown are typically pre-tax with HST added separately.
- PDF INVOICES: Some emails just say "your invoice is attached" — the real data is in the converted PDF markdown you receive. Extract amounts, dates, and line items from the PDF content.
- PAYMENT PROCESSORS: Paddle, PayPal, Stripe act as intermediaries. Look for the actual product/vendor name in the receipt body rather than using the processor as the vendor.
- THERAPY/PROFESSIONAL INVOICES: Individual practitioners (therapists, consultants) send invoices. Use their business/practice name as vendor.
- RETAIL RECEIPTS: Costco, Canadian Tire, Best Buy — these show line items. List the items purchased as the service field.
- SaaS SUBSCRIPTIONS: GitHub, Anthropic, OpenAI, Zoom, Suno, JetBrains — always extract the specific plan name (e.g. "Copilot Business" not just "GitHub").

CLASSIFICATION: Before extracting data, determine if this email is an actual invoice/receipt for a completed monetary transaction. Many emails from billing senders are NOT invoices — they're reminders, notifications, credit orders, or marketing. If in doubt, mark is_invoice as false. Examples of NON-invoices:
- "Payment date for your subscription is approaching" (reminder, not a charge)
- "Thanks, your order is complete" with "An Audible credit has been applied" (credit order, no money changed hands)
- "Your free trial will convert to a paid subscription on..." (notice, not a charge)
- "We're following up about the pricing update email you received... That message was sent to you in error" (correction email)
- "Your Power Automate Premium trial will convert" with "$0.00" (zero-dollar trial notice)

Be thorough — extract EVERY field you can. A receipt with a null amount is nearly useless. Look harder.`;

/**
 * Try to create an LLM broker for receipt extraction.
 * Returns null if OPENAI_API_KEY is not set.
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {{ broker: LlmBroker, gateway: OpenAIGateway }|null}
 */
function createLlmBroker(onProgress = () => {}) {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const gateway = new OpenAIGateway();
    const broker = new LlmBroker("gpt-5-mini", gateway);
    return { broker, gateway };
  } catch (err) {
    onProgress({ type: "llm-not-configured", error: err });
    return null;
  }
}

/**
 * Extract receipt metadata using LLM structured output.
 * @param {LlmBroker} broker
 * @param {string} bodyText - email body text
 * @param {string} subject - email subject
 * @param {string} fromAddress - sender email address
 * @param {string} fromName - sender display name
 * @param {Date} emailDate - email envelope date
 * @returns {Promise<object|null>} Extracted metadata or null on failure
 */
async function extractMetadataWithLLM(broker, bodyText, subject, fromAddress, fromName, emailDate) {
  // Truncate body to avoid exceeding token limits — first 4000 chars is plenty for receipts
  const truncatedBody = bodyText.length > 4000 ? bodyText.slice(0, 4000) : bodyText;

  const userContent = `From: ${fromName} <${fromAddress}>
Subject: ${subject}
Date: ${emailDate instanceof Date ? emailDate.toISOString() : emailDate}

${truncatedBody}`;

  const messages = [
    Message.system(LLM_SYSTEM_PROMPT),
    Message.user(userContent),
  ];

  const result = await broker.generateObject(messages, RECEIPT_EXTRACTION_SCHEMA);

  if (!isOk(result)) return null;

  const data = /** @type {Record<string, any>} */ (result.value);

  // Build tax object if LLM returned tax fields
  let tax = null;
  if (data.tax_amount && data.tax_amount > 0) {
    tax = { amount: data.tax_amount, type: (data.tax_type || "").toUpperCase() || null };
  }

  // Use LLM-extracted date, falling back to email envelope date
  const dateStr = data.date || formatDate(emailDate);

  // Use LLM vendor for metadata, but cleanVendorForFilename is still used for filenames
  const vendor = data.vendor
    ? sanitizeFilename(data.vendor.replace(/,?\s*\b(Inc\.?|LLC|Ltd\.?|Corp\.?|PBC|Limited|Co\.?)\b\.?\s*/gi, "").trim()) || cleanVendorForFilename(fromAddress, fromName, bodyText, subject)
    : cleanVendorForFilename(fromAddress, fromName, bodyText, subject);

  return {
    schema: "mailctl.receipt.v1",
    vendor,
    service: data.service || null,
    amount: typeof data.amount === "number" ? data.amount : null,
    currency: data.currency ? data.currency.toUpperCase() : null,
    tax,
    date: dateStr,
    invoice_number: data.invoice_number || null,
    is_invoice: data.is_invoice ?? null,
    confidence: typeof data.confidence === "number" ? data.confidence : null,
    source_email: fromAddress,
    source_account: null,
    email_uid: null,
    receipt_file: null,
  };
}

/**
 * Use docling to convert a PDF to markdown for metadata extraction.
 * @param {string} pdfPath
 * @param {FileSystemGateway} fs
 * @param {SubprocessGateway} subprocess
 * @returns {string|null}
 */
export function pdfToText(pdfPath, fs, subprocess) {
  const doclingPath = join(process.env.HOME, ".local/bin/docling");
  if (!fs.exists(doclingPath)) return null;

  const tmpDir = join(process.env.TMPDIR || "/tmp", `mailctl-docling-${Date.now()}`);
  try {
    fs.mkdir(tmpDir);
    subprocess.execFileSync(doclingPath, [pdfPath, "--to", "md", "--image-export-mode", "placeholder", "--output", tmpDir], {
      timeout: 60000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const files = fs.readdir(tmpDir);
    const mdFile = files.find((f) => f.endsWith(".md"));
    if (mdFile) {
      return fs.readText(join(tmpDir, mdFile)).trim();
    }
    return null;
  } catch {
    return null;
  } finally {
    try { fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Search a single mailbox for receipt/invoice emails.
 * Returns envelope-level results.
 * @param {any} client - connected IMAP client (accepts duck-typed mocks in tests)
 * @param {string} accountName
 * @param {string} mailboxPath
 * @param {Date} since
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<Array>}
 */
export async function searchMailboxForReceipts(client, accountName, mailboxPath, since, onProgress = () => {}) {
  let lock;
  try {
    lock = await client.getMailboxLock(mailboxPath);
  } catch {
    return [];
  }

  try {
    const messageCount = client.mailbox && client.mailbox.exists;
    onProgress({ type: "mailbox-search-start", mailbox: mailboxPath, messageCount });
    const allUids = new Set();

    // Subject-based search
    for (const term of RECEIPT_SUBJECT_TERMS) {
      const criteria = { subject: term };
      if (since) criteria.since = since;
      try {
        const uids = await client.search(criteria, { uid: true });
        if (uids) for (const uid of uids) allUids.add(uid);
      } catch {}
    }

    // Sender-based search
    for (const pattern of BILLING_SENDER_PATTERNS) {
      const criteria = { from: pattern };
      if (since) criteria.since = since;
      try {
        const uids = await client.search(criteria, { uid: true });
        if (uids) for (const uid of uids) allUids.add(uid);
      } catch {}
    }

    if (allUids.size === 0) return [];

    onProgress({ type: "mailbox-candidates", mailbox: mailboxPath, count: allUids.size });

    const results = [];
    const uidRange = [...allUids].join(",");
    try {
      for await (const msg of client.fetch(uidRange, {
        envelope: true, headers: ["message-id"], uid: true,
      }, { uid: true })) {
        const env = msg.envelope;
        const from = env.from?.[0];
        results.push({
          account: accountName,
          mailbox: mailboxPath,
          uid: msg.uid,
          messageId: env.messageId || "",
          date: env.date,
          fromAddress: from?.address?.toLowerCase() || "unknown",
          fromName: from?.name || "",
          subject: env.subject || "",
        });
      }
    } catch (err) {
      onProgress({ type: "mailbox-fetch-error", error: err });
    }

    return results;
  } finally {
    lock.release();
  }
}

/**
 * Walk the year/month output directory tree, invoking visitor for each file.
 * Encapsulates the <root>/<YYYY>/<MM>/<file> directory convention.
 * @param {string} outputDir
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} fs
 * @param {(filePath: string, fileName: string) => void} visitor
 */
export function walkOutputTree(outputDir, fs, visitor) {
  if (!fs.exists(outputDir)) return;

  try {
    for (const yearDir of fs.readdir(outputDir)) {
      if (!/^\d{4}$/.test(yearDir)) continue;
      const yearPath = join(outputDir, yearDir);
      try {
        for (const monthDir of fs.readdir(yearPath)) {
          const monthPath = join(yearPath, monthDir);
          try {
            for (const file of fs.readdir(monthPath)) {
              try {
                visitor(join(monthPath, file), file);
              } catch {}
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}
}

/**
 * Scan the output directory tree for existing receipt JSON files.
 * Returns a Set of invoice numbers that already have sidecars.
 * @param {string} outputDir
 * @param {FileSystemGateway} fs
 * @returns {Set<string>}
 */
export function loadExistingInvoiceNumbers(outputDir, fs) {
  const numbers = new Set();
  walkOutputTree(outputDir, fs, (filePath, fileName) => {
    if (!fileName.endsWith(".json")) return;
    const data = /** @type {any} */ (fs.readJson(filePath));
    if (data.invoice_number) numbers.add(data.invoice_number);
  });
  return numbers;
}

/**
 * Scan existing PDF files in the output tree for SHA-256 content hashes.
 * @param {string} outputDir
 * @param {FileSystemGateway} fs
 * @returns {Set<string>}
 */
export function loadExistingHashes(outputDir, fs) {
  const hashes = new Set();
  walkOutputTree(outputDir, fs, (filePath, fileName) => {
    if (!fileName.toLowerCase().endsWith(".pdf")) return;
    const buf = fs.readBuffer(filePath);
    hashes.add(createHash("sha256").update(buf).digest("hex"));
  });
  return hashes;
}

/**
 * Generate a unique base name for output files within a directory.
 * Appends _2, _3, etc. if name already used or files already exist on disk.
 * @param {string} dir
 * @param {string} base
 * @param {Set<string>} usedPaths - tracks names used in this run
 * @param {FileSystemGateway} fs
 * @returns {string}
 */
export function uniqueBaseName(dir, base, usedPaths, fs) {
  let name = base;
  let n = 1;
  const key = (suffix) => `${dir}/${suffix === 1 ? base : `${base}_${suffix}`}`.toLowerCase();

  while (
    usedPaths.has(key(n)) ||
    fs.exists(join(dir, `${name}.json`)) ||
    fs.exists(join(dir, `${name}.pdf`))
  ) {
    n++;
    name = `${base}_${n}`;
  }

  usedPaths.add(`${dir}/${name}`.toLowerCase());
  return name;
}

/**
 * Load and filter accounts for receipt operations.
 * @param {string|null} accountFilter - account name to filter to, or null for all
 * @param {() => Array<any>} loadAccountsFn - account loader function
 * @returns {Array<any>} filtered accounts
 */
function resolveReceiptAccounts(accountFilter, loadAccountsFn) {
  const accounts = loadAccountsFn();
  if (accounts.length === 0) {
    throw new Error("No email accounts configured. Check keychain credentials and bin/run wrapper.");
  }

  const targetAccounts = accountFilter
    ? accounts.filter((a) => a.name.toLowerCase() === accountFilter.toLowerCase())
    : accounts;

  if (targetAccounts.length === 0) {
    throw new Error(`Account "${accountFilter}" not found.`);
  }

  return targetAccounts;
}

/**
 * Extract receipt metadata from text content.
 * Tries LLM extraction first; falls back to regex pattern matching.
 * @param {{ broker: any }|null} llm
 * @param {string} extractionText
 * @param {string} subject
 * @param {string} fromAddress
 * @param {string} fromName
 * @param {Date} emailDate
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<object>} metadata object
 */
async function extractReceiptMetadata(llm, extractionText, subject, fromAddress, fromName, emailDate, onProgress = () => {}) {
  let metadata;
  if (llm) {
    try {
      metadata = await extractMetadataWithLLM(llm.broker, extractionText, subject, fromAddress, fromName, emailDate);
    } catch (err) {
      onProgress({ type: "llm-extraction-failed", error: err });
      metadata = null;
    }
  }
  if (!metadata) {
    metadata = extractMetadata(extractionText, subject, fromAddress, fromName, emailDate);
  }
  return metadata;
}

/**
 * Determine the text to use for metadata extraction.
 * If the email has PDF attachments, converts the first PDF to markdown via docling.
 * Otherwise returns the email body text.
 * @param {Array} pdfAttachments
 * @param {string} bodyText
 * @param {number} uid
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} fs
 * @param {import("./gateways/subprocess-gateway.js").SubprocessGateway} subprocess
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {string}
 */
function resolveExtractionText(pdfAttachments, bodyText, uid, fs, subprocess, onProgress = () => {}) {
  if (pdfAttachments.length === 0) return bodyText;

  const tmpPdfPath = join(process.env.TMPDIR || "/tmp", `mailctl-receipt-${Date.now()}.pdf`);
  try {
    fs.writeFile(tmpPdfPath, pdfAttachments[0].content);
    const pdfMarkdown = pdfToText(tmpPdfPath, fs, subprocess);
    if (pdfMarkdown) {
      onProgress({ type: "using-pdf-content", uid });
      return pdfMarkdown;
    }
  } catch (err) {
    onProgress({ type: "docling-failed", uid, error: err });
  } finally {
    try { fs.rm(tmpPdfPath, { force: true }); } catch {}
  }
  return bodyText;
}

/**
 * Write receipt output files (PDF + JSON sidecar) to the output directory.
 * @param {object} params
 * @param {object} params.metadata
 * @param {Array} params.pdfAttachments
 * @param {object} params.msg - envelope result
 * @param {string} params.bodyText
 * @param {object} params.parsed - parsed email
 * @param {Date} params.emailDate
 * @param {string} params.outputDir
 * @param {boolean} params.dryRun
 * @param {Set<string>} params.existingHashes
 * @param {Set<string>} params.usedPaths
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} params.fs
 * @param {function(object): void} [params.onProgress] - receives structured progress events
 * @returns {{ action: 'downloaded'|'noPdf'|'duplicate', metadata: object }}
 */
function writeReceiptOutput({ metadata, pdfAttachments, msg, bodyText, parsed, emailDate, outputDir, dryRun, existingHashes, usedPaths, fs, onProgress = () => {} }) {
  const d = emailDate instanceof Date ? emailDate : new Date(emailDate);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const monthDir = join(outputDir, yyyy, mm);

  const vendorClean = cleanVendorForFilename(msg.fromAddress, msg.fromName, bodyText, parsed.subject || msg.subject);
  let rawBase;
  if (metadata.invoice_number) {
    const safeInvoice = metadata.invoice_number.replace(/[\/\\:*?"<>|]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    rawBase = `${vendorClean}-${safeInvoice}`;
  } else {
    rawBase = `${vendorClean}-${metadata.date}`;
  }

  if (rawBase.length > 60) {
    rawBase = rawBase.slice(0, 60).replace(/[-_][^-_]*$/, "");
    rawBase = rawBase.replace(/[-._]+$/, "");
  }

  const baseName = uniqueBaseName(monthDir, rawBase, usedPaths, fs);

  if (pdfAttachments.length > 0) {
    const att = pdfAttachments[0];
    const contentHash = createHash("sha256").update(att.content).digest("hex");

    if (existingHashes.has(contentHash)) {
      const dupLabel = metadata.invoice_number
        ? `${vendorClean} ${metadata.invoice_number}`
        : `${vendorClean} (${metadata.date})`;
      onProgress({ type: "skip-duplicate", label: dupLabel });
      return { action: "duplicate", metadata };
    }

    const pdfFilename = `${baseName}.pdf`;
    const jsonFilename = `${baseName}.json`;
    const pdfPath = join(monthDir, pdfFilename);
    const jsonPath = join(monthDir, jsonFilename);

    metadata.receipt_file = pdfFilename;

    if (dryRun) {
      onProgress({ type: "dry-run-pdf", filename: pdfFilename });
      onProgress({ type: "dry-run-json", filename: jsonFilename });
    } else {
      fs.mkdir(monthDir);
      fs.writeFile(pdfPath, att.content);
      fs.writeFile(jsonPath, JSON.stringify(metadata, null, 2));
      onProgress({ type: "downloaded-pdf", filename: pdfFilename, size: att.content.length });
    }

    return { action: "downloaded", metadata };
  } else {
    metadata.receipt_file = null;
    const jsonFilename = `${baseName}.json`;
    const jsonPath = join(monthDir, jsonFilename);

    if (dryRun) {
      onProgress({ type: "dry-run-metadata", filename: jsonFilename });
    } else {
      fs.mkdir(monthDir);
      fs.writeFile(jsonPath, JSON.stringify(metadata, null, 2));
      onProgress({ type: "wrote-metadata", filename: jsonFilename });
    }

    return { action: "noPdf", metadata };
  }
}

/**
 * Process a single receipt email: download, parse, extract metadata,
 * check dedup, and write output files.
 * @param {object} client - connected IMAP client
 * @param {object} msg - envelope result with uid, from, subject, date, mailbox, accountName
 * @param {object} context
 * @param {string} context.accountName
 * @param {string} context.outputDir
 * @param {boolean} context.dryRun
 * @param {{ broker: any }|null} context.llm
 * @param {Set<string>} context.existingInvoiceNumbers
 * @param {Set<string>} context.existingHashes
 * @param {Set<string>} context.usedPaths
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} context.fs
 * @param {import("./gateways/subprocess-gateway.js").SubprocessGateway} context.subprocess
 * @param {function(object): void} [context.onProgress] - receives structured progress events
 * @returns {Promise<{ action: 'downloaded'|'noPdf'|'skipped'|'duplicate'|'error', metadata?: object }>}
 */
async function processReceiptMessage(client, msg, context) {
  const { accountName, outputDir, dryRun, llm, existingInvoiceNumbers, existingHashes, usedPaths, fs, subprocess, onProgress = () => {} } = context;

  try {
    // Download and parse the full message
    const raw = await client.download(String(msg.uid), undefined, { uid: true });
    const chunks = [];
    for await (const chunk of raw.content) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    const parsed = await simpleParser(buf);

    const bodyText = parsed.text || (parsed.html ? htmlToText(parsed.html) : "");
    const emailDate = parsed.date || msg.date || new Date();

    // Find PDF attachments early — needed to decide extraction source
    const pdfAttachments = (parsed.attachments || []).filter(
      (a) => a.contentType === "application/pdf" ||
        (a.filename && a.filename.toLowerCase().endsWith(".pdf"))
    );

    const extractionText = resolveExtractionText(pdfAttachments, bodyText, msg.uid, fs, subprocess, onProgress);
    const metadata = await extractReceiptMetadata(llm, extractionText, parsed.subject || msg.subject, msg.fromAddress, msg.fromName, emailDate, onProgress);

    metadata.source_account = accountName.toLowerCase();
    metadata.email_uid = msg.uid;
    metadata.source_body_snippet = bodyText.length > 2000 ? bodyText.slice(0, 2000) : bodyText;

    // Check LLM classification — skip non-invoices
    if (metadata.is_invoice === false) {
      onProgress({ type: "skip-non-invoice", vendor: metadata.vendor, confidence: metadata.confidence || 0 });
      return { action: "skipped" };
    }
    if (metadata.confidence !== null && metadata.confidence < 0.4) {
      onProgress({ type: "skip-low-confidence", vendor: metadata.vendor, confidence: metadata.confidence });
      return { action: "skipped" };
    }

    // Invoice number dedup
    if (metadata.invoice_number && existingInvoiceNumbers.has(metadata.invoice_number)) {
      onProgress({ type: "skip-existing-invoice", vendor: metadata.vendor, invoiceNumber: metadata.invoice_number });
      return { action: "duplicate" };
    }

    const result = writeReceiptOutput({ metadata, pdfAttachments, msg, bodyText, parsed, emailDate, outputDir, dryRun, existingHashes, usedPaths, fs, onProgress });

    if (result.action === "downloaded" && metadata.invoice_number) {
      existingInvoiceNumbers.add(metadata.invoice_number);
    }
    if (result.action === "downloaded" && pdfAttachments.length > 0) {
      const contentHash = createHash("sha256").update(pdfAttachments[0].content).digest("hex");
      existingHashes.add(contentHash);
    }

    return result;
  } catch (err) {
    onProgress({ type: "process-error", uid: msg.uid, error: err });
    return { action: "error" };
  }
}


/** Singleton gateway instances used in production. */
const _defaultFs = new FileSystemGateway();
const _defaultSubprocess = new SubprocessGateway();

/**
 * Default production gateways. Tests override individual keys.
 */
const defaultGateways = {
  fs:               _defaultFs,
  subprocess:       _defaultSubprocess,
  loadAccounts:     _loadAccounts,
  forEachAccount:   _forEachAccount,
  listMailboxes:    _listMailboxes,
  createLlmBroker,
};

/**
 * Download receipt PDFs and create JSON sidecar metadata files.
 * @param {object} [opts]
 * @param {string}  [opts.outputDir="."] - root output directory
 * @param {number}  [opts.months=12] - how far back to search
 * @param {string}  [opts.since] - search from this date instead of months
 * @param {string}  [opts.account] - only search this account
 * @param {string}  [opts.vendor] - filter to a specific vendor (substring match)
 * @param {boolean} [opts.dryRun=false] - show what would be done
 * @param {object} [gateways] - injectable implementations for testing
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ stats: object, records: Array }>}
 */
export async function downloadReceiptEmails(opts = {}, gateways = {}, onProgress = () => {}) {
  const {
    fs,
    subprocess,
    loadAccounts,
    forEachAccount,
    listMailboxes,
    createLlmBroker: _createLlmBroker,
  } = { ...defaultGateways, ...gateways };

  const dryRun = opts.dryRun ?? false;
  const months = opts.months ?? 12;
  const outputDir = resolve(opts.outputDir || ".");
  const accountFilter = opts.account || null;

  const since = opts.since
    ? new Date(opts.since)
    : (() => { const d = new Date(); d.setMonth(d.getMonth() - months); return d; })();

  const targetAccounts = resolveReceiptAccounts(accountFilter, loadAccounts);

  const existingInvoiceNumbers = loadExistingInvoiceNumbers(outputDir, fs);
  const existingHashes = loadExistingHashes(outputDir, fs);
  const usedPaths = new Set();

  const stats = { found: 0, downloaded: 0, noPdf: 0, skipped: 0, alreadyHave: 0, errors: 0 };
  const records = [];

  // Initialize LLM broker for receipt data extraction (null if OPENAI_API_KEY not set)
  const llm = _createLlmBroker(onProgress);
  if (llm) {
    onProgress({ type: "llm-enabled" });
  } else {
    onProgress({ type: "llm-disabled" });
  }

  await forEachAccount(targetAccounts, async (client, account) => {
    onProgress({ type: "search-account", name: account.name, user: account.user });

    // Phase 1: discover receipt emails across all mailboxes
    const searchResults = await searchAccountForReceipts(client, account, since, { listMailboxes, searchMailboxForReceipts: (client, accountName, mbPath, since) => searchMailboxForReceipts(client, accountName, mbPath, since, onProgress) });
    const { filtered: unique, vendorExcluded, subjectExcluded } = applyReceiptFilters(
      searchResults, opts, matchesVendor, RECEIPT_SUBJECT_EXCLUSIONS
    );

    if (vendorExcluded > 0) {
      onProgress({ type: "vendor-filter-applied", matchCount: unique.length, excludedCount: vendorExcluded });
    }
    if (subjectExcluded > 0) {
      onProgress({ type: "subject-exclusions", count: subjectExcluded });
    }
    onProgress({ type: "unique-receipts", count: unique.length });
    stats.found += unique.length;

    // Phase 2: process each email (grouped by mailbox for IMAP efficiency)
    const byMailbox = groupByMailbox(unique);
    await forEachMailboxGroup(client, byMailbox, async (_mailbox, messages) => {
      for (const msg of messages) {
        const context = { accountName: account.name, outputDir, dryRun, llm, existingInvoiceNumbers, existingHashes, usedPaths, fs, subprocess, onProgress };
        const { action, metadata } = await processReceiptMessage(client, msg, context);
        if (action === "downloaded") { stats.downloaded++; records.push(/** @type {object} */ (metadata)); }
        else if (action === "noPdf")   { stats.noPdf++; records.push(/** @type {object} */ (metadata)); }
        else if (action === "skipped") { stats.skipped++; }
        else if (action === "duplicate") { stats.alreadyHave++; }
        else if (action === "error") { stats.errors++; }
      }
    });
  });

  onProgress({ type: "download-summary", stats });

  return { stats, records };
}

/**
 * List vendors found in receipt emails across accounts.
 * Returns an array of { vendor, count } sorted by count descending.
 * @param {object} [opts]
 * @param {number}  [opts.months=3] - how far back to search
 * @param {Date}    [opts.since] - search from this date instead of months
 * @param {string}  [opts.account] - only search this account
 * @param {object} [gateways] - injectable implementations for testing
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<Array<{ vendor: string, address: string, count: number }>>}
 */
export async function listReceiptVendors(opts = {}, gateways = {}, onProgress = () => {}) {
  const {
    loadAccounts,
    forEachAccount,
    listMailboxes,
  } = { ...defaultGateways, ...gateways };

  const months = opts.months ?? 3;
  const accountFilter = opts.account || null;

  const since = opts.since
    ? opts.since
    : (() => { const d = new Date(); d.setMonth(d.getMonth() - months); return d; })();

  const targetAccounts = resolveReceiptAccounts(accountFilter, loadAccounts);

  /** @type {Map<string, { vendor: string, address: string, count: number }>} */
  const vendorCounts = new Map();

  await forEachAccount(targetAccounts, async (client, account) => {
    onProgress({ type: "search-account", name: account.name, user: account.user });

    const unique = await searchAccountForReceipts(client, account, since, { listMailboxes, searchMailboxForReceipts: (client, accountName, mbPath, since) => searchMailboxForReceipts(client, accountName, mbPath, since, onProgress) });

    for (const msg of unique) {
      const key = msg.fromAddress;
      if (vendorCounts.has(key)) {
        vendorCounts.get(key).count++;
      } else {
        vendorCounts.set(key, {
          vendor: msg.fromName || msg.fromAddress,
          address: msg.fromAddress,
          count: 1,
        });
      }
    }
  });

  return [...vendorCounts.values()].sort((a, b) => b.count - a.count);
}

/**
 * Scan the output directory tree for existing .json sidecar files.
 * Returns an array of { jsonPath, sidecar } for each valid sidecar found.
 * @param {string} outputDir
 * @param {FileSystemGateway} fs
 * @returns {Array<{ jsonPath: string, sidecar: object }>}
 */
export function collectSidecarFiles(outputDir, fs) {
  const results = [];
  walkOutputTree(outputDir, fs, (filePath, fileName) => {
    if (!fileName.endsWith(".json")) return;
    const sidecar = /** @type {any} */ (fs.readJson(filePath));
    results.push({ jsonPath: filePath, sidecar });
  });
  return results;
}

/**
 * Reprocess existing receipt files — re-run LLM extraction on downloaded PDFs.
 * @param {object} opts
 * @param {string} opts.outputDir - directory containing receipts
 * @param {string} [opts.vendor] - filter to specific vendor
 * @param {Date} [opts.since] - only reprocess files newer than this date
 * @param {boolean} [opts.dryRun]
 * @param {object} [gateways] - injectable dependencies
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{reprocessed: number, skipped: number, errors: number, reclassified: number, results: Array}>}
 */
export async function reprocessReceipts(opts, gateways = {}, onProgress = () => {}) {
  const {
    fs,
    subprocess,
    createLlmBroker: _createLlmBroker,
  } = { ...defaultGateways, ...gateways };

  const outputDir = resolve(opts.outputDir || ".");
  const dryRun = opts.dryRun ?? false;
  const vendorFilter = opts.vendor || null;
  const sinceDate = opts.since || null;

  const llm = _createLlmBroker(onProgress);
  if (!llm) {
    throw new Error("OPENAI_API_KEY not set — LLM extraction is required for reprocessing.");
  }

  onProgress({ type: "reprocess-start", outputDir });

  const sidecars = collectSidecarFiles(outputDir, fs);
  const stats = { reprocessed: 0, skipped: 0, errors: 0, reclassified: 0 };
  const results = [];

  for (const { jsonPath, sidecar } of sidecars) {
    const baseName = jsonPath.replace(/\.json$/, "");
    const pdfPath = `${baseName}.pdf`;
    const jsonFilename = jsonPath.split("/").pop();

    // Filter by vendor
    if (vendorFilter && sidecar.vendor) {
      if (!sidecar.vendor.toLowerCase().includes(vendorFilter.toLowerCase())) {
        continue;
      }
    }

    // Filter by since date
    if (sinceDate && sidecar.date) {
      const sidecarDate = new Date(sidecar.date);
      if (!isNaN(sidecarDate.getTime()) && sidecarDate < sinceDate) {
        continue;
      }
    }

    // Check if a corresponding PDF exists
    const hasPdf = fs.exists(pdfPath);

    let extractionText = null;

    if (hasPdf) {
      if (dryRun) {
        onProgress({ type: "reprocess-dry-run", filename: jsonFilename });
        stats.reprocessed++;
        results.push({ file: jsonFilename, status: "dry-run" });
        continue;
      }
      const pdfMarkdown = pdfToText(pdfPath, fs, subprocess);
      if (pdfMarkdown) {
        extractionText = pdfMarkdown;
      } else {
        onProgress({ type: "reprocess-docling-failed", filename: jsonFilename });
        stats.errors++;
        results.push({ file: jsonFilename, status: "error", reason: "docling conversion failed" });
        continue;
      }
    } else if (sidecar.source_body_snippet) {
      if (dryRun) {
        onProgress({ type: "reprocess-dry-run-body", filename: jsonFilename });
        stats.reprocessed++;
        results.push({ file: jsonFilename, status: "dry-run" });
        continue;
      }
      extractionText = sidecar.source_body_snippet;
      onProgress({ type: "reprocess-using-body", filename: jsonFilename });
    } else {
      onProgress({ type: "reprocess-skipped", filename: jsonFilename, reason: "no PDF and no body snippet" });
      stats.skipped++;
      results.push({ file: jsonFilename, status: "skipped", reason: "no PDF and no body snippet" });
      continue;
    }

    // Re-run extraction
    try {
      const metadata = await extractMetadataWithLLM(
        llm.broker,
        extractionText,
        sidecar.subject || "",
        sidecar.source_email || "",
        sidecar.vendor || "",
        sidecar.date ? new Date(sidecar.date) : new Date()
      );

      if (!metadata) {
        onProgress({ type: "reprocess-no-data", filename: jsonFilename });
        stats.errors++;
        results.push({ file: jsonFilename, status: "error", reason: "LLM extraction failed" });
        continue;
      }

      if (metadata.is_invoice === false) {
        onProgress({ type: "reprocess-reclassified", filename: jsonFilename });
        fs.rm(jsonPath, { force: true });
        stats.reclassified++;
        results.push({ file: jsonFilename, status: "reclassified", reason: "non-invoice" });
        continue;
      }

      // Preserve fields from the original sidecar that aren't part of extraction
      const updated = {
        ...metadata,
        source_account: sidecar.source_account || metadata.source_account,
        email_uid: sidecar.email_uid || metadata.email_uid,
        receipt_file: sidecar.receipt_file || metadata.receipt_file,
        source_body_snippet: sidecar.source_body_snippet || null,
        downloadedAt: sidecar.downloadedAt || null,
        reprocessedAt: new Date().toISOString(),
      };

      fs.writeFile(jsonPath, JSON.stringify(updated, null, 2));
      onProgress({ type: "reprocess-updated", filename: jsonFilename });
      stats.reprocessed++;
      results.push({ file: jsonFilename, status: "reprocessed" });
    } catch (err) {
      onProgress({ type: "reprocess-error", filename: jsonFilename, error: err });
      stats.errors++;
      results.push({ file: jsonFilename, status: "error", reason: err.message });
    }
  }

  onProgress({ type: "reprocess-summary", reprocessed: stats.reprocessed, skipped: stats.skipped, reclassified: stats.reclassified, errors: stats.errors });

  return { ...stats, results };
}
