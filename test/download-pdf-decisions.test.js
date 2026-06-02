import { describe, expect, it } from "bun:test";
import { buildManifestRecord, contentHash, isValidPdf } from "../src/download-pdf-decisions.js";

// ── isValidPdf ────────────────────────────────────────────────────────────────

describe("isValidPdf", () => {
  it("returns true for a buffer starting with %PDF-", () => {
    expect(isValidPdf(Buffer.from("%PDF-1.4 content"))).toBe(true);
  });

  it("returns false for a buffer not starting with %PDF-", () => {
    expect(isValidPdf(Buffer.from("not a pdf file"))).toBe(false);
  });

  it("returns false for a buffer exactly 4 bytes (shorter than 5)", () => {
    expect(isValidPdf(Buffer.from("%PDF"))).toBe(false);
  });

  it("returns false for an empty buffer", () => {
    expect(isValidPdf(Buffer.alloc(0))).toBe(false);
  });
});

// ── contentHash ───────────────────────────────────────────────────────────────

describe("contentHash", () => {
  it("returns a 64-character hex string", () => {
    expect(contentHash(Buffer.from("some content"))).toHaveLength(64);
  });

  it("returns the same hash for identical content", () => {
    const buf = Buffer.from("stable content");
    expect(contentHash(buf)).toBe(contentHash(buf));
  });

  it("returns different hashes for different content", () => {
    expect(contentHash(Buffer.from("aaa"))).not.toBe(contentHash(Buffer.from("bbb")));
  });
});

// ── buildManifestRecord ───────────────────────────────────────────────────────

describe("buildManifestRecord", () => {
  it("builds a no-pdf record with status and date only", () => {
    const date = new Date("2025-03-07");
    const record = buildManifestRecord("no-pdf", { date });
    expect(record.status).toBe("no-pdf");
  });

  it("no-pdf record does not include filename or vendor", () => {
    const record = buildManifestRecord("no-pdf", { date: new Date() });
    expect(record.filename).toBeUndefined();
    expect(record.vendor).toBeUndefined();
  });

  describe("builds a duplicate record", () => {
    const hash = "a".repeat(64);
    const record = buildManifestRecord("duplicate", { hash, date: new Date("2025-01-01"), vendor: "Acme" });
    it("has status duplicate", () => expect(record.status).toBe("duplicate"));
    it("truncates hash to 12 chars", () => expect(record.hash).toBe("a".repeat(12)));
  });

  it("duplicate record includes vendor", () => {
    const hash = "b".repeat(64);
    const record = buildManifestRecord("duplicate", { hash, date: new Date(), vendor: "TestVendor" });
    expect(record.vendor).toBe("TestVendor");
  });

  describe("builds a downloaded record", () => {
    const hash = "c".repeat(64);
    const record = buildManifestRecord("downloaded", {
      filename: "Acme 2025-01-01.pdf",
      hash,
      date: new Date("2025-01-01"),
      vendor: "Acme",
    });
    it("has status downloaded", () => expect(record.status).toBe("downloaded"));
    it("has the correct filename", () => expect(record.filename).toBe("Acme 2025-01-01.pdf"));
    it("truncates hash to 12 chars", () => expect(record.hash).toBe("c".repeat(12)));
  });

  it("downloaded record includes vendor", () => {
    const hash = "d".repeat(64);
    const record = buildManifestRecord("downloaded", {
      filename: "Test 2025-01-01.pdf",
      hash,
      date: new Date(),
      vendor: "TestCo",
    });
    expect(record.vendor).toBe("TestCo");
  });
});
