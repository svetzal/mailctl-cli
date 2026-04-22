import { describe, expect, it } from "bun:test";
import { createEventRenderer, renderSharedEvent } from "../src/render-shared-events.js";

// ── renderSharedEvent ─────────────────────────────────────────────────────────

describe("renderSharedEvent", () => {
  it("renders mailbox-lock-failed events", () => {
    const result = renderSharedEvent({ type: "mailbox-lock-failed", mailbox: "INBOX", error: { message: "busy" } });
    expect(result).toContain("INBOX");
    expect(result).toContain("busy");
  });

  it("renders search-failed events", () => {
    const result = renderSharedEvent({ type: "search-failed", mailbox: "Sent", error: { message: "timeout" } });
    expect(result).toContain("Sent");
    expect(result).toContain("timeout");
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
});
