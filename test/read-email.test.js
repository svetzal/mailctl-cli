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
  it("maps parsed email fields to result object", () => {
    const parsed = mockParsed();
    const result = buildReadResult(parsed, "icloud", "42", { maxBody: 1000, includeHeaders: false });

    expect(result.account).toBe("icloud");
    expect(result.uid).toBe(42);
    expect(result.from).toBe("Sender Name <sender@example.com>");
    expect(result.to).toBe("Me <me@example.com>");
    expect(result.subject).toBe("Test Subject");
    expect(result.body).toBe("Hello, this is the body.");
  });

  it("truncates body to maxBody characters", () => {
    const parsed = mockParsed({ text: "A".repeat(200) });
    const result = buildReadResult(parsed, "icloud", "1", { maxBody: 50, includeHeaders: false });

    expect(result.body.length).toBe(50);
  });

  it("includes bodyHtml only when HTML is present", () => {
    const withHtml = mockParsed({ html: "<p>Hello</p>" });
    const withoutHtml = mockParsed({ html: null });

    expect(buildReadResult(withHtml, "icloud", "1", { maxBody: 1000, includeHeaders: false })).toHaveProperty(
      "bodyHtml",
    );
    expect(buildReadResult(withoutHtml, "icloud", "1", { maxBody: 1000, includeHeaders: false })).not.toHaveProperty(
      "bodyHtml",
    );
  });

  it("includes headers only when includeHeaders is true", () => {
    const parsed = mockParsed();
    parsed.headers.set("x-mailer", "TestMailer");

    const withHeaders = buildReadResult(parsed, "icloud", "1", { maxBody: 1000, includeHeaders: true });
    const withoutHeaders = buildReadResult(parsed, "icloud", "1", { maxBody: 1000, includeHeaders: false });

    expect(withHeaders).toHaveProperty("headers");
    expect(withoutHeaders).not.toHaveProperty("headers");
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

  it("converts string uid to integer", () => {
    const result = buildReadResult(mockParsed(), "icloud", "99", { maxBody: 100, includeHeaders: false });

    expect(result.uid).toBe(99);
    expect(typeof result.uid).toBe("number");
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
  it("includes date, from, to, and subject lines", () => {
    const parsed = mockParsed();
    const text = formatReadResultText(parsed, { maxBody: 1000, showHeaders: false, showRaw: false });

    expect(text).toContain("Date:");
    expect(text).toContain("From: Sender Name <sender@example.com>");
    expect(text).toContain("To: Me <me@example.com>");
    expect(text).toContain("Subject: Test Subject");
  });

  it("lists attachment filenames when present", () => {
    const parsed = mockParsed({
      attachments: [{ filename: "invoice.pdf" }, { filename: null }],
    });
    const text = formatReadResultText(parsed, { maxBody: 1000, showHeaders: false, showRaw: false });

    expect(text).toContain("Attachments:");
    expect(text).toContain("invoice.pdf");
    expect(text).toContain("(unnamed)");
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

  it("includes headers section when showHeaders is true", () => {
    const parsed = mockParsed();
    parsed.headers.set("x-custom", "header-value");
    const text = formatReadResultText(parsed, { maxBody: 1000, showHeaders: true, showRaw: false });

    expect(text).toContain("--- Headers ---");
    expect(text).toContain("x-custom");
  });
});
