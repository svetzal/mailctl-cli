import { describe, expect, it } from "bun:test";
import { findAttachmentParts, findPdfParts, getPartFilename, isSignaturePart } from "../src/attachment-parts.js";

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

/**
 * Simulates an S/MIME-signed receipt email (e.g. Anthropic "Your receipt …"):
 * multipart/signed
 *   ├── multipart/mixed
 *   │   ├── text/plain  (part 1.1)
 *   │   └── application/pdf  (part 1.2) — the actual receipt PDF
 *   └── application/pkcs7-signature  smime.p7s  (part 2)
 */
function smimeSignedWithPdf() {
  return {
    type: "multipart/signed",
    childNodes: [
      {
        type: "multipart/mixed",
        childNodes: [
          { type: "text/plain", part: "1.1", size: 500 },
          {
            type: "application/pdf",
            part: "1.2",
            size: 72000,
            disposition: "attachment",
            dispositionParameters: { filename: "receipt.pdf" },
            parameters: { name: "receipt.pdf" },
          },
        ],
      },
      {
        type: "application/pkcs7-signature",
        part: "2",
        size: 4096,
        disposition: "attachment",
        dispositionParameters: { filename: "smime.p7s" },
        parameters: { name: "smime.p7s" },
      },
    ],
  };
}

/**
 * Same structure but with the signature listed before the PDF — tests that
 * the default-selection logic always prefers the document.
 */
function smimeSignedSignatureFirst() {
  return {
    type: "multipart/signed",
    childNodes: [
      {
        type: "application/pkcs7-signature",
        part: "1",
        size: 4096,
        dispositionParameters: { filename: "smime.p7s" },
      },
      {
        type: "application/pdf",
        part: "2",
        size: 72000,
        dispositionParameters: { filename: "receipt.pdf" },
      },
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
  describe("returns only the PDF when message has inline CID image + PDF attachment", () => {
    const parts = findAttachmentParts(m365InlineImagePlusPdf());

    it("returns one part", () => {
      expect(parts.length).toBe(1);
    });

    it("the part has type application/pdf", () => {
      expect(parts[0].type).toBe("application/pdf");
    });

    it("the part is part 2", () => {
      expect(parts[0].part).toBe("2");
    });

    it("the part has the correct filename", () => {
      expect(parts[0].filename).toBe("Invoice_509320833.pdf");
    });
  });

  it("returns empty array for plain text message", () => {
    const parts = findAttachmentParts(plainTextOnly());
    expect(parts.length).toBe(0);
  });

  it("excludes all inline CID images", () => {
    const parts = findAttachmentParts(multipleInlineImages());
    expect(parts.length).toBe(0);
  });

  describe("includes images without CID as attachments", () => {
    const parts = findAttachmentParts(imageWithoutCid());

    it("returns one part", () => {
      expect(parts.length).toBe(1);
    });

    it("the part has type image/png", () => {
      expect(parts[0].type).toBe("image/png");
    });

    it("the part has the correct filename", () => {
      expect(parts[0].filename).toBe("screenshot.png");
    });
  });

  it("returns empty array for null structure", () => {
    expect(findAttachmentParts(null).length).toBe(0);
  });
});

describe("findPdfParts", () => {
  describe("finds PDF in M365 inline image + PDF structure", () => {
    const parts = findPdfParts(m365InlineImagePlusPdf());

    it("returns one part", () => {
      expect(parts.length).toBe(1);
    });

    it("the part is part 2", () => {
      expect(parts[0].part).toBe("2");
    });

    it("the part has the correct filename", () => {
      expect(parts[0].filename).toBe("Invoice_509320833.pdf");
    });
  });

  describe("detects PDF via Content-Type parameters name when dispositionParameters is missing", () => {
    const parts = findPdfParts(pdfFilenameOnlyInContentType());

    it("returns one part", () => {
      expect(parts.length).toBe(1);
    });

    it("the part is part 2", () => {
      expect(parts[0].part).toBe("2");
    });

    it("the part has the correct filename", () => {
      expect(parts[0].filename).toBe("receipt.pdf");
    });
  });

  it("returns empty array when no PDF present", () => {
    const parts = findPdfParts(multipleInlineImages());
    expect(parts.length).toBe(0);
  });

  it("returns empty array for null structure", () => {
    expect(findPdfParts(null).length).toBe(0);
  });
});

describe("findAttachmentParts — S/MIME signed messages", () => {
  describe("returns only the PDF from a multipart/signed message", () => {
    const parts = findAttachmentParts(smimeSignedWithPdf());

    it("returns exactly one part", () => {
      expect(parts.length).toBe(1);
    });

    it("the part has type application/pdf", () => {
      expect(parts[0].type).toBe("application/pdf");
    });

    it("does not include smime.p7s", () => {
      const hasSignature = parts.some((p) => p.filename === "smime.p7s");
      expect(hasSignature).toBe(false);
    });
  });

  describe("excludes smime.p7s even when listed before the PDF", () => {
    const parts = findAttachmentParts(smimeSignedSignatureFirst());

    it("returns exactly one part", () => {
      expect(parts.length).toBe(1);
    });

    it("the part has type application/pdf", () => {
      expect(parts[0].type).toBe("application/pdf");
    });
  });
});

describe("isSignaturePart", () => {
  it("returns true for application/pkcs7-signature", () => {
    expect(isSignaturePart({ type: "application/pkcs7-signature" })).toBe(true);
  });

  it("returns true for application/x-pkcs7-signature", () => {
    expect(isSignaturePart({ type: "application/x-pkcs7-signature" })).toBe(true);
  });

  it("returns true when filename is smime.p7s (case-insensitive)", () => {
    expect(
      isSignaturePart({ type: "application/octet-stream", dispositionParameters: { filename: "smime.p7s" } }),
    ).toBe(true);
  });

  it("returns false for application/pdf", () => {
    expect(isSignaturePart({ type: "application/pdf" })).toBe(false);
  });

  it("returns false when type is absent", () => {
    expect(isSignaturePart({})).toBe(false);
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
