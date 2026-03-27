import { beforeEach, describe, expect, it } from "bun:test";
import { resetConfigCache } from "../src/config.js";
import { buildFilename, getVendorNames, vendorName } from "../src/downloader.js";

beforeEach(() => {
  resetConfigCache();
});

describe("vendorName", () => {
  it("returns cleaned sender name for unknown address with a display name", () => {
    const name = vendorName("billing@unknown-vendor.com", "Unknown Vendor Inc.");
    expect(name).toBe("Unknown Vendor");
  });

  it("strips LLC suffix from sender name", () => {
    const name = vendorName("hello@acme.com", "Acme LLC");
    expect(name).toBe("Acme");
  });

  it("strips Ltd. suffix from sender name", () => {
    const name = vendorName("billing@widgets.com", "Widgets Ltd.");
    expect(name).toBe("Widgets");
  });

  it("strips 'via Stripe' from sender name", () => {
    const name = vendorName("billing@stripe.com", "Acme Corp via Stripe");
    expect(name).toBe("Acme");
  });

  it("falls back to local part of email when no sender name and not in map", () => {
    const name = vendorName("orders@unknownshop.com", "");
    expect(name).toBe("orders");
  });

  it("truncates name at word boundary when longer than 30 chars", () => {
    const longName = "A Very Long Company Name That Exceeds Thirty Characters";
    const name = vendorName("billing@long.com", longName);
    expect(name.length).toBeLessThanOrEqual(30);
  });

  it("getVendorNames returns an object", () => {
    const names = getVendorNames();
    expect(typeof names).toBe("object");
  });
});

describe("buildFilename", () => {
  it("formats as 'Vendor YYYY-MM-DD.pdf' for a Date object", () => {
    const date = new Date("2025-03-15T00:00:00Z");
    const filename = buildFilename("Acme", date, null, new Set());
    expect(filename).toBe("Acme 2025-03-15.pdf");
  });

  it("formats correctly from a date string", () => {
    const filename = buildFilename("Zoom", "2024-11-01", null, new Set());
    expect(filename).toBe("Zoom 2024-11-01.pdf");
  });

  it("uses provided vendor name verbatim", () => {
    const filename = buildFilename("JetBrains", new Date("2025-01-20"), null, new Set());
    expect(filename).toBe("JetBrains 2025-01-20.pdf");
  });

  it("appends _2 suffix when base filename is already in existingFiles", () => {
    const existing = new Set(["acme 2025-03-15.pdf"]);
    const filename = buildFilename("Acme", new Date("2025-03-15T00:00:00Z"), null, existing);
    expect(filename).toBe("Acme 2025-03-15_2.pdf");
  });

  it("appends _3 suffix when both _2 are taken", () => {
    const existing = new Set(["acme 2025-03-15.pdf", "acme 2025-03-15_2.pdf"]);
    const filename = buildFilename("Acme", new Date("2025-03-15T00:00:00Z"), null, existing);
    expect(filename).toBe("Acme 2025-03-15_3.pdf");
  });

  it("returns base filename when existingFiles is empty", () => {
    const filename = buildFilename("Vendor", new Date("2025-06-01T00:00:00Z"), "invoice.pdf", new Set());
    expect(filename).toBe("Vendor 2025-06-01.pdf");
  });

  it("pads single-digit month and day with leading zero", () => {
    const filename = buildFilename("Test", new Date("2025-01-05T00:00:00Z"), null, new Set());
    expect(filename).toBe("Test 2025-01-05.pdf");
  });
});
