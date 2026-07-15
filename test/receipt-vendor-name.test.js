import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  cleanVendorForFilename,
  extractForwardedSender,
  extractVendorFromContent,
  FORWARDED_MARKERS,
  GENERIC_SENDER_PREFIXES,
  MAX_VENDOR_NAME_LENGTH,
  sanitizeFilename,
  titleCase,
  vendorFromDomain,
} from "../src/receipts/receipt-vendor-name.js";

// ── titleCase ─────────────────────────────────────────────────────────────────

describe("titleCase", () => {
  it("capitalises the first letter of a single word", () => {
    expect(titleCase("vevor")).toBe("Vevor");
  });

  it("capitalises the first letter after a hyphen", () => {
    expect(titleCase("best-buy")).toBe("Best-Buy");
  });

  it("capitalises the first letter after a dot", () => {
    expect(titleCase("some.domain")).toBe("Some.Domain");
  });

  it("leaves an already-capitalised string unchanged", () => {
    expect(titleCase("GitHub")).toBe("GitHub");
  });
});

// ── sanitizeFilename ──────────────────────────────────────────────────────────

describe("sanitizeFilename", () => {
  it("removes forward slashes", () => {
    expect(sanitizeFilename("a/b")).toBe("ab");
  });

  it("removes backslashes", () => {
    expect(sanitizeFilename("a\\b")).toBe("ab");
  });

  it("removes colons, asterisks, question marks, angle brackets, pipes, and commas", () => {
    expect(sanitizeFilename('Invoice: "test" <ok>|file*?')).toBe("Invoice-test-okfile");
  });

  it("replaces spaces with hyphens", () => {
    expect(sanitizeFilename("Best Buy")).toBe("Best-Buy");
  });

  it("collapses multiple consecutive hyphens into one", () => {
    expect(sanitizeFilename("a---b")).toBe("a-b");
  });

  it("strips trailing dots", () => {
    expect(sanitizeFilename("file...")).toBe("file");
  });

  it("strips leading and trailing hyphens", () => {
    expect(sanitizeFilename("-name-")).toBe("name");
  });
});

// ── vendorFromDomain ──────────────────────────────────────────────────────────

describe("vendorFromDomain", () => {
  const domainMap = {
    "bestbuy.ca": "Best-Buy",
    "apple.com": "Apple",
    "anthropic.com": "Anthropic",
    "acme.com": "Acme",
  };

  it("returns the mapped name for an exact domain hit", () => {
    expect(vendorFromDomain("bestbuy.ca", domainMap)).toBe("Best-Buy");
  });

  it("strips 'email.' prefix and retries the domain map", () => {
    expect(vendorFromDomain("email.apple.com", domainMap)).toBe("Apple");
  });

  it("strips 'mail.' prefix and retries the domain map", () => {
    expect(vendorFromDomain("mail.anthropic.com", domainMap)).toBe("Anthropic");
  });

  it("strips only the first matching prefix (email.order.acme.com -> order.acme.com, not acme.com)", () => {
    const result = vendorFromDomain("email.order.acme.com", domainMap);
    // "email." is stripped; "order.acme.com" is not in the map, so titlecase fallback
    expect(result).toBe("Order-Acme");
  });

  it("titlecases and drops TLD for unknown domains", () => {
    expect(vendorFromDomain("unknownstore.com", {})).toBe("Unknownstore");
  });
});

// ── extractVendorFromContent ──────────────────────────────────────────────────

describe("extractVendorFromContent", () => {
  it("extracts vendor from 'Receipt from Vendor –' subject pattern", () => {
    expect(extractVendorFromContent("Receipt from Acme Store –", "")).toBe("Acme-Store");
  });

  it("extracts vendor from 'Invoice from Vendor' subject pattern", () => {
    expect(extractVendorFromContent("Invoice from Widget Co", "")).toBe("Widget-Co");
  });

  it("extracts vendor from 'Your Vendor receipt' subject pattern", () => {
    expect(extractVendorFromContent("Your Vendor receipt", "")).toBe("Vendor");
  });

  it("extracts vendor from 'Fwd: Receipt from Vendor' subject pattern", () => {
    expect(extractVendorFromContent("Fwd: Receipt from Acme Inc", "")).toBe("Acme-Inc");
  });

  it("returns null when no recognisable pattern is found", () => {
    expect(extractVendorFromContent("No match here", "body text")).toBeNull();
  });

  it("returns null when matched name is shorter than MIN_VENDOR_NAME_LENGTH", () => {
    expect(extractVendorFromContent("Receipt from AB", "")).toBeNull();
  });

  it("returns null when matched name exceeds MAX_VENDOR_NAME_LENGTH", () => {
    const longName = "A".repeat(MAX_VENDOR_NAME_LENGTH + 1);
    expect(extractVendorFromContent(`Receipt from ${longName} –`, "")).toBeNull();
  });
});

// ── extractForwardedSender ────────────────────────────────────────────────────

describe("extractForwardedSender", () => {
  it("returns null for a non-forwarded email body", () => {
    expect(extractForwardedSender("Your order has been confirmed.")).toBeNull();
  });

  it("detects the Gmail-style forwarded marker", () => {
    const body = `${FORWARDED_MARKERS[0]}\nFrom: Billing <billing@vendor.com>\n`;
    const result = extractForwardedSender(body);
    expect(result?.address).toBe("billing@vendor.com");
    expect(result?.name).toBe("Billing");
  });

  it("detects the 'Begin forwarded message:' marker", () => {
    const body = `${FORWARDED_MARKERS[1]}\nFrom: Shop <shop@example.com>\n`;
    const result = extractForwardedSender(body);
    expect(result?.address).toBe("shop@example.com");
  });

  it("detects the '-------- Original Message --------' marker", () => {
    const body = `${FORWARDED_MARKERS[2]}\nFrom: Support <support@help.com>\n`;
    const result = extractForwardedSender(body);
    expect(result?.address).toBe("support@help.com");
  });

  it("detects the '-----Original Message-----' marker", () => {
    const body = `${FORWARDED_MARKERS[3]}\nFrom: noreply@orders.com\n`;
    const result = extractForwardedSender(body);
    expect(result?.address).toBe("noreply@orders.com");
  });

  it("parses 'Name <address>' form and returns both name and address", () => {
    const body = `${FORWARDED_MARKERS[0]}\nFrom: Acme Billing <invoices@acme.com>\n`;
    const result = extractForwardedSender(body);
    expect(result?.name).toBe("Acme Billing");
    expect(result?.address).toBe("invoices@acme.com");
  });

  it("parses bare address form and returns empty name", () => {
    const body = `${FORWARDED_MARKERS[0]}\nFrom: bare@example.com\n`;
    const result = extractForwardedSender(body);
    expect(result?.address).toBe("bare@example.com");
    expect(result?.name).toBe("");
  });

  it("returns null when no From line follows the marker", () => {
    const body = `${FORWARDED_MARKERS[0]}\nSubject: Invoice\n`;
    expect(extractForwardedSender(body)).toBeNull();
  });
});

// ── cleanVendorForFilename ────────────────────────────────────────────────────

describe("cleanVendorForFilename", () => {
  const vendorFilenameNames = {
    "billing@zoom.us": "Zoom",
    "noreply@github.com": "GitHub",
  };
  const vendorDomainMap = {
    "amazon.com": "Amazon",
    "apple.com": "Apple",
    "zoom.us": "Zoom",
  };
  const selfAddresses = ["self@example.com"];

  const overrides = { vendorFilenameNames, vendorDomainMap, selfAddresses };

  it("returns the exact-address map value when the sender is in vendorFilenameNames", () => {
    expect(cleanVendorForFilename("billing@zoom.us", "Zoom", undefined, undefined, overrides)).toBe("Zoom");
  });

  it("is case-insensitive for the address lookup", () => {
    expect(cleanVendorForFilename("BILLING@ZOOM.US", "Zoom", undefined, undefined, overrides)).toBe("Zoom");
  });

  describe("forwarded sender path", () => {
    it("resolves vendor from forwarded address exact map hit", () => {
      const body = `${FORWARDED_MARKERS[0]}\nFrom: Zoom <billing@zoom.us>\n`;
      const result = cleanVendorForFilename("forwarder@example.com", "Forwarder", body, undefined, overrides);
      expect(result).toBe("Zoom");
    });

    it("resolves vendor from forwarded sender's domain map", () => {
      const body = `${FORWARDED_MARKERS[0]}\nFrom: Store <noreply@amazon.com>\n`;
      const result = cleanVendorForFilename("forwarder@example.com", "Forwarder", body, undefined, overrides);
      expect(result).toBe("Amazon");
    });

    it("uses forwarded display name when no map entry exists", () => {
      const body = `${FORWARDED_MARKERS[0]}\nFrom: Acme Store <billing@acme-unknown.com>\n`;
      const result = cleanVendorForFilename("forwarder@example.com", "Forwarder", body, undefined, overrides);
      expect(result).toBe("Acme-Store");
    });

    it("derives vendor from forwarded sender's domain as last resort", () => {
      const body = `${FORWARDED_MARKERS[0]}\nFrom: noreply@widgets-unknown.com\n`;
      const result = cleanVendorForFilename("forwarder@example.com", "Forwarder", body, undefined, overrides);
      expect(result).toBe("Widgets-Unknown");
    });
  });

  describe("self-sent path", () => {
    it("extracts vendor from subject content when sender is in selfAddresses", () => {
      const result = cleanVendorForFilename(
        "self@example.com",
        "Self",
        "some body text",
        "Receipt from Acme Store –",
        overrides,
      );
      expect(result).toBe("Acme-Store");
    });
  });

  describe("domain map and name fallback path", () => {
    it("returns domain map value when sender domain is in vendorDomainMap", () => {
      const result = cleanVendorForFilename("orders@amazon.com", "", undefined, undefined, overrides);
      expect(result).toBe("Amazon");
    });

    it("derives vendor from domain when local part is a GENERIC_SENDER_PREFIX", () => {
      const prefix = [...GENERIC_SENDER_PREFIXES][0]; // e.g. "noreply"
      const result = cleanVendorForFilename(`${prefix}@widgetsco.com`, "", undefined, undefined, overrides);
      expect(result).toBe("Widgetsco");
    });

    it("derives vendor from domain when display name is empty (treated as generic)", () => {
      const result = cleanVendorForFilename("billing@widgetsco.com", "", undefined, undefined, overrides);
      expect(result).toBe("Widgetsco");
    });

    it("strips corporate suffix from display name", () => {
      const result = cleanVendorForFilename("billing@unknown.com", "Widgets Inc.", undefined, undefined, overrides);
      expect(result).not.toContain("Inc");
    });

    it("truncates result to at most MAX_VENDOR_NAME_LENGTH characters", () => {
      const longName = "A Very Long Company Name That Exceeds The Limit Corp.";
      const result = cleanVendorForFilename("billing@unknown.com", longName, undefined, undefined, overrides);
      expect(result.length).toBeLessThanOrEqual(MAX_VENDOR_NAME_LENGTH);
    });
  });

  afterEach(() => {
    mock.restore();
  });
});
