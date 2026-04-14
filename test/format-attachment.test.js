import { describe, expect, it } from "bun:test";
import { formatAttachmentListText, formatAttachmentSavedText } from "../src/format-attachment.js";

// ── formatAttachmentListText ──────────────────────────────────────────────────

describe("formatAttachmentListText", () => {
  it("returns 'No attachments.' for an empty array", () => {
    const text = formatAttachmentListText([]);

    expect(text).toBe("No attachments.");
  });

  it("shows the index for a single entry", () => {
    const text = formatAttachmentListText([
      { index: 0, filename: "invoice.pdf", contentType: "application/pdf", size: 12345, part: "1" },
    ]);

    expect(text).toContain("[0]");
  });

  it("shows the filename for a single entry", () => {
    const text = formatAttachmentListText([
      { index: 0, filename: "invoice.pdf", contentType: "application/pdf", size: 12345, part: "1" },
    ]);

    expect(text).toContain("invoice.pdf");
  });

  it("shows the content type for a single entry", () => {
    const text = formatAttachmentListText([
      { index: 0, filename: "invoice.pdf", contentType: "application/pdf", size: 12345, part: "1" },
    ]);

    expect(text).toContain("application/pdf");
  });

  it("shows the size in bytes for a single entry", () => {
    const text = formatAttachmentListText([
      { index: 0, filename: "invoice.pdf", contentType: "application/pdf", size: 12345, part: "1" },
    ]);

    expect(text).toContain("12345 bytes");
  });

  it("uses double-space separators between fields", () => {
    const text = formatAttachmentListText([
      { index: 0, filename: "invoice.pdf", contentType: "application/pdf", size: 12345, part: "1" },
    ]);

    expect(text).toContain("invoice.pdf  application/pdf  12345 bytes");
  });

  it("shows multiple lines for multiple entries", () => {
    const text = formatAttachmentListText([
      { index: 0, filename: "invoice.pdf", contentType: "application/pdf", size: 12345, part: "1" },
      { index: 1, filename: "receipt.png", contentType: "image/png", size: 6789, part: "2" },
    ]);

    expect(text).toContain("\n");
  });
});

// ── formatAttachmentSavedText ─────────────────────────────────────────────────

describe("formatAttachmentSavedText", () => {
  it("returns the path string as-is", () => {
    const text = formatAttachmentSavedText("/tmp/invoice.pdf");

    expect(text).toBe("/tmp/invoice.pdf");
  });
});
