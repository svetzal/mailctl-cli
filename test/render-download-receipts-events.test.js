import { describe, expect, it } from "bun:test";
import { renderDownloadReceiptsEvent } from "../src/render-download-receipts-events.js";

describe("renderDownloadReceiptsEvent", () => {
  it("renders llm-enabled message", () => {
    expect(renderDownloadReceiptsEvent({ type: "llm-enabled" })).toBe(
      "Using LLM (gpt-5-mini) for receipt data extraction",
    );
  });

  it("renders llm-disabled message", () => {
    expect(renderDownloadReceiptsEvent({ type: "llm-disabled" })).toBe(
      "OPENAI_API_KEY not set — using pattern-based extraction",
    );
  });

  it("renders llm-not-configured with error message", () => {
    const event = { type: "llm-not-configured", error: { message: "bad key" } };
    expect(renderDownloadReceiptsEvent(event)).toBe("   Warning: Could not initialize LLM broker: bad key");
  });

  it("renders search-account with name and user", () => {
    const event = { type: "search-account", name: "iCloud", user: "me@icloud.com" };
    expect(renderDownloadReceiptsEvent(event)).toBe("\nSearching iCloud (me@icloud.com)...");
  });

  it("renders mailbox-search-start with mailbox and message count", () => {
    const event = { type: "mailbox-search-start", mailbox: "INBOX", messageCount: 500 };
    expect(renderDownloadReceiptsEvent(event)).toBe("   INBOX (500 messages)...");
  });

  it("renders mailbox-candidates with count", () => {
    const event = { type: "mailbox-candidates", count: 12 };
    expect(renderDownloadReceiptsEvent(event)).toBe("      12 candidates");
  });

  it("renders mailbox-fetch-error with error message", () => {
    const event = { type: "mailbox-fetch-error", error: { message: "timeout" } };
    expect(renderDownloadReceiptsEvent(event)).toBe("      Fetch failed: timeout");
  });

  it("renders mailbox-lock-failed with mailbox and error message", () => {
    const event = { type: "mailbox-lock-failed", mailbox: "INBOX", error: { message: "access denied" } };
    expect(renderDownloadReceiptsEvent(event)).toBe("   Could not lock mailbox INBOX: access denied");
  });

  it("renders search-term-error with mailbox and error message", () => {
    const event = { type: "search-term-error", mailbox: "INBOX", error: { message: "server error" } };
    expect(renderDownloadReceiptsEvent(event)).toBe("   Search error in INBOX: server error");
  });

  it("renders vendor-filter-applied with totals and vendor from event", () => {
    const event = {
      type: "vendor-filter-applied",
      matchCount: 3,
      excludedCount: 7,
      vendor: "Acme Corp",
    };
    expect(renderDownloadReceiptsEvent(event)).toBe(`   Filtered to 3 of 10 messages matching vendor "Acme Corp"`);
  });

  it("renders subject-exclusions with count", () => {
    const event = { type: "subject-exclusions", count: 5 };
    expect(renderDownloadReceiptsEvent(event)).toBe("   Excluded 5 non-invoice subjects");
  });

  it("renders unique-receipts with count", () => {
    const event = { type: "unique-receipts", count: 8 };
    expect(renderDownloadReceiptsEvent(event)).toBe("   8 unique receipt emails");
  });

  it("renders using-pdf-content with uid", () => {
    const event = { type: "using-pdf-content", uid: 123 };
    expect(renderDownloadReceiptsEvent(event)).toBe("      Using PDF content for extraction (UID 123)");
  });

  it("renders docling-failed with uid and error", () => {
    const event = { type: "docling-failed", uid: 99, error: { message: "not found" } };
    expect(renderDownloadReceiptsEvent(event)).toBe("      Docling failed for UID 99: not found");
  });

  it("renders llm-extraction-failed with error message", () => {
    const event = { type: "llm-extraction-failed", error: { message: "api error" } };
    expect(renderDownloadReceiptsEvent(event)).toBe("   LLM extraction failed: api error");
  });

  it("renders skip-non-invoice with confidence when present", () => {
    const event = { type: "skip-non-invoice", vendor: "Spam Corp", confidence: 0.85 };
    expect(renderDownloadReceiptsEvent(event)).toBe(
      "   Skipping Spam Corp — classified as non-invoice (confidence: 0.85)",
    );
  });

  it("renders skip-non-invoice with 0.00 when confidence is undefined", () => {
    const event = { type: "skip-non-invoice", vendor: "Spam Corp", confidence: undefined };
    expect(renderDownloadReceiptsEvent(event)).toBe(
      "   Skipping Spam Corp — classified as non-invoice (confidence: 0.00)",
    );
  });

  it("renders skip-low-confidence with confidence", () => {
    const event = { type: "skip-low-confidence", vendor: "Sketchy Inc", confidence: 0.4 };
    expect(renderDownloadReceiptsEvent(event)).toBe("   Skipping Sketchy Inc — low confidence 0.40");
  });

  it("renders skip-existing-invoice with vendor and invoice number", () => {
    const event = { type: "skip-existing-invoice", vendor: "Acme", invoiceNumber: "INV-001" };
    expect(renderDownloadReceiptsEvent(event)).toBe("   Skipping Acme INV-001 — already exists");
  });

  it("renders skip-duplicate with label", () => {
    const event = { type: "skip-duplicate", label: "receipt.pdf" };
    expect(renderDownloadReceiptsEvent(event)).toBe("   Skipping receipt.pdf — duplicate content");
  });

  it("renders dry-run-pdf with filename", () => {
    const event = { type: "dry-run-pdf", filename: "receipt.pdf" };
    expect(renderDownloadReceiptsEvent(event)).toBe("   [DRY RUN] receipt.pdf");
  });

  it("renders dry-run-json with filename", () => {
    const event = { type: "dry-run-json", filename: "receipt.json" };
    expect(renderDownloadReceiptsEvent(event)).toBe("   [DRY RUN] receipt.json");
  });

  describe("renders downloaded-pdf with filename and KB size", () => {
    const event = { type: "downloaded-pdf", filename: "receipt.pdf", size: 51200 };

    it("includes the KB size", () => {
      expect(renderDownloadReceiptsEvent(event)).toContain("50 KB");
    });

    it("includes the filename", () => {
      expect(renderDownloadReceiptsEvent(event)).toContain("receipt.pdf");
    });
  });

  it("renders dry-run-metadata with filename and no PDF note", () => {
    const event = { type: "dry-run-metadata", filename: "receipt.json" };
    expect(renderDownloadReceiptsEvent(event)).toBe("   [DRY RUN] receipt.json (no PDF)");
  });

  it("renders wrote-metadata with filename and no PDF note", () => {
    const event = { type: "wrote-metadata", filename: "receipt.json" };
    expect(renderDownloadReceiptsEvent(event)).toBe("   Wrote metadata: receipt.json (no PDF)");
  });

  it("renders process-error with uid and error message", () => {
    const event = { type: "process-error", uid: 77, error: { message: "parse error" } };
    expect(renderDownloadReceiptsEvent(event)).toBe("   Error processing UID 77: parse error");
  });

  describe("renders download-summary as multi-line string with all stats", () => {
    const event = {
      type: "download-summary",
      stats: { found: 10, downloaded: 5, noPdf: 2, skipped: 1, alreadyHave: 1, errors: 1 },
    };

    it("contains the header line", () => {
      expect(renderDownloadReceiptsEvent(event)).toContain("=== Download Complete ===");
    });

    it("contains the found count", () => {
      expect(renderDownloadReceiptsEvent(event)).toContain("Found:       10");
    });

    it("contains the downloaded count", () => {
      expect(renderDownloadReceiptsEvent(event)).toContain("Downloaded:  5");
    });

    it("contains the no-PDF count", () => {
      expect(renderDownloadReceiptsEvent(event)).toContain("No PDF:      2");
    });

    it("contains the skipped count with label", () => {
      expect(renderDownloadReceiptsEvent(event)).toContain("Skipped:     1 (non-invoice or low confidence)");
    });

    it("contains the duplicates count", () => {
      expect(renderDownloadReceiptsEvent(event)).toContain("Duplicates:  1");
    });

    it("contains the errors count", () => {
      expect(renderDownloadReceiptsEvent(event)).toContain("Errors:      1");
    });
  });

  it("renders reprocess-start with output directory", () => {
    const event = { type: "reprocess-start", outputDir: "/receipts" };
    expect(renderDownloadReceiptsEvent(event)).toBe("Reprocessing receipts in /receipts...");
  });

  it("renders reprocess-dry-run with filename", () => {
    const event = { type: "reprocess-dry-run", filename: "receipt.pdf" };
    expect(renderDownloadReceiptsEvent(event)).toBe("  [DRY RUN] receipt.pdf — would reprocess");
  });

  it("renders reprocess-docling-failed with filename", () => {
    const event = { type: "reprocess-docling-failed", filename: "bad.pdf" };
    expect(renderDownloadReceiptsEvent(event)).toBe("  ❌ bad.pdf — docling conversion failed");
  });

  it("renders reprocess-dry-run-body with filename", () => {
    const event = { type: "reprocess-dry-run-body", filename: "receipt.pdf" };
    expect(renderDownloadReceiptsEvent(event)).toBe("  [DRY RUN] receipt.pdf — would reprocess (body snippet)");
  });

  it("renders reprocess-using-body with filename", () => {
    const event = { type: "reprocess-using-body", filename: "receipt.pdf" };
    expect(renderDownloadReceiptsEvent(event)).toBe("      Using stored body snippet for extraction (receipt.pdf)");
  });

  it("renders reprocess-skipped with filename", () => {
    const event = { type: "reprocess-skipped", filename: "receipt.pdf" };
    expect(renderDownloadReceiptsEvent(event)).toBe("  ⏭️  receipt.pdf — no PDF and no body snippet, skipped");
  });

  it("renders reprocess-no-data with filename", () => {
    const event = { type: "reprocess-no-data", filename: "receipt.pdf" };
    expect(renderDownloadReceiptsEvent(event)).toBe("  ❌ receipt.pdf — LLM extraction returned no data");
  });

  it("renders reprocess-reclassified with filename", () => {
    const event = { type: "reprocess-reclassified", filename: "receipt.pdf" };
    expect(renderDownloadReceiptsEvent(event)).toBe("  🗑️  receipt.pdf — reclassified as non-invoice, removing");
  });

  it("renders reprocess-updated with filename", () => {
    const event = { type: "reprocess-updated", filename: "receipt.pdf" };
    expect(renderDownloadReceiptsEvent(event)).toBe("  ✅ receipt.pdf — updated metadata");
  });

  it("renders reprocess-error with filename and error message", () => {
    const event = { type: "reprocess-error", filename: "receipt.pdf", error: { message: "failed" } };
    expect(renderDownloadReceiptsEvent(event)).toBe("  ❌ receipt.pdf — extraction failed: failed");
  });

  describe("renders reprocess-summary with all stats", () => {
    const event = {
      type: "reprocess-summary",
      reprocessed: 10,
      skipped: 2,
      reclassified: 1,
      errors: 0,
    };

    it("contains the reprocessed count", () => {
      expect(renderDownloadReceiptsEvent(event)).toContain("Reprocessed: 10");
    });

    it("contains the skipped count", () => {
      expect(renderDownloadReceiptsEvent(event)).toContain("Skipped: 2");
    });

    it("contains the reclassified count", () => {
      expect(renderDownloadReceiptsEvent(event)).toContain("Reclassified: 1");
    });

    it("contains the errors count", () => {
      expect(renderDownloadReceiptsEvent(event)).toContain("Errors: 0");
    });
  });

  it("returns null for unknown event types", () => {
    expect(renderDownloadReceiptsEvent({ type: "unknown-event" })).toBeNull();
  });
});
