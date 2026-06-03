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
  it("passes numeric uid through unchanged as a number", () => {
    const result = buildReadResult(mockParsed(), "icloud", 42, { maxBody: 1000, includeHeaders: false });
    expect(result.uid).toBe(42);
    expect(typeof result.uid).toBe("number");
  });
});

describe("buildReadJson", () => {
  it("passes includeHeaders through to buildReadResult", () => {
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
    expect(withHeaders).toHaveProperty("headers");
    expect(withoutHeaders).not.toHaveProperty("headers");
  });
});

// ── formatReadOutput ──────────────────────────────────────────────────────────

describe("formatReadOutput", () => {
  it("returns JSON string when json is true", () => {
    const result = formatReadOutput(true, mockParsed(), "icloud", "42", {});
    expect(JSON.parse(result)).toHaveProperty("account", "icloud");
  });

  it("returns text string containing body text when json is false", () => {
    const result = formatReadOutput(false, mockParsed(), "icloud", "42", {});
    expect(typeof result).toBe("string");
    expect(result).toContain("Body text");
  });

  it("defaults maxBody to 3000 when opts.maxBody is not set", () => {
    const longBody = "x".repeat(4000);
    const result = formatReadOutput(false, mockParsed({ text: longBody }), "icloud", "42", {});
    expect(result.length).toBeLessThan(longBody.length);
  });
});
