import { describe, expect, it, mock } from "bun:test";
import { pdfToText, resolveExtractionText } from "../src/pdf-converter.js";

// ── resolveExtractionText ─────────────────────────────────────────────────────

describe("resolveExtractionText", () => {
  it("returns bodyText when pdfAttachments is empty", () => {
    const mockFs = /** @type {any} */ ({ exists: mock(() => false), writeFile: mock(() => {}), rm: mock(() => {}) });
    const mockSubprocess = /** @type {any} */ ({ execFileSync: mock(() => {}) });

    const result = resolveExtractionText([], "email body text", 1, mockFs, mockSubprocess);

    expect(result).toBe("email body text");
  });

  it("returns bodyText when pdfAttachments array is empty regardless of bodyText content", () => {
    const mockFs = /** @type {any} */ ({ exists: mock(() => false), writeFile: mock(() => {}), rm: mock(() => {}) });
    const mockSubprocess = /** @type {any} */ ({ execFileSync: mock(() => {}) });

    const result = resolveExtractionText([], "some content", 42, mockFs, mockSubprocess);

    expect(result).toBe("some content");
  });

  it("returns bodyText when pdfToText returns null (docling not found)", () => {
    // docling not present — fs.exists returns false for docling path
    const mockFs = /** @type {any} */ ({
      exists: mock((p) => !p.includes("docling")),
      writeFile: mock(() => {}),
      rm: mock(() => {}),
      mkdir: mock(() => {}),
      readdir: mock(() => []),
    });
    const mockSubprocess = /** @type {any} */ ({ execFileSync: mock(() => {}) });
    const pdfAttachments = [{ content: Buffer.from("%PDF-fake") }];

    const result = resolveExtractionText(pdfAttachments, "fallback body", 1, mockFs, mockSubprocess);

    expect(result).toBe("fallback body");
  });

  it("emits using-pdf-content event when docling succeeds", () => {
    const events = [];
    const mockFs = /** @type {any} */ ({
      exists: mock((p) => {
        if (p.includes("docling")) return true;
        return false;
      }),
      writeFile: mock(() => {}),
      rm: mock(() => {}),
      mkdir: mock(() => {}),
      readdir: mock(() => ["output.md"]),
      readText: mock(() => "# Invoice\nTotal: $49.00"),
    });
    const mockSubprocess = /** @type {any} */ ({ execFileSync: mock(() => {}) });
    const pdfAttachments = [{ content: Buffer.from("%PDF-fake") }];

    resolveExtractionText(pdfAttachments, "body text", 5, mockFs, mockSubprocess, (e) => events.push(e));

    const event = events.find((e) => e.type === "using-pdf-content");
    expect(event).toBeDefined();
    expect(event.uid).toBe(5);
  });

  it("returns pdf markdown when docling succeeds", () => {
    const mockFs = /** @type {any} */ ({
      exists: mock((p) => {
        if (p.includes("docling")) return true;
        return false;
      }),
      writeFile: mock(() => {}),
      rm: mock(() => {}),
      mkdir: mock(() => {}),
      readdir: mock(() => ["output.md"]),
      readText: mock(() => "# Invoice\nTotal: $49.00"),
    });
    const mockSubprocess = /** @type {any} */ ({ execFileSync: mock(() => {}) });
    const pdfAttachments = [{ content: Buffer.from("%PDF-fake") }];

    const result = resolveExtractionText(pdfAttachments, "body text", 5, mockFs, mockSubprocess);

    expect(result).toBe("# Invoice\nTotal: $49.00");
  });
});

// ── pdfToText ─────────────────────────────────────────────────────────────────

describe("pdfToText", () => {
  it("returns null when docling is not installed", () => {
    const mockFs = /** @type {any} */ ({ exists: mock(() => false) });
    const mockSubprocess = /** @type {any} */ ({ execFileSync: mock(() => {}) });

    const result = pdfToText("/some/file.pdf", mockFs, mockSubprocess);

    expect(result).toBeNull();
  });

  it("returns null when docling produces no markdown file", () => {
    const mockFs = /** @type {any} */ ({
      exists: mock(() => true),
      mkdir: mock(() => {}),
      readdir: mock(() => []), // no .md file
      rm: mock(() => {}),
    });
    const mockSubprocess = /** @type {any} */ ({ execFileSync: mock(() => {}) });

    const result = pdfToText("/some/file.pdf", mockFs, mockSubprocess);

    expect(result).toBeNull();
  });

  it("returns markdown content when docling succeeds", () => {
    const mockFs = /** @type {any} */ ({
      exists: mock(() => true),
      mkdir: mock(() => {}),
      readdir: mock(() => ["converted.md"]),
      readText: mock(() => "# Invoice\n\nTotal: $49.00\n"),
      rm: mock(() => {}),
    });
    const mockSubprocess = /** @type {any} */ ({ execFileSync: mock(() => {}) });

    const result = pdfToText("/some/file.pdf", mockFs, mockSubprocess);

    expect(result).toBe("# Invoice\n\nTotal: $49.00");
  });

  it("returns null and logs error when docling subprocess throws", () => {
    const mockFs = /** @type {any} */ ({
      exists: mock(() => true),
      mkdir: mock(() => {}),
      rm: mock(() => {}),
    });
    const mockSubprocess = /** @type {any} */ ({
      execFileSync: mock(() => {
        throw new Error("docling timeout");
      }),
    });

    const result = pdfToText("/some/file.pdf", mockFs, mockSubprocess);

    expect(result).toBeNull();
  });
});
