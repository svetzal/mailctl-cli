import { describe, expect, it } from "bun:test";
import { buildThreadJson, formatThreadText } from "../src/format-thread.js";

function makeMsg(overrides = {}) {
  return {
    subject: "Hello",
    date: new Date("2025-01-15T12:00:00Z"),
    from: "a@b.com",
    fromName: "Alice",
    snippet: "Snippet text",
    body: "Full body text",
    ...overrides,
  };
}

// ── formatThreadText ──────────────────────────────────────────────────────────

describe("formatThreadText", () => {
  it("returns 'No thread messages found.' for empty array", () => {
    expect(formatThreadText([])).toBe("No thread messages found.");
  });

  it("uses subject from last message in thread header", () => {
    const messages = [makeMsg({ subject: "First" }), makeMsg({ subject: "Re: First" })];
    expect(formatThreadText(messages)).toContain("Re: First");
  });

  it("shows singular 'message' when thread has one message", () => {
    expect(formatThreadText([makeMsg()])).toContain("1 message)");
  });

  it("shows plural 'messages' when thread has multiple messages", () => {
    expect(formatThreadText([makeMsg(), makeMsg({ subject: "Re: Hello" })])).toContain("2 messages)");
  });

  it("appends subject-match fallback note when opts.fallback is true", () => {
    expect(formatThreadText([makeMsg()], { fallback: true })).toContain("subject match");
  });

  it("omits fallback note when opts.fallback is false", () => {
    expect(formatThreadText([makeMsg()], { fallback: false })).not.toContain("subject match");
  });

  it("formats each message with 1-based index", () => {
    const text = formatThreadText([makeMsg(), makeMsg({ subject: "Re: Hello" })]);
    expect(text).toContain("  1. ");
    expect(text).toContain("  2. ");
  });

  it("shows snippet when opts.full is false", () => {
    expect(formatThreadText([makeMsg({ snippet: "Unique snippet" })], { full: false })).toContain("Unique snippet");
  });

  it("shows full body when opts.full is true", () => {
    expect(formatThreadText([makeMsg({ body: "Unique full body" })], { full: true })).toContain("Unique full body");
  });

  it("uses 'fromName <from>' format when fromName is present", () => {
    expect(formatThreadText([makeMsg({ fromName: "Alice", from: "a@b.com" })])).toContain("Alice <a@b.com>");
  });

  it("falls back to from address only when fromName is absent", () => {
    const text = formatThreadText([makeMsg({ fromName: undefined, from: "a@b.com" })]);
    expect(text).toContain("a@b.com");
    expect(text).not.toContain("undefined");
  });

  it("shows 'unknown' when date is null", () => {
    expect(formatThreadText([makeMsg({ date: null })])).toContain("unknown");
  });
});

// ── buildThreadJson ────────────────────────────────────────────────────────────

describe("buildThreadJson", () => {
  it("includes account field", () => {
    expect(buildThreadJson("iCloud", 3, false, []).account).toBe("iCloud");
  });

  it("includes threadSize field", () => {
    expect(buildThreadJson("iCloud", 3, false, []).threadSize).toBe(3);
  });

  it("includes fallback field", () => {
    expect(buildThreadJson("iCloud", 3, true, []).fallback).toBe(true);
  });

  it("passes messages array through unchanged", () => {
    const messages = [{ subject: "Hello" }];
    expect(buildThreadJson("iCloud", 1, false, messages).messages).toBe(messages);
  });
});
