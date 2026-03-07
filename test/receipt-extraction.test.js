import { describe, it, expect, beforeEach } from "bun:test";
import {
  titleCase,
  sanitizeFilename,
  vendorFromDomain,
  extractVendorFromContent,
  cleanVendorForFilename,
  extractForwardedSender,
  formatDate,
  inferCurrency,
  isCanadianMerchant,
  isValidInvoiceNumber,
  extractInvoiceNumber,
  extractAmount,
  extractTax,
  extractService,
  extractMetadata,
} from "../src/receipt-extraction.js";
import { resetConfigCache } from "../src/config.js";

/** Test vendor maps — injected via overrides, not from config file. */
const TEST_VENDOR_FILENAME_NAMES = {
  "billing@zoom.us": "Zoom",
  "noreply@github.com": "GitHub",
};

const TEST_VENDOR_DOMAIN_MAP = {
  "costco.ca": "Costco",
  "amazon.ca": "Amazon",
  "amazon.com": "Amazon",
  "bestbuy.ca": "Best-Buy",
  "apple.com": "Apple",
  "anthropic.com": "Anthropic",
  "zoom.us": "Zoom",
};

const TEST_SELF_ADDRESSES = ["self@example.com"];
const TEST_INVOICE_BLOCKLIST = ["000-0000"];
const TEST_CANADIAN_DOMAINS = ["apple.com", "costco.ca", "amazon.ca", "bestbuy.ca"];

beforeEach(() => {
  resetConfigCache();
});

// ── titleCase ────────────────────────────────────────────────────────────────

describe("titleCase", () => {
  it("capitalises first letter of a single word", () => {
    expect(titleCase("vevor")).toBe("Vevor");
  });

  it("capitalises words separated by hyphens", () => {
    expect(titleCase("best-buy")).toBe("Best-Buy");
  });

  it("capitalises words separated by dots", () => {
    expect(titleCase("some.domain")).toBe("Some.Domain");
  });

  it("handles already-capitalised strings", () => {
    expect(titleCase("GitHub")).toBe("GitHub");
  });
});

// ── sanitizeFilename ─────────────────────────────────────────────────────────

describe("sanitizeFilename", () => {
  it("removes forward and back slashes (no replacement char)", () => {
    expect(sanitizeFilename("a/b\\c")).toBe("abc");
  });

  it("removes filesystem-unsafe characters", () => {
    expect(sanitizeFilename('Invoice: "test" <ok>|file*?')).toBe("Invoice-test-okfile");
  });

  it("replaces spaces with hyphens", () => {
    expect(sanitizeFilename("Best Buy")).toBe("Best-Buy");
  });

  it("collapses multiple hyphens into one", () => {
    expect(sanitizeFilename("a---b")).toBe("a-b");
  });

  it("strips trailing dots", () => {
    expect(sanitizeFilename("file...")).toBe("file");
  });

  it("strips leading and trailing hyphens", () => {
    expect(sanitizeFilename("-name-")).toBe("name");
  });
});

// ── vendorFromDomain ─────────────────────────────────────────────────────────

describe("vendorFromDomain", () => {
  it("returns known mapped name for exact domain match", () => {
    expect(vendorFromDomain("bestbuy.ca", TEST_VENDOR_DOMAIN_MAP)).toBe("Best-Buy");
  });

  it("strips common sub-domain prefix and tries map again", () => {
    expect(vendorFromDomain("email.apple.com", TEST_VENDOR_DOMAIN_MAP)).toBe("Apple");
  });

  it("strips 'mail.' prefix and looks up the base domain", () => {
    expect(vendorFromDomain("mail.anthropic.com", TEST_VENDOR_DOMAIN_MAP)).toBe("Anthropic");
  });

  it("titlecases unknown domain after stripping TLD", () => {
    expect(vendorFromDomain("unknownstore.com")).toBe("Unknownstore");
  });

  it("handles multi-segment unknown domain", () => {
    const result = vendorFromDomain("shop.widgets.ca");
    // Should drop TLD and titlecase remaining parts
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── extractVendorFromContent ─────────────────────────────────────────────────

describe("extractVendorFromContent", () => {
  it("extracts vendor from 'Receipt from Vendor' subject pattern", () => {
    const result = extractVendorFromContent("Receipt from Acme Store", "");
    expect(result).toBe("Acme-Store");
  });

  it("extracts vendor from 'Your Order receipt' subject pattern", () => {
    const result = extractVendorFromContent("Your Vendor receipt", "");
    expect(result).toBe("Vendor");
  });

  it("returns null when no recognisable pattern found", () => {
    expect(extractVendorFromContent("No match here", "body text")).toBeNull();
  });

  it("returns null for very short matches (under 3 chars)", () => {
    expect(extractVendorFromContent("Receipt from AB", "")).toBeNull();
  });
});

// ── extractForwardedSender ───────────────────────────────────────────────────

describe("extractForwardedSender", () => {
  it("returns null for a non-forwarded email body", () => {
    expect(extractForwardedSender("Your order has been confirmed.")).toBeNull();
  });

  it("detects Gmail-style forwarded marker and extracts address", () => {
    const body = "---------- Forwarded message ----------\nFrom: Billing <billing@vendor.com>\nSubject: Invoice";
    const result = extractForwardedSender(body);
    expect(result).not.toBeNull();
    expect(result?.address).toBe("billing@vendor.com");
    expect(result?.name).toBe("Billing");
  });

  it("detects 'Begin forwarded message:' marker", () => {
    const body = "Begin forwarded message:\nFrom: Shop <shop@example.com>\n";
    const result = extractForwardedSender(body);
    expect(result?.address).toBe("shop@example.com");
  });

  it("detects '-----Original Message-----' marker", () => {
    const body = "-----Original Message-----\nFrom: noreply@orders.com\n";
    const result = extractForwardedSender(body);
    expect(result?.address).toBe("noreply@orders.com");
  });

  it("returns null when From line is missing after marker", () => {
    const body = "---------- Forwarded message ----------\nSubject: Invoice\n";
    expect(extractForwardedSender(body)).toBeNull();
  });
});

// ── cleanVendorForFilename ───────────────────────────────────────────────────

describe("cleanVendorForFilename", () => {
  const overrides = {
    vendorFilenameNames: TEST_VENDOR_FILENAME_NAMES,
    vendorDomainMap: TEST_VENDOR_DOMAIN_MAP,
    selfAddresses: TEST_SELF_ADDRESSES,
  };

  it("returns exact match for a known vendor address", () => {
    expect(cleanVendorForFilename("billing@zoom.us", "Zoom", undefined, undefined, overrides)).toBe("Zoom");
  });

  it("uses domain map for generic sender local parts", () => {
    expect(cleanVendorForFilename("noreply@amazon.com", "", undefined, undefined, overrides)).toBe("Amazon");
  });

  it("strips corporate suffixes from display name", () => {
    const result = cleanVendorForFilename("billing@widgets.com", "Widgets Inc.", undefined, undefined, overrides);
    expect(result).not.toContain("Inc");
  });

  it("truncates result to at most 30 chars", () => {
    const longName = "A Very Long Company Name That Exceeds Thirty Characters Inc.";
    const result = cleanVendorForFilename("billing@long.com", longName, undefined, undefined, overrides);
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it("detects forwarded sender and extracts vendor from forwarded body", () => {
    const body = "---------- Forwarded message ----------\nFrom: Vendor <billing@vendor.com>\nYour receipt";
    const result = cleanVendorForFilename("self@example.com", "Self", body, "Fwd: Receipt", overrides);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── formatDate ───────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("formats a Date object as YYYY-MM-DD", () => {
    expect(formatDate(new Date("2025-03-07T12:00:00Z"))).toBe("2025-03-07");
  });

  it("formats a date string as YYYY-MM-DD", () => {
    expect(formatDate("2024-11-15")).toBe("2024-11-15");
  });

  it("pads single-digit month and day", () => {
    expect(formatDate(new Date("2025-01-05T00:00:00Z"))).toBe("2025-01-05");
  });
});

// ── inferCurrency ─────────────────────────────────────────────────────────────

describe("inferCurrency", () => {
  it("returns CAD when text contains 'CAD'", () => {
    expect(inferCurrency("Total: CAD $12.99")).toBe("CAD");
  });

  it("returns CAD when text contains 'HST'", () => {
    expect(inferCurrency("HST: $1.56")).toBe("CAD");
  });

  it("returns CAD when text contains 'GST'", () => {
    expect(inferCurrency("GST charged: $0.50")).toBe("CAD");
  });

  it("returns EUR for EUR text", () => {
    expect(inferCurrency("Total: EUR 9.99")).toBe("EUR");
  });

  it("returns GBP for GBP text", () => {
    expect(inferCurrency("Charged: GBP 5.00")).toBe("GBP");
  });

  it("defaults to USD when no indicator found", () => {
    expect(inferCurrency("Total: $9.99")).toBe("USD");
  });
});

// ── isCanadianMerchant ────────────────────────────────────────────────────────

describe("isCanadianMerchant", () => {
  const overrides = { canadianDomains: TEST_CANADIAN_DOMAINS };

  it("returns true for a known Canadian domain", () => {
    expect(isCanadianMerchant("billing@costco.ca", "", overrides)).toBe(true);
  });

  it("returns true for parent domain match (email.apple.com -> apple.com)", () => {
    expect(isCanadianMerchant("no_reply@email.apple.com", "", overrides)).toBe(true);
  });

  it("returns true for .ca TLD domain", () => {
    expect(isCanadianMerchant("orders@shop.ca", "", overrides)).toBe(true);
  });

  it("returns true when body contains HST", () => {
    expect(isCanadianMerchant("billing@us-company.com", "HST charged: $1.30", overrides)).toBe(true);
  });

  it("returns false for a non-Canadian domain without tax indicators", () => {
    expect(isCanadianMerchant("billing@us-company.com", "Total: $9.99", overrides)).toBe(false);
  });
});

// ── isValidInvoiceNumber ──────────────────────────────────────────────────────

describe("isValidInvoiceNumber", () => {
  const overrides = { invoiceBlocklist: TEST_INVOICE_BLOCKLIST };

  it("returns true for a valid alphanumeric invoice number", () => {
    expect(isValidInvoiceNumber("INV-2024-0042", overrides)).toBe(true);
  });

  it("returns false when fewer than 3 digits", () => {
    expect(isValidInvoiceNumber("AB2", overrides)).toBe(false);
  });

  it("returns false for purely alphabetic strings", () => {
    expect(isValidInvoiceNumber("ABCDEF", overrides)).toBe(false);
  });

  it("returns false for blocklisted value", () => {
    expect(isValidInvoiceNumber("000-0000", overrides)).toBe(false);
  });

  it("returns false for Canadian tax registration numbers (RT pattern)", () => {
    expect(isValidInvoiceNumber("135664738RT0001", overrides)).toBe(false);
  });
});

// ── extractInvoiceNumber ──────────────────────────────────────────────────────

describe("extractInvoiceNumber", () => {
  it("extracts #XXXXX pattern from subject", () => {
    expect(extractInvoiceNumber("Receipt #MNJ104XT91", "")).toBe("MNJ104XT91");
  });

  it("extracts Invoice XXXX pattern", () => {
    expect(extractInvoiceNumber("Invoice 2024-0042", "")).toBe("2024-0042");
  });

  it("extracts Order ID: XXXX pattern from body", () => {
    expect(extractInvoiceNumber("", "Order ID: XY-9887766")).toBe("XY-9887766");
  });

  it("returns null when no valid invoice number found", () => {
    expect(extractInvoiceNumber("Your order is confirmed", "No numbers here.")).toBeNull();
  });

  it("returns null for tax registration number in body", () => {
    expect(extractInvoiceNumber("", "GST Reg: 135664738RT0001")).toBeNull();
  });
});

// ── extractAmount ─────────────────────────────────────────────────────────────

describe("extractAmount", () => {
  it("extracts amount from 'Total: $X.XX' pattern", () => {
    const result = extractAmount("Total: $12.99");
    expect(result?.amount).toBe(12.99);
  });

  it("extracts amount with commas in number", () => {
    const result = extractAmount("Total: $1,299.00");
    expect(result?.amount).toBe(1299);
  });

  it("extracts currency from explicit CAD prefix", () => {
    const result = extractAmount("Total: CAD $15.00");
    expect(result?.currency).toBe("CAD");
  });

  it("returns largest dollar amount as fallback when no total keyword present", () => {
    const result = extractAmount("Line item $5.00 and line item $20.00");
    expect(result?.amount).toBe(20);
  });

  it("returns null when no dollar amounts found", () => {
    expect(extractAmount("No prices here")).toBeNull();
  });
});

// ── extractTax ────────────────────────────────────────────────────────────────

describe("extractTax", () => {
  it("extracts HST amount", () => {
    const result = extractTax("HST: $1.56");
    expect(result?.amount).toBe(1.56);
    expect(result?.type).toBe("HST");
  });

  it("extracts GST amount", () => {
    const result = extractTax("GST: $0.50");
    expect(result?.amount).toBe(0.50);
    expect(result?.type).toBe("GST");
  });

  it("extracts tax in 'Tax (HST): $X.XX' format", () => {
    const result = extractTax("Tax (HST): $2.30");
    expect(result?.amount).toBe(2.30);
    expect(result?.type).toBe("HST");
  });

  it("returns null when no tax found", () => {
    expect(extractTax("Total: $9.99")).toBeNull();
  });
});

// ── extractService ────────────────────────────────────────────────────────────

describe("extractService", () => {
  it("extracts service from 'Plan: X' pattern", () => {
    expect(extractService("Plan: GitHub Copilot Business")).toBe("GitHub Copilot Business");
  });

  it("extracts service from 'Subscription: X' pattern", () => {
    expect(extractService("Subscription: ChatGPT Plus\nTotal: $20.00")).toBe("ChatGPT Plus");
  });

  it("returns null when only garbage patterns found", () => {
    expect(extractService("Plan: https://admin-center.example.com")).toBeNull();
  });

  it("returns null when no service pattern found", () => {
    expect(extractService("Just a plain email with no label")).toBeNull();
  });
});

// ── extractMetadata (integration) ────────────────────────────────────────────

describe("extractMetadata", () => {
  it("returns correct schema field", () => {
    const result = extractMetadata("Total: $9.99", "Your receipt", "billing@zoom.us", "Zoom", new Date("2025-03-07"));
    expect(result.schema).toBe("mailctl.receipt.v1");
  });

  it("populates amount from body text", () => {
    const result = extractMetadata("Total: $15.99", "Receipt", "billing@shop.com", "Shop", new Date());
    expect(result.amount).toBe(15.99);
  });

  it("sets currency to CAD when HST tax found", () => {
    const result = extractMetadata("Total: $15.99\nHST: $2.08", "Receipt", "billing@zoom.us", "Zoom", new Date());
    expect(result.currency).toBe("CAD");
  });

  it("formats date as YYYY-MM-DD", () => {
    const result = extractMetadata("", "", "billing@zoom.us", "", new Date("2025-03-07T00:00:00Z"));
    expect(result.date).toBe("2025-03-07");
  });

  it("nullifies tax when tax amount >= subtotal (invalid parse)", () => {
    const result = extractMetadata("Total: $10.00\nHST: $10.00", "Receipt", "billing@zoom.us", "Zoom", new Date());
    expect(result.tax).toBeNull();
  });

  it("leaves source_account and email_uid as null (filled by orchestration)", () => {
    const result = extractMetadata("", "", "billing@zoom.us", "", new Date());
    expect(result.source_account).toBeNull();
    expect(result.email_uid).toBeNull();
  });
});
