import { describe, expect, it } from "bun:test";
import { buildReadJson, buildReadResult, formatReadOutput } from "../src/format-read.js";

function mockParsed(overrides = {}) {
  return {
    date: new Date("2025-01-15T12:00:00Z"),
    from: { text: "Sender <sender@example.com>" },
    to: { text: "Me <me@example.com>" },
    subject: "Test",
    text: "Body text",
    html: null,
    attachments: [],
    headers: new Map(),
    ...overrides,
  };
}

describe("buildReadResult", () => {
  describe("passes numeric uid through unchanged", () => {
    const result = buildReadResult(mockParsed(), "icloud", 42, { maxBody: 1000, includeHeaders: false });
    it("has uid value 42", () => expect(result.uid).toBe(42));
    it("has uid of type number", () => expect(typeof result.uid).toBe("number"));
  });
});

describe("buildReadJson", () => {
  describe("passes includeHeaders through to buildReadResult", () => {
    const parsed = mockParsed();
    parsed.headers.set("x-custom", "value");
    const withHeaders = buildReadJson(parsed, "icloud", "1", {
      maxBody: 1000,
      maxBodyExplicit: false,
      includeHeaders: true,
    });
    const withoutHeaders = buildReadJson(parsed, "icloud", "1", {
      maxBody: 1000,
      maxBodyExplicit: false,
      includeHeaders: false,
    });
    it("includes headers property when includeHeaders is true", () => expect(withHeaders).toHaveProperty("headers"));
    it("omits headers property when includeHeaders is false", () =>
      expect(withoutHeaders).not.toHaveProperty("headers"));
  });
});

// ── formatReadOutput ──────────────────────────────────────────────────────────

describe("formatReadOutput", () => {
  it("returns JSON string when json is true", () => {
    const result = formatReadOutput(true, mockParsed(), "icloud", "42", {});
    expect(JSON.parse(result)).toHaveProperty("account", "icloud");
  });

  describe("returns text string when json is false", () => {
    const result = formatReadOutput(false, mockParsed(), "icloud", "42", {});
    it("result is a string", () => expect(typeof result).toBe("string"));
    it("result contains body text", () => expect(result).toContain("Body text"));
  });

  it("defaults maxBody to 3000 when opts.maxBody is not set", () => {
    const longBody = "x".repeat(4000);
    const result = formatReadOutput(false, mockParsed({ text: longBody }), "icloud", "42", {});
    expect(result.length).toBeLessThan(longBody.length);
  });
});
