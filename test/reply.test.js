import { describe, it, expect } from "bun:test";
import { buildReplyHeaders, buildReplyBody, buildEditorTemplate, parseEditorContent } from "../src/reply.js";

/**
 * Create a minimal mock of a mailparser ParsedMail object.
 */
function mockParsed(overrides = {}) {
  const headers = new Map();
  if (overrides._references) {
    headers.set("references", overrides._references);
    delete overrides._references;
  }
  return {
    date: new Date("2025-06-15T10:00:00Z"),
    from: { text: "Alice <alice@example.com>" },
    to: { text: "Bob <bob@example.com>" },
    subject: "Hello there",
    text: "This is the original message body.",
    html: null,
    messageId: "<original-123@example.com>",
    replyTo: undefined,
    headers,
    attachments: [],
    ...overrides,
  };
}

describe("buildReplyHeaders", () => {
  it("sets To from original From address", () => {
    const parsed = mockParsed();
    const headers = buildReplyHeaders(parsed, "bob@example.com");

    expect(headers.to).toBe("Alice <alice@example.com>");
  });

  it("uses Reply-To when present", () => {
    const parsed = mockParsed({ replyTo: { text: "reply@example.com" } });
    const headers = buildReplyHeaders(parsed, "bob@example.com");

    expect(headers.to).toBe("reply@example.com");
  });

  it("prepends 'Re: ' to subject", () => {
    const parsed = mockParsed({ subject: "Meeting tomorrow" });
    const headers = buildReplyHeaders(parsed, "bob@example.com");

    expect(headers.subject).toBe("Re: Meeting tomorrow");
  });

  it("does not double-prepend 'Re: Re: '", () => {
    const parsed = mockParsed({ subject: "Re: Meeting tomorrow" });
    const headers = buildReplyHeaders(parsed, "bob@example.com");

    expect(headers.subject).toBe("Re: Meeting tomorrow");
  });

  it("handles case-insensitive 'RE: ' prefix", () => {
    const parsed = mockParsed({ subject: "RE: Already replied" });
    const headers = buildReplyHeaders(parsed, "bob@example.com");

    expect(headers.subject).toBe("RE: Already replied");
  });

  it("sets In-Reply-To to original Message-ID", () => {
    const parsed = mockParsed({ messageId: "<abc@example.com>" });
    const headers = buildReplyHeaders(parsed, "bob@example.com");

    expect(headers.inReplyTo).toBe("<abc@example.com>");
  });

  it("builds References chain from existing References + Message-ID", () => {
    const parsed = mockParsed({
      messageId: "<msg-3@example.com>",
      _references: "<msg-1@example.com> <msg-2@example.com>",
    });
    const headers = buildReplyHeaders(parsed, "bob@example.com");

    expect(headers.references).toBe("<msg-1@example.com> <msg-2@example.com> <msg-3@example.com>");
  });

  it("sets References to just Message-ID when no existing References", () => {
    const parsed = mockParsed({ messageId: "<first@example.com>" });
    const headers = buildReplyHeaders(parsed, "bob@example.com");

    expect(headers.references).toBe("<first@example.com>");
  });
});

describe("buildReplyBody", () => {
  it("includes user message and quoted original", () => {
    const parsed = mockParsed({ text: "Original text here." });
    const body = buildReplyBody("Thanks for the info!", parsed);

    expect(body).toContain("Thanks for the info!");
    expect(body).toContain("> Original text here.");
  });

  it("includes attribution line with date and sender", () => {
    const parsed = mockParsed();
    const body = buildReplyBody("Got it.", parsed);

    expect(body).toContain("On 2025-06-15, Alice <alice@example.com> wrote:");
  });

  it("truncates long quotes at maxQuoteLines", () => {
    const longText = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`).join("\n");
    const parsed = mockParsed({ text: longText });
    const body = buildReplyBody("Short reply.", parsed, { maxQuoteLines: 10 });

    const quotedLines = body.split("\n").filter((l) => l.startsWith("> "));
    // 10 quoted lines + 1 truncation notice
    expect(quotedLines.length).toBe(11);
    expect(body).toContain("[... 90 more lines truncated]");
  });

  it("handles HTML-only originals by converting to text for quoting", () => {
    const parsed = mockParsed({ text: "", html: "<p>Hello from HTML</p>" });
    const body = buildReplyBody("Replying to HTML email.", parsed);

    expect(body).toContain("> Hello from HTML");
  });

  it("handles empty original body gracefully", () => {
    const parsed = mockParsed({ text: "", html: null });
    const body = buildReplyBody("Reply to empty.", parsed);

    expect(body).toContain("Reply to empty.");
    expect(body).toContain("> ");
  });
});

describe("buildEditorTemplate", () => {
  it("includes comment lines with headers", () => {
    const headers = { to: "alice@example.com", subject: "Re: Hello", inReplyTo: "", references: "" };
    const template = buildEditorTemplate(headers, "> quoted text");

    expect(template).toContain("# Reply to: alice@example.com");
    expect(template).toContain("# Subject: Re: Hello");
  });

  it("includes quoted body", () => {
    const headers = { to: "alice@example.com", subject: "Re: Hello", inReplyTo: "", references: "" };
    const template = buildEditorTemplate(headers, "> Original text");

    expect(template).toContain("> Original text");
  });
});

describe("parseEditorContent", () => {
  it("strips comment lines starting with #", () => {
    const content = "# Comment\n# Another comment\nActual reply text\n> quoted";
    const result = parseEditorContent(content);

    expect(result).toBe("Actual reply text\n> quoted");
  });

  it("trims whitespace from result", () => {
    const content = "# Comment\n\n  Reply here  \n\n";
    const result = parseEditorContent(content);

    expect(result).toBe("Reply here");
  });

  it("returns empty string when only comments", () => {
    const content = "# Only comments\n# Nothing else";
    const result = parseEditorContent(content);

    expect(result).toBe("");
  });
});
