import { describe, expect, it } from "bun:test";
import {
  extractAmount,
  extractInvoiceNumber,
  extractService,
  extractTax,
  formatDate,
  inferCurrency,
  isCanadianMerchant,
  isValidInvoiceNumber,
  MAX_SERVICE_LENGTH,
  MIN_SERVICE_LENGTH,
} from "../src/receipts/receipt-fields.js";

const TEST_CANADIAN_DOMAINS = ["apple.com", "costco.ca", "amazon.ca"];
const TEST_INVOICE_BLOCKLIST = ["000-0000", "N/A"];

// ── formatDate ────────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("zero-pads a single-digit month", () => {
    expect(formatDate(new Date(2025, 0, 15))).toMatch(/^2025-01-/);
  });

  it("zero-pads a single-digit day", () => {
    expect(formatDate(new Date(2025, 2, 5))).toMatch(/-05$/);
  });

  it("accepts a Date object and returns YYYY-MM-DD", () => {
    expect(formatDate(new Date(2026, 5, 20))).toBe("2026-06-20");
  });

  it("accepts an ISO string and returns the same result as the equivalent Date", () => {
    const iso = "2026-03-15T12:00:00";
    const fromDate = formatDate(new Date(iso));
    const fromString = formatDate(iso);
    expect(fromString).toBe(fromDate);
  });
});

// ── inferCurrency ─────────────────────────────────────────────────────────────

describe("inferCurrency", () => {
  it("returns CAD when text contains 'CAD'", () => {
    expect(inferCurrency("Total: CAD $12.99")).toBe("CAD");
  });

  it("returns CAD when text contains HST tax code", () => {
    expect(inferCurrency("HST: $1.56")).toBe("CAD");
  });

  it("returns CAD when text contains GST tax code", () => {
    expect(inferCurrency("GST charged: $0.50")).toBe("CAD");
  });

  it("returns CAD when text contains PST tax code", () => {
    expect(inferCurrency("PST: $0.78")).toBe("CAD");
  });

  it("returns CAD when text contains QST tax code", () => {
    expect(inferCurrency("QST: $1.00")).toBe("CAD");
  });

  it("returns EUR when text contains EUR", () => {
    expect(inferCurrency("Total: EUR 9.99")).toBe("EUR");
  });

  it("returns GBP when text contains GBP", () => {
    expect(inferCurrency("Charged: GBP 5.00")).toBe("GBP");
  });

  it("returns AUD when text contains AUD", () => {
    expect(inferCurrency("Total: AUD $19.99")).toBe("AUD");
  });

  it("defaults to USD when no currency indicator found", () => {
    expect(inferCurrency("Total: $9.99")).toBe("USD");
  });
});

// ── isCanadianMerchant ────────────────────────────────────────────────────────

describe("isCanadianMerchant", () => {
  const overrides = { canadianDomains: TEST_CANADIAN_DOMAINS };

  it("returns true for an exact domain in the list", () => {
    expect(isCanadianMerchant("billing@costco.ca", "", overrides)).toBe(true);
  });

  it("returns true for a parent-domain match (email.apple.com -> apple.com)", () => {
    expect(isCanadianMerchant("no_reply@email.apple.com", "", overrides)).toBe(true);
  });

  it("returns true for any .ca TLD domain", () => {
    expect(isCanadianMerchant("orders@unknownstore.ca", "", overrides)).toBe(true);
  });

  it("returns true when body contains HST", () => {
    expect(isCanadianMerchant("billing@us-company.com", "HST charged: $1.30", overrides)).toBe(true);
  });

  it("returns true when body contains GST", () => {
    expect(isCanadianMerchant("billing@us-company.com", "GST: $0.65", overrides)).toBe(true);
  });

  it("returns false for a non-Canadian domain without tax indicators", () => {
    expect(isCanadianMerchant("billing@us-company.com", "Total: $9.99", overrides)).toBe(false);
  });
});

// ── isValidInvoiceNumber ──────────────────────────────────────────────────────

describe("isValidInvoiceNumber", () => {
  const overrides = { invoiceBlocklist: TEST_INVOICE_BLOCKLIST };

  it("returns true for a valid alphanumeric code with enough digits", () => {
    expect(isValidInvoiceNumber("INV-2024-0042", overrides)).toBe(true);
  });

  it("returns false when the digit count is below the minimum", () => {
    expect(isValidInvoiceNumber("AB2", overrides)).toBe(false);
  });

  it("returns false for a purely alphabetic string", () => {
    expect(isValidInvoiceNumber("ABCDEF", overrides)).toBe(false);
  });

  it("returns false for a blocklisted value", () => {
    expect(isValidInvoiceNumber("000-0000", overrides)).toBe(false);
  });

  it("returns false for a CRA business number (RT0001 pattern)", () => {
    expect(isValidInvoiceNumber("135664738RT0001", overrides)).toBe(false);
  });

  it("returns false for a trailing RT suffix (e.g. RT0001 alone)", () => {
    expect(isValidInvoiceNumber("REG12345RT0001", overrides)).toBe(false);
  });
});

// ── extractInvoiceNumber ──────────────────────────────────────────────────────

describe("extractInvoiceNumber", () => {
  const overrides = { invoiceBlocklist: TEST_INVOICE_BLOCKLIST };

  it("extracts a #CODE pattern from the subject (sigil form)", () => {
    expect(extractInvoiceNumber("Receipt #MNJ104XT91", "", overrides)).toBe("MNJ104XT91");
  });

  it("extracts 'Invoice #: CODE' pattern", () => {
    expect(extractInvoiceNumber("Invoice #: INV-2024-0042", "", overrides)).toBe("INV-2024-0042");
  });

  it("extracts 'Invoice CODE' (no sigil) from subject", () => {
    expect(extractInvoiceNumber("Invoice 2024-0042", "", overrides)).toBe("2024-0042");
  });

  it("extracts a bare INV-prefix code from subject (captures only alphanumeric portion)", () => {
    // INV[-_]? captures the first alphanumeric run — hyphens after the prefix are not included
    expect(extractInvoiceNumber("INV-9981", "", overrides)).toBe("9981");
  });

  it("extracts 'Receipt #: CODE' pattern from body", () => {
    expect(extractInvoiceNumber("", "Receipt #: R-20240601", overrides)).toBe("R-20240601");
  });

  it("extracts 'Order ID: CODE' from body", () => {
    expect(extractInvoiceNumber("", "Order ID: XY-9887766", overrides)).toBe("XY-9887766");
  });

  it("extracts 'Transaction ID: CODE' from body", () => {
    expect(extractInvoiceNumber("", "Transaction ID: TXN-44219", overrides)).toBe("TXN-44219");
  });

  it("extracts 'Reference #: CODE' from body", () => {
    expect(extractInvoiceNumber("", "Reference #: REF-1234A", overrides)).toBe("REF-1234A");
  });

  it("returns null when every candidate is rejected (no digits)", () => {
    expect(extractInvoiceNumber("Your order is confirmed", "No numbers here.", overrides)).toBeNull();
  });

  it("returns null for a CRA tax registration number in the body", () => {
    expect(extractInvoiceNumber("", "GST Reg: 135664738RT0001", overrides)).toBeNull();
  });
});

// ── extractAmount ─────────────────────────────────────────────────────────────

describe("extractAmount", () => {
  it("extracts amount from 'Total: $X.XX' pattern", () => {
    const result = extractAmount("Total: $12.99");
    expect(result?.amount).toBe(12.99);
  });

  it("removes commas from large amounts", () => {
    const result = extractAmount("Total: $1,299.00");
    expect(result?.amount).toBe(1299);
  });

  it("infers CAD from a leading CAD prefix", () => {
    const result = extractAmount("Total: CAD $15.00");
    expect(result?.currency).toBe("CAD");
  });

  it("infers currency from a trailing currency code", () => {
    const result = extractAmount("charged 9.99 USD");
    expect(result?.currency).toBe("USD");
  });

  it("infers currency via inferCurrency fallback when no explicit code present", () => {
    const result = extractAmount("Total: $15.00\nHST: $1.95");
    expect(result?.currency).toBe("CAD");
  });

  it("returns the largest dollar amount as fallback when no total keyword present", () => {
    const result = extractAmount("Line item $5.00 and another $20.00");
    expect(result?.amount).toBe(20);
  });

  it("returns null when no dollar amounts are present", () => {
    expect(extractAmount("No prices here")).toBeNull();
  });
});

// ── extractTax ────────────────────────────────────────────────────────────────

describe("extractTax", () => {
  it("extracts type and amount from 'HST: $X.XX' (type precedes amount)", () => {
    const result = extractTax("HST: $1.56");
    expect(result?.amount).toBe(1.56);
    expect(result?.type).toBe("HST");
  });

  it("extracts GST type from 'GST: $X.XX'", () => {
    const result = extractTax("GST: $0.50");
    expect(result?.type).toBe("GST");
  });

  it("extracts tax from 'Tax (HST): $X.XX' parenthetical format", () => {
    const result = extractTax("Tax (HST): $2.30");
    expect(result?.amount).toBe(2.3);
    expect(result?.type).toBe("HST");
  });

  it("extracts tax from '$X.XX HST' (amount precedes label)", () => {
    const result = extractTax("$13.00 HST");
    expect(result?.amount).toBe(13.0);
    expect(result?.type).toBe("HST");
  });

  it("returns null when no tax pattern is found", () => {
    expect(extractTax("Total: $9.99")).toBeNull();
  });
});

// ── extractService ────────────────────────────────────────────────────────────

describe("extractService", () => {
  it("extracts service from 'Plan: X' pattern", () => {
    expect(extractService("Plan: GitHub Copilot Business")).toBe("GitHub Copilot Business");
  });

  it("extracts service from 'Product: X' pattern", () => {
    expect(extractService("Product: Widget Pro")).toBe("Widget Pro");
  });

  it("extracts service from 'Subscription: X' pattern", () => {
    expect(extractService("Subscription: ChatGPT Plus\nTotal: $20.00")).toBe("ChatGPT Plus");
  });

  it("extracts service from an indented line-item with price", () => {
    expect(extractService("Extended Professional Cloud Storage Service $9.99")).toBe(
      "Extended Professional Cloud Storage Service",
    );
  });

  it("returns null when matched text is shorter than MIN_SERVICE_LENGTH", () => {
    const shortName = "A".repeat(MIN_SERVICE_LENGTH - 1);
    expect(extractService(`Plan: ${shortName}`)).toBeNull();
  });

  it("returns null when matched text exceeds MAX_SERVICE_LENGTH", () => {
    const longName = "A".repeat(MAX_SERVICE_LENGTH + 1);
    expect(extractService(`Plan: ${longName}`)).toBeNull();
  });

  it("returns null for garbage containing a URL", () => {
    expect(extractService("Plan: https://admin-center.example.com")).toBeNull();
  });

  it("returns null for garbage containing a long numeric ID", () => {
    expect(extractService("Plan: Order 123456789")).toBeNull();
  });

  it("returns null for garbage containing 'admin center'", () => {
    expect(extractService("Subscription: Microsoft Admin Center Portal")).toBeNull();
  });

  it("returns null for garbage containing 'canceled'", () => {
    expect(extractService("Plan: Subscription canceled renewal")).toBeNull();
  });

  it("returns null when no service pattern is found", () => {
    expect(extractService("Just a plain email with no label")).toBeNull();
  });
});
