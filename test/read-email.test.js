import { describe, expect, it } from "bun:test";
import { buildReadResult, formatReadResultText } from "../src/read-email.js";

/**
 * Create a minimal mock of a mailparser ParsedMail object.
 * @param {Partial<{date: Date, from: {text:string}, to: {text:string}, subject: string, text: string, html: string|null, attachments: Array, headers: Map}>} overrides
 */
function mockParsed(overrides = {}) {
  return {
    date: new Date("2025-01-15T12:00:00Z"),
    from: { text: "Sender Name <sender@example.com>" },
    to: { text: "Me <me@example.com>" },
    subject: "Test Subject",
    text: "Hello, this is the body.",
    html: null,
    attachments: [],
    headers: new Map(),
    ...overrides,
  };
}

describe("buildReadResult", () => {
  describe("maps parsed email fields to result object", () => {
    const parsed = mockParsed();
    const result = buildReadResult(parsed, "icloud", "42", { maxBody: 1000, includeHeaders: false });

    it("sets account", () => {
      expect(result.account).toBe("icloud");
    });

    it("sets uid", () => {
      expect(result.uid).toBe(42);
    });

    it("sets from", () => {
      expect(result.from).toBe("Sender Name <sender@example.com>");
    });

    it("sets to", () => {
      expect(result.to).toBe("Me <me@example.com>");
    });

    it("sets subject", () => {
      expect(result.subject).toBe("Test Subject");
    });

    it("sets body", () => {
      expect(result.body).toBe("Hello, this is the body.");
    });
  });

  it("truncates body to maxBody characters", () => {
    const parsed = mockParsed({ text: "A".repeat(200) });
    const result = buildReadResult(parsed, "icloud", "1", { maxBody: 50, includeHeaders: false });

    expect(result.body.length).toBe(50);
  });

  describe("includes bodyHtml only when HTML is present", () => {
    it("has bodyHtml property when HTML is present", () => {
      const withHtml = mockParsed({ html: "<p>Hello</p>" });
      expect(buildReadResult(withHtml, "icloud", "1", { maxBody: 1000, includeHeaders: false })).toHaveProperty(
        "bodyHtml",
      );
    });

    it("does not have bodyHtml property when HTML is absent", () => {
      const withoutHtml = mockParsed({ html: null });
      expect(buildReadResult(withoutHtml, "icloud", "1", { maxBody: 1000, includeHeaders: false })).not.toHaveProperty(
        "bodyHtml",
      );
    });
  });

  describe("includes headers only when includeHeaders is true", () => {
    const parsed = mockParsed();
    parsed.headers.set("x-mailer", "TestMailer");

    it("has headers property when includeHeaders is true", () => {
      const withHeaders = buildReadResult(parsed, "icloud", "1", { maxBody: 1000, includeHeaders: true });
      expect(withHeaders).toHaveProperty("headers");
    });

    it("does not have headers property when includeHeaders is false", () => {
      const withoutHeaders = buildReadResult(parsed, "icloud", "1", { maxBody: 1000, includeHeaders: false });
      expect(withoutHeaders).not.toHaveProperty("headers");
    });
  });

  it("extracts unsubscribe links from HTML body", () => {
    const parsed = mockParsed({
      html: '<a href="https://example.com/unsubscribe?id=1">Unsubscribe</a>',
    });
    const result = buildReadResult(parsed, "icloud", "1", { maxBody: 1000, includeHeaders: false });

    expect(result.unsubscribeLinks).toContain("https://example.com/unsubscribe?id=1");
  });

  it("returns empty attachments array when message has no attachments", () => {
    const parsed = mockParsed({ attachments: [] });
    const result = buildReadResult(parsed, "icloud", "1", { maxBody: 1000, includeHeaders: false });

    expect(result.attachments).toEqual([]);
  });

  it("falls back to HTML-to-text body when no plain text is present", () => {
    const parsed = mockParsed({ text: "", html: "<p>From HTML</p>" });
    const result = buildReadResult(parsed, "icloud", "1", { maxBody: 1000, includeHeaders: false });

    expect(result.body).toContain("From HTML");
  });

  describe("converts string uid to integer", () => {
    const result = buildReadResult(mockParsed(), "icloud", "99", { maxBody: 100, includeHeaders: false });

    it("has the correct uid value", () => {
      expect(result.uid).toBe(99);
    });

    it("uid is a number type", () => {
      expect(typeof result.uid).toBe("number");
    });
  });

  it("lists attachment filenames, using '(unnamed)' for nameless attachments", () => {
    const parsed = mockParsed({
      attachments: [{ filename: "receipt.pdf" }, { filename: null }],
    });
    const result = buildReadResult(parsed, "icloud", "1", { maxBody: 1000, includeHeaders: false });

    expect(result.attachments).toEqual(["receipt.pdf", "(unnamed)"]);
  });
});

describe("formatReadResultText", () => {
  describe("includes date, from, to, and subject lines", () => {
    const parsed = mockParsed();
    const text = formatReadResultText(parsed, { maxBody: 1000, showHeaders: false, showRaw: false });

    it("contains Date", () => {
      expect(text).toContain("Date:");
    });

    it("contains From line", () => {
      expect(text).toContain("From: Sender Name <sender@example.com>");
    });

    it("contains To line", () => {
      expect(text).toContain("To: Me <me@example.com>");
    });

    it("contains Subject line", () => {
      expect(text).toContain("Subject: Test Subject");
    });
  });

  describe("lists attachment filenames when present", () => {
    const parsed = mockParsed({
      attachments: [{ filename: "invoice.pdf" }, { filename: null }],
    });
    const text = formatReadResultText(parsed, { maxBody: 1000, showHeaders: false, showRaw: false });

    it("contains Attachments section header", () => {
      expect(text).toContain("Attachments:");
    });

    it("contains the named attachment filename", () => {
      expect(text).toContain("invoice.pdf");
    });

    it("contains (unnamed) for nameless attachments", () => {
      expect(text).toContain("(unnamed)");
    });
  });

  it("omits Attachments line when there are no attachments", () => {
    const parsed = mockParsed({ attachments: [] });
    const text = formatReadResultText(parsed, { maxBody: 1000, showHeaders: false, showRaw: false });

    expect(text).not.toContain("Attachments:");
  });

  it("truncates body text to maxBody characters", () => {
    const parsed = mockParsed({ text: "B".repeat(200) });
    const text = formatReadResultText(parsed, { maxBody: 50, showHeaders: false, showRaw: false });

    // Body section appears after newline; count Bs in the text
    const bCount = (text.match(/B/g) || []).length;
    expect(bCount).toBe(50);
  });

  it("shows raw HTML when showRaw is true and HTML is present", () => {
    const parsed = mockParsed({ html: "<b>Bold</b>" });
    const text = formatReadResultText(parsed, { maxBody: 1000, showHeaders: false, showRaw: true });

    expect(text).toContain("<b>Bold</b>");
  });

  it("shows plain text body when showRaw is false", () => {
    const parsed = mockParsed({ text: "plain text content" });
    const text = formatReadResultText(parsed, { maxBody: 1000, showHeaders: false, showRaw: false });

    expect(text).toContain("plain text content");
  });

  it("shows '(no text body)' when body is empty", () => {
    const parsed = mockParsed({ text: "", html: null });
    const text = formatReadResultText(parsed, { maxBody: 1000, showHeaders: false, showRaw: false });

    expect(text).toContain("(no text body)");
  });

  describe("includes headers section when showHeaders is true", () => {
    const parsed = mockParsed();
    parsed.headers.set("x-custom", "header-value");
    const text = formatReadResultText(parsed, { maxBody: 1000, showHeaders: true, showRaw: false });

    it("contains the headers section divider", () => {
      expect(text).toContain("--- Headers ---");
    });

    it("contains the custom header name", () => {
      expect(text).toContain("x-custom");
    });
  });
});
