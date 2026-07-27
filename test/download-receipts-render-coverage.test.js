/**
 * Guard test: every user-facing download-receipts event must have a render entry.
 * Fails loudly if a descriptor's render function is removed while the factory remains.
 */

import { describe, expect, it } from "bun:test";
import { receiptEvents, renderDownloadReceiptsEvent } from "../src/receipts/download-receipts-event-factories.js";

const err = new Error("test error");

describe("download-receipts render coverage", () => {
  it("renders messageStart", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.messageStart(0, 10, "Acme", "Invoice"))).not.toBeNull();
  });

  it("renders messageTimeout", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.messageTimeout(42, 5000))).not.toBeNull();
  });

  it("renders maxReached", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.maxReached(100))).not.toBeNull();
  });

  it("renders budgetExceeded", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.budgetExceeded(300000))).not.toBeNull();
  });

  it("renders searchAccount", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.searchAccount("iCloud", "me@example.com"))).not.toBeNull();
  });

  it("renders vendorFilterApplied", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.vendorFilterApplied(5, 2, "Acme"))).not.toBeNull();
  });

  it("renders subjectExclusions", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.subjectExclusions(3))).not.toBeNull();
  });

  it("renders uniqueReceipts", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.uniqueReceipts(8))).not.toBeNull();
  });

  it("renders skipNonInvoice", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.skipNonInvoice("Acme", 0.2))).not.toBeNull();
  });

  it("renders skipLowConfidence", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.skipLowConfidence("Acme", 0.3))).not.toBeNull();
  });

  it("renders skipExistingInvoice", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.skipExistingInvoice("Acme", "INV-001"))).not.toBeNull();
  });

  it("renders emptyExtractionSkipped", () => {
    expect(
      renderDownloadReceiptsEvent(receiptEvents.emptyExtractionSkipped("Acme", "billing@acme.com", "2025-01-01")),
    ).not.toBeNull();
  });

  it("renders llmEnabled", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.llmEnabled())).not.toBeNull();
  });

  it("renders llmDisabled", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.llmDisabled())).not.toBeNull();
  });

  it("renders reprocessStart", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.reprocessStart("/tmp/receipts"))).not.toBeNull();
  });

  it("renders reprocessDryRun", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.reprocessDryRun("receipt.pdf"))).not.toBeNull();
  });

  it("renders reprocessDryRunBody", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.reprocessDryRunBody("receipt.pdf"))).not.toBeNull();
  });

  it("renders reprocessUsingBody", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.reprocessUsingBody("receipt.pdf"))).not.toBeNull();
  });

  it("renders reprocessSkipped", () => {
    expect(
      renderDownloadReceiptsEvent(receiptEvents.reprocessSkipped("receipt.pdf", "already up to date")),
    ).not.toBeNull();
  });

  it("renders reprocessNoData", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.reprocessNoData("receipt.pdf"))).not.toBeNull();
  });

  it("renders reprocessReclassified", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.reprocessReclassified("receipt.pdf"))).not.toBeNull();
  });

  it("renders reprocessUpdated", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.reprocessUpdated("receipt.pdf"))).not.toBeNull();
  });

  it("renders reprocessSummary", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.reprocessSummary(3, 1, 0, 0))).not.toBeNull();
  });

  it("renders mailboxSearchStart", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.mailboxSearchStart("INBOX", 100))).not.toBeNull();
  });

  it("renders mailboxCandidates", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.mailboxCandidates("INBOX", 5))).not.toBeNull();
  });

  it("renders skipDuplicate", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.skipDuplicate("receipt.pdf"))).not.toBeNull();
  });

  it("renders dryRunPdf", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.dryRunPdf("receipt.pdf"))).not.toBeNull();
  });

  it("renders dryRunJson", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.dryRunJson("receipt.json"))).not.toBeNull();
  });

  it("renders dryRunMetadata", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.dryRunMetadata("receipt.txt"))).not.toBeNull();
  });

  it("renders downloadedPdf", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.downloadedPdf("receipt.pdf", 2048))).not.toBeNull();
  });

  it("renders wroteMetadata", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.wroteMetadata("receipt.json"))).not.toBeNull();
  });

  it("renders usingPdfContent", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.usingPdfContent(42))).not.toBeNull();
  });

  it("renders doclingFailed", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.doclingFailed(err, 42))).not.toBeNull();
  });

  it("renders llmNotConfigured", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.llmNotConfigured(err))).not.toBeNull();
  });

  it("renders llmExtractionFailed", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.llmExtractionFailed(err))).not.toBeNull();
  });

  it("renders searchTermError", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.searchTermError(err, "INBOX"))).not.toBeNull();
  });

  it("renders mailboxFetchError", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.mailboxFetchError(err))).not.toBeNull();
  });

  it("renders processError", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.processError(err, 77))).not.toBeNull();
  });

  it("renders reprocessDoclingFailed", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.reprocessDoclingFailed(err, "receipt.pdf"))).not.toBeNull();
  });

  it("renders reprocessError", () => {
    expect(renderDownloadReceiptsEvent(receiptEvents.reprocessError(err, "receipt.pdf"))).not.toBeNull();
  });
});
