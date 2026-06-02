import { describe, expect, it } from "bun:test";
import { createEventRenderer, renderSharedEvent } from "../src/render-shared-events.js";

// ── renderSharedEvent ─────────────────────────────────────────────────────────

describe("renderSharedEvent", () => {
  describe("renders mailbox-lock-failed events", () => {
    const result = renderSharedEvent({ type: "mailbox-lock-failed", mailbox: "INBOX", error: { message: "busy" } });
    it("includes the mailbox name", () => expect(result).toContain("INBOX"));
    it("includes the error message", () => expect(result).toContain("busy"));
  });

  describe("renders search-failed events", () => {
    const result = renderSharedEvent({ type: "search-failed", mailbox: "Sent", error: { message: "timeout" } });
    it("includes the mailbox name", () => expect(result).toContain("Sent"));
    it("includes the error message", () => expect(result).toContain("timeout"));
  });

  it("returns null for unknown event types", () => {
    expect(renderSharedEvent({ type: "unknown-event" })).toBeNull();
  });
});

// ── createEventRenderer ───────────────────────────────────────────────────────

describe("createEventRenderer", () => {
  it("dispatches to the matching handler", () => {
    const render = createEventRenderer({ foo: (e) => `foo:${e.value}` });
    expect(render({ type: "foo", value: "bar" })).toBe("foo:bar");
  });

  it("falls back to renderSharedEvent for unknown types by default", () => {
    const render = createEventRenderer({});
    const result = render({ type: "mailbox-lock-failed", mailbox: "INBOX", error: { message: "busy" } });
    expect(result).toContain("INBOX");
  });

  it("returns null for unknown types when fallback is disabled", () => {
    const render = createEventRenderer({ foo: () => "foo" }, { fallback: false });
    expect(render({ type: "unknown" })).toBeNull();
  });

  it("does not fall back to shared events when fallback is disabled", () => {
    const render = createEventRenderer({}, { fallback: false });
    expect(render({ type: "mailbox-lock-failed", mailbox: "X", error: { message: "e" } })).toBeNull();
  });

  it("handler takes precedence over shared fallback", () => {
    const render = createEventRenderer({ "mailbox-lock-failed": () => "overridden" });
    expect(render({ type: "mailbox-lock-failed", mailbox: "X", error: { message: "e" } })).toBe("overridden");
  });

  it("wraps rendered text in red ANSI codes when severity is error", () => {
    const render = createEventRenderer({ fail: () => "something failed" });
    expect(render({ type: "fail", severity: "error" })).toBe("\x1b[31msomething failed\x1b[0m");
  });

  it("wraps rendered text in yellow ANSI codes when severity is warning", () => {
    const render = createEventRenderer({ warn: () => "something warned" });
    expect(render({ type: "warn", severity: "warning" })).toBe("\x1b[33msomething warned\x1b[0m");
  });

  it("does not add color when severity is absent", () => {
    const render = createEventRenderer({ info: () => "just info" });
    expect(render({ type: "info" })).toBe("just info");
  });

  it("returns null (not colored null) when no handler matches and fallback is disabled", () => {
    const render = createEventRenderer({}, { fallback: false });
    expect(render({ type: "unknown", severity: "error" })).toBeNull();
  });
});
