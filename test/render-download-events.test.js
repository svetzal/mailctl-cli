import { describe, it, expect } from "bun:test";
import { renderDownloadEvent } from "../src/render-download-events.js";

describe("renderDownloadEvent", () => {
  it("renders download-account-start with name and user", () => {
    const event = { type: "download-account-start", name: "iCloud", user: "me@icloud.com" };
    expect(renderDownloadEvent(event)).toBe("\n📎 Downloading from iCloud (me@icloud.com)...");
  });

  it("renders download-biz-count with count", () => {
    const event = { type: "download-biz-count", count: 10 };
    expect(renderDownloadEvent(event)).toBe("   🏢 10 business receipt emails to check for PDFs");
  });

  it("renders fetch-structure-error with uid and error message", () => {
    const event = { type: "fetch-structure-error", uid: 42, error: { message: "not found" } };
    expect(renderDownloadEvent(event)).toBe("      ⚠️  Could not fetch structure for UID 42: not found");
  });

  it("renders download-dry-run with filename", () => {
    const event = { type: "download-dry-run", filename: "receipt.pdf" };
    expect(renderDownloadEvent(event)).toBe("   📄 [DRY RUN] Would download: receipt.pdf");
  });

  it("renders invalid-pdf with filename", () => {
    const event = { type: "invalid-pdf", filename: "bad.pdf" };
    expect(renderDownloadEvent(event)).toBe("      ⚠️  Skipping bad.pdf — not a valid PDF");
  });

  it("renders duplicate-content with filename", () => {
    const event = { type: "duplicate-content", filename: "dup.pdf" };
    expect(renderDownloadEvent(event)).toBe("      ⏭️  Skipping dup.pdf — duplicate content");
  });

  it("renders downloaded with filename and KB size", () => {
    const event = { type: "downloaded", filename: "receipt.pdf", size: 51200 };
    expect(renderDownloadEvent(event)).toBe("   📄 Downloaded: receipt.pdf (50 KB)");
  });

  it("renders download-failed with filename and error message", () => {
    const event = { type: "download-failed", filename: "broken.pdf", error: { message: "timeout" } };
    expect(renderDownloadEvent(event)).toBe("      ⚠️  Download failed for broken.pdf: timeout");
  });

  it("returns null for unknown event types", () => {
    expect(renderDownloadEvent({ type: "unknown-event" })).toBeNull();
  });
});
