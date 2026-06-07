import { describe, expect, it } from "bun:test";
import {
  buildAttachmentListing,
  selectDefaultAttachment,
  validateAttachmentIndex,
} from "../src/extract-attachment-logic.js";

/** @param {Partial<{filename: string|null, type: string, size: number, part: string}>} overrides */
function makePart(overrides = {}) {
  return { filename: "test.pdf", type: "application/pdf", size: 1024, part: "2", ...overrides };
}

describe("buildAttachmentListing", () => {
  describe("maps attachment parts to listing format", () => {
    const parts = [makePart({ filename: "receipt.pdf", type: "application/pdf", size: 2048, part: "2" })];
    const listing = buildAttachmentListing(parts);

    it("returns one listing item", () => {
      expect(listing).toHaveLength(1);
    });

    it("listing item matches the expected shape", () => {
      expect(listing[0]).toEqual({
        index: 0,
        filename: "receipt.pdf",
        contentType: "application/pdf",
        size: 2048,
        part: "2",
      });
    });
  });

  it("uses '(unnamed)' for attachments without a filename", () => {
    const listing = buildAttachmentListing([makePart({ filename: null })]);

    expect(listing[0].filename).toBe("(unnamed)");
  });

  it("uses 'unknown' for attachments without a content type", () => {
    const listing = buildAttachmentListing([makePart({ type: undefined })]);

    expect(listing[0].contentType).toBe("unknown");
  });

  it("returns 0 size when size is absent", () => {
    const listing = buildAttachmentListing([makePart({ size: undefined })]);

    expect(listing[0].size).toBe(0);
  });

  describe("assigns sequential 0-based index values", () => {
    const parts = [makePart({ part: "2" }), makePart({ part: "3" })];
    const listing = buildAttachmentListing(parts);

    it("first item has index 0", () => {
      expect(listing[0].index).toBe(0);
    });

    it("second item has index 1", () => {
      expect(listing[1].index).toBe(1);
    });
  });

  it("returns an empty array for empty input", () => {
    expect(buildAttachmentListing([])).toEqual([]);
  });
});

describe("validateAttachmentIndex", () => {
  it("returns the attachment at a valid index", () => {
    const listing = buildAttachmentListing([makePart()]);
    const att = validateAttachmentIndex(listing, 0, "100");

    expect(att.index).toBe(0);
  });

  it("throws for a negative index", () => {
    const listing = buildAttachmentListing([makePart()]);

    expect(() => validateAttachmentIndex(listing, -1, "100")).toThrow("out of range");
  });

  it("throws when index equals the length of the listing", () => {
    const listing = buildAttachmentListing([makePart()]);

    expect(() => validateAttachmentIndex(listing, 1, "100")).toThrow("out of range");
  });

  it("throws when the attachments array is empty", () => {
    expect(() => validateAttachmentIndex([], 0, "100")).toThrow("No attachments");
  });

  it("includes the uid in the 'no attachments' error message", () => {
    expect(() => validateAttachmentIndex([], 0, "999")).toThrow("999");
  });
});

describe("selectDefaultAttachment", () => {
  it("returns the PDF part when one is present", () => {
    const listing = buildAttachmentListing([
      { filename: "smime.p7s", type: "application/pkcs7-signature", size: 4096, part: "2" },
      { filename: "receipt.pdf", type: "application/pdf", size: 72000, part: "1.2" },
    ]);
    const att = selectDefaultAttachment(listing);
    expect(att.contentType).toBe("application/pdf");
  });

  it("prefers PDF even when smime.p7s is listed first", () => {
    const listing = buildAttachmentListing([
      { filename: "smime.p7s", type: "application/pkcs7-signature", size: 4096, part: "1" },
      { filename: "receipt.pdf", type: "application/pdf", size: 72000, part: "2" },
    ]);
    const att = selectDefaultAttachment(listing);
    expect(att.filename).toBe("receipt.pdf");
  });

  it("falls back to first non-signature part when no PDF exists", () => {
    const listing = buildAttachmentListing([
      { filename: "smime.p7s", type: "application/pkcs7-signature", size: 4096, part: "1" },
      {
        filename: "document.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 50000,
        part: "2",
      },
    ]);
    const att = selectDefaultAttachment(listing);
    expect(att.filename).toBe("document.docx");
  });

  it("falls back to attachments[0] when every part is a signature", () => {
    const listing = buildAttachmentListing([
      { filename: "smime.p7s", type: "application/pkcs7-signature", size: 4096, part: "1" },
    ]);
    const att = selectDefaultAttachment(listing);
    expect(att.filename).toBe("smime.p7s");
  });

  it("throws when the listing is empty", () => {
    expect(() => selectDefaultAttachment([])).toThrow("No attachments found");
  });
});
