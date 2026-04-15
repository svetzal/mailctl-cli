import { describe, expect, it } from "bun:test";
import {
  buildAttachmentListJson,
  buildAttachmentSavedJson,
  formatAttachmentListText,
  formatAttachmentSavedText,
} from "../src/format-attachment.js";

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

// ── buildAttachmentListJson ───────────────────────────────────────────────────

describe("buildAttachmentListJson", () => {
  const attachments = [{ index: 0, filename: "invoice.pdf", contentType: "application/pdf", size: 12345, part: "1" }];
  const result = buildAttachmentListJson({ account: "iCloud", uid: 42, attachments });

  it("includes account", () => {
    expect(result.account).toBe("iCloud");
  });

  it("includes uid", () => {
    expect(result.uid).toBe(42);
  });

  it("includes attachments array", () => {
    expect(result.attachments).toBe(attachments);
  });
});

// ── buildAttachmentSavedJson ──────────────────────────────────────────────────

describe("buildAttachmentSavedJson", () => {
  const saved = { path: "/tmp/invoice.pdf", filename: "invoice.pdf", size: 12345, contentType: "application/pdf" };
  const result = buildAttachmentSavedJson(saved);

  it("includes path", () => {
    expect(result.path).toBe("/tmp/invoice.pdf");
  });

  it("includes filename", () => {
    expect(result.filename).toBe("invoice.pdf");
  });

  it("includes size", () => {
    expect(result.size).toBe(12345);
  });

  it("includes contentType", () => {
    expect(result.contentType).toBe("application/pdf");
  });
});
