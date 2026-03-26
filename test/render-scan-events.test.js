import { describe, it, expect } from "bun:test";
import { renderScanEvent } from "../src/render-scan-events.js";

describe("renderScanEvent", () => {
  it("renders scan-account-start with name and user", () => {
    const event = { type: "scan-account-start", name: "iCloud", user: "me@icloud.com" };
    expect(renderScanEvent(event)).toBe("🔍 Scanning iCloud (me@icloud.com)...");
  });

  it("renders scan-account-complete with count", () => {
    const event = { type: "scan-account-complete", count: 42 };
    expect(renderScanEvent(event)).toBe("   ✅ Found 42 receipt-like messages");
  });

  it("returns null for unknown event types", () => {
    expect(renderScanEvent({ type: "unknown-event" })).toBeNull();
  });
});
