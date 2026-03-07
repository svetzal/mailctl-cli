import { describe, it, expect } from "bun:test";
import { findAttachmentParts, findPdfParts, getPartFilename } from "../src/attachment-parts.js";

/**
 * Simulates an M365 Cleverbridge/Parallels message BODYSTRUCTURE:
 * multipart/mixed
 *   ├── multipart/related
 *   │   ├── multipart/alternative
 *   │   │   ├── text/plain (part 1.1.1)
 *   │   │   └── text/html (part 1.1.2)
 *   │   └── image/jpeg (part 1.2) — inline CID image (logo)
 *   └── application/pdf (part 2) — the actual receipt PDF
 */
function m365InlineImagePlusPdf() {
  return {
    type: "multipart/mixed",
    childNodes: [
      {
        type: "multipart/related",
        childNodes: [
          {
            type: "multipart/alternative",
            childNodes: [
              {
                type: "text/plain",
                part: "1.1.1",
                size: 2500,
                parameters: { charset: "utf-8" },
              },
              {
                type: "text/html",
                part: "1.1.2",
                size: 15000,
                parameters: { charset: "utf-8" },
              },
            ],
          },
          {
            type: "image/jpeg",
            part: "1.2",
            size: 4500,
            disposition: "inline",
            id: "<logo@cleverbridge.com>",
            parameters: { name: "logo.jpg" },
          },
        ],
      },
      {
        type: "application/pdf",
        part: "2",
        size: 85000,
        disposition: "attachment",
        dispositionParameters: { filename: "Invoice_509320833.pdf" },
        parameters: { name: "Invoice_509320833.pdf" },
      },
    ],
  };
}

/**
 * Simulates a structure where the PDF filename is only in Content-Type parameters,
 * not in Content-Disposition (seen with some M365 messages).
 */
function pdfFilenameOnlyInContentType() {
  return {
    type: "multipart/mixed",
    childNodes: [
      { type: "text/plain", part: "1", size: 500 },
      {
        type: "application/octet-stream",
        part: "2",
        size: 90000,
        disposition: "attachment",
        parameters: { name: "receipt.pdf" },
      },
    ],
  };
}

/** Simple single-part text message with no attachments. */
function plainTextOnly() {
  return {
    type: "text/plain",
    part: "1",
    size: 200,
    parameters: { charset: "utf-8" },
  };
}

/** Message with multiple inline images and no PDF. */
function multipleInlineImages() {
  return {
    type: "multipart/related",
    childNodes: [
      { type: "text/html", part: "1", size: 5000 },
      { type: "image/png", part: "2", size: 3000, disposition: "inline", id: "<img1@example.com>" },
      { type: "image/jpeg", part: "3", size: 6000, disposition: "inline", id: "<img2@example.com>" },
    ],
  };
}

/** Image without CID — should be treated as an attachment. */
function imageWithoutCid() {
  return {
    type: "multipart/mixed",
    childNodes: [
      { type: "text/plain", part: "1", size: 200 },
      {
        type: "image/png",
        part: "2",
        size: 50000,
        disposition: "attachment",
        dispositionParameters: { filename: "screenshot.png" },
      },
    ],
  };
}

describe("findAttachmentParts", () => {
  it("returns only the PDF when message has inline CID image + PDF attachment", () => {
    const parts = findAttachmentParts(m365InlineImagePlusPdf());
    expect(parts.length).toBe(1);
    expect(parts[0].type).toBe("application/pdf");
    expect(parts[0].part).toBe("2");
    expect(parts[0].filename).toBe("Invoice_509320833.pdf");
  });

  it("returns empty array for plain text message", () => {
    const parts = findAttachmentParts(plainTextOnly());
    expect(parts.length).toBe(0);
  });

  it("excludes all inline CID images", () => {
    const parts = findAttachmentParts(multipleInlineImages());
    expect(parts.length).toBe(0);
  });

  it("includes images without CID as attachments", () => {
    const parts = findAttachmentParts(imageWithoutCid());
    expect(parts.length).toBe(1);
    expect(parts[0].type).toBe("image/png");
    expect(parts[0].filename).toBe("screenshot.png");
  });

  it("returns empty array for null structure", () => {
    expect(findAttachmentParts(null).length).toBe(0);
  });
});

describe("findPdfParts", () => {
  it("finds PDF in M365 inline image + PDF structure", () => {
    const parts = findPdfParts(m365InlineImagePlusPdf());
    expect(parts.length).toBe(1);
    expect(parts[0].part).toBe("2");
    expect(parts[0].filename).toBe("Invoice_509320833.pdf");
  });

  it("detects PDF via Content-Type parameters name when dispositionParameters is missing", () => {
    const parts = findPdfParts(pdfFilenameOnlyInContentType());
    expect(parts.length).toBe(1);
    expect(parts[0].part).toBe("2");
    expect(parts[0].filename).toBe("receipt.pdf");
  });

  it("returns empty array when no PDF present", () => {
    const parts = findPdfParts(multipleInlineImages());
    expect(parts.length).toBe(0);
  });

  it("returns empty array for null structure", () => {
    expect(findPdfParts(null).length).toBe(0);
  });
});

describe("getPartFilename", () => {
  it("prefers dispositionParameters.filename", () => {
    const part = {
      dispositionParameters: { filename: "from-disposition.pdf" },
      parameters: { name: "from-content-type.pdf" },
    };
    expect(getPartFilename(part)).toBe("from-disposition.pdf");
  });

  it("falls back to parameters.name", () => {
    const part = {
      parameters: { name: "from-content-type.pdf" },
    };
    expect(getPartFilename(part)).toBe("from-content-type.pdf");
  });

  it("returns null when no filename available", () => {
    expect(getPartFilename({})).toBeNull();
  });
});
