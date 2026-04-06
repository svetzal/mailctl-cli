import { describe, expect, it } from "bun:test";
import { buildAttachmentListing, validateAttachmentIndex } from "../src/extract-attachment-logic.js";

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
