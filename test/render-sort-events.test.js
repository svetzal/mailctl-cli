import { describe, expect, it } from "bun:test";
import { renderSortEvent } from "../src/render-sort-events.js";

describe("renderSortEvent", () => {
  it("renders account-start with name and user", () => {
    const event = { type: "account-start", name: "iCloud", user: "me@icloud.com" };
    expect(renderSortEvent(event)).toBe("\n📬 Sorting iCloud (me@icloud.com)...");
  });

  it("renders folder-exists with folder name", () => {
    const event = { type: "folder-exists", folder: "Receipts/Business" };
    expect(renderSortEvent(event)).toBe("   ✅ Folder exists: Receipts/Business");
  });

  it("renders folder-created with folder name", () => {
    const event = { type: "folder-created", folder: "Receipts/Personal" };
    expect(renderSortEvent(event)).toBe("   📁 Created folder: Receipts/Personal");
  });

  it("renders folder-error with folder and error message", () => {
    const event = { type: "folder-error", folder: "Receipts/Business", error: { message: "permission denied" } };
    expect(renderSortEvent(event)).toBe("   ❌ Failed to create Receipts/Business: permission denied");
  });

  it("renders scan-complete with count", () => {
    const event = { type: "scan-complete", count: 15 };
    expect(renderSortEvent(event)).toBe("   🔍 Found 15 receipt messages to sort");
  });

  it("renders move-dry-run with icon, count, and label", () => {
    const event = { type: "move-dry-run", icon: "📄", count: 3, label: "Business" };
    expect(renderSortEvent(event)).toBe("   📄 [DRY RUN] Would move 3 messages: Business");
  });

  it("renders moved with icon, count, and label", () => {
    const event = { type: "moved", icon: "🏢", count: 5, label: "Business" };
    expect(renderSortEvent(event)).toBe("   🏢 Moved 5 messages: Business");
  });

  it("renders move-error with label and error message", () => {
    const event = { type: "move-error", label: "Business", error: { message: "timeout" } };
    expect(renderSortEvent(event)).toBe("   ⚠️  Move failed (Business): timeout");
  });

  it("returns null for unknown event types", () => {
    expect(renderSortEvent({ type: "unknown-event" })).toBeNull();
  });
});
