/**
 * Guard test: every user-facing download-receipts event must have a render entry.
 * Fails loudly if a descriptor's render function is removed while the factory remains.
 */

import { describe, expect, it } from "bun:test";
import {
  budgetExceeded,
  doclingFailed,
  downloadedPdf,
  downloadSummary,
  dryRunJson,
  dryRunMetadata,
  dryRunPdf,
  emptyExtractionSkipped,
  llmDisabled,
  llmEnabled,
  llmExtractionFailed,
  llmNotConfigured,
  mailboxCandidates,
  mailboxFetchError,
  mailboxSearchStart,
  maxReached,
  messageStart,
  messageTimeout,
  processError,
  renderDownloadReceiptsEvent,
  reprocessDoclingFailed,
  reprocessDryRun,
  reprocessDryRunBody,
  reprocessError,
  reprocessNoData,
  reprocessReclassified,
  reprocessSkipped,
  reprocessStart,
  reprocessSummary,
  reprocessUpdated,
  reprocessUsingBody,
  searchAccount,
  searchTermError,
  skipDuplicate,
  skipExistingInvoice,
  skipLowConfidence,
  skipNonInvoice,
  subjectExclusions,
  uniqueReceipts,
  usingPdfContent,
  vendorFilterApplied,
  wroteMetadata,
} from "../src/receipts/download-receipts-event-factories.js";

const err = new Error("test error");

describe("download-receipts render coverage", () => {
  it("renders messageStart", () => {
    expect(renderDownloadReceiptsEvent(messageStart(0, 10, "Acme", "Invoice"))).not.toBeNull();
  });

  it("renders messageTimeout", () => {
    expect(renderDownloadReceiptsEvent(messageTimeout(42, 5000))).not.toBeNull();
  });

  it("renders maxReached", () => {
    expect(renderDownloadReceiptsEvent(maxReached(100))).not.toBeNull();
  });

  it("renders budgetExceeded", () => {
    expect(renderDownloadReceiptsEvent(budgetExceeded(300000))).not.toBeNull();
  });

  it("renders searchAccount", () => {
    expect(renderDownloadReceiptsEvent(searchAccount("iCloud", "me@example.com"))).not.toBeNull();
  });

  it("renders vendorFilterApplied", () => {
    expect(renderDownloadReceiptsEvent(vendorFilterApplied(5, 2, "Acme"))).not.toBeNull();
  });

  it("renders subjectExclusions", () => {
    expect(renderDownloadReceiptsEvent(subjectExclusions(3))).not.toBeNull();
  });

  it("renders uniqueReceipts", () => {
    expect(renderDownloadReceiptsEvent(uniqueReceipts(8))).not.toBeNull();
  });

  it("renders skipNonInvoice", () => {
    expect(renderDownloadReceiptsEvent(skipNonInvoice("Acme", 0.2))).not.toBeNull();
  });

  it("renders skipLowConfidence", () => {
    expect(renderDownloadReceiptsEvent(skipLowConfidence("Acme", 0.3))).not.toBeNull();
  });

  it("renders skipExistingInvoice", () => {
    expect(renderDownloadReceiptsEvent(skipExistingInvoice("Acme", "INV-001"))).not.toBeNull();
  });

  it("renders emptyExtractionSkipped", () => {
    expect(
      renderDownloadReceiptsEvent(emptyExtractionSkipped("Acme", "billing@acme.com", "2025-01-01")),
    ).not.toBeNull();
  });

  it("renders llmEnabled", () => {
    expect(renderDownloadReceiptsEvent(llmEnabled())).not.toBeNull();
  });

  it("renders llmDisabled", () => {
    expect(renderDownloadReceiptsEvent(llmDisabled())).not.toBeNull();
  });

  it("renders downloadSummary", () => {
    const stats = { found: 1, downloaded: 1, noPdf: 0, skipped: 0, alreadyHave: 0, errors: 0 };
    expect(renderDownloadReceiptsEvent(downloadSummary(stats))).not.toBeNull();
  });

  it("renders reprocessStart", () => {
    expect(renderDownloadReceiptsEvent(reprocessStart("/tmp/receipts"))).not.toBeNull();
  });

  it("renders reprocessDryRun", () => {
    expect(renderDownloadReceiptsEvent(reprocessDryRun("receipt.pdf"))).not.toBeNull();
  });

  it("renders reprocessDryRunBody", () => {
    expect(renderDownloadReceiptsEvent(reprocessDryRunBody("receipt.pdf"))).not.toBeNull();
  });

  it("renders reprocessUsingBody", () => {
    expect(renderDownloadReceiptsEvent(reprocessUsingBody("receipt.pdf"))).not.toBeNull();
  });

  it("renders reprocessSkipped", () => {
    expect(renderDownloadReceiptsEvent(reprocessSkipped("receipt.pdf", "already up to date"))).not.toBeNull();
  });

  it("renders reprocessNoData", () => {
    expect(renderDownloadReceiptsEvent(reprocessNoData("receipt.pdf"))).not.toBeNull();
  });

  it("renders reprocessReclassified", () => {
    expect(renderDownloadReceiptsEvent(reprocessReclassified("receipt.pdf"))).not.toBeNull();
  });

  it("renders reprocessUpdated", () => {
    expect(renderDownloadReceiptsEvent(reprocessUpdated("receipt.pdf"))).not.toBeNull();
  });

  it("renders reprocessSummary", () => {
    expect(renderDownloadReceiptsEvent(reprocessSummary(3, 1, 0, 0))).not.toBeNull();
  });

  it("renders mailboxSearchStart", () => {
    expect(renderDownloadReceiptsEvent(mailboxSearchStart("INBOX", 100))).not.toBeNull();
  });

  it("renders mailboxCandidates", () => {
    expect(renderDownloadReceiptsEvent(mailboxCandidates("INBOX", 5))).not.toBeNull();
  });

  it("renders skipDuplicate", () => {
    expect(renderDownloadReceiptsEvent(skipDuplicate("receipt.pdf"))).not.toBeNull();
  });

  it("renders dryRunPdf", () => {
    expect(renderDownloadReceiptsEvent(dryRunPdf("receipt.pdf"))).not.toBeNull();
  });

  it("renders dryRunJson", () => {
    expect(renderDownloadReceiptsEvent(dryRunJson("receipt.json"))).not.toBeNull();
  });

  it("renders dryRunMetadata", () => {
    expect(renderDownloadReceiptsEvent(dryRunMetadata("receipt.txt"))).not.toBeNull();
  });

  it("renders downloadedPdf", () => {
    expect(renderDownloadReceiptsEvent(downloadedPdf("receipt.pdf", 2048))).not.toBeNull();
  });

  it("renders wroteMetadata", () => {
    expect(renderDownloadReceiptsEvent(wroteMetadata("receipt.json"))).not.toBeNull();
  });

  it("renders usingPdfContent", () => {
    expect(renderDownloadReceiptsEvent(usingPdfContent(42))).not.toBeNull();
  });

  it("renders doclingFailed", () => {
    expect(renderDownloadReceiptsEvent(doclingFailed(err, 42))).not.toBeNull();
  });

  it("renders llmNotConfigured", () => {
    expect(renderDownloadReceiptsEvent(llmNotConfigured(err))).not.toBeNull();
  });

  it("renders llmExtractionFailed", () => {
    expect(renderDownloadReceiptsEvent(llmExtractionFailed(err))).not.toBeNull();
  });

  it("renders searchTermError", () => {
    expect(renderDownloadReceiptsEvent(searchTermError(err, "INBOX"))).not.toBeNull();
  });

  it("renders mailboxFetchError", () => {
    expect(renderDownloadReceiptsEvent(mailboxFetchError(err))).not.toBeNull();
  });

  it("renders processError", () => {
    expect(renderDownloadReceiptsEvent(processError(err, 77))).not.toBeNull();
  });

  it("renders reprocessDoclingFailed", () => {
    expect(renderDownloadReceiptsEvent(reprocessDoclingFailed(err, "receipt.pdf"))).not.toBeNull();
  });

  it("renders reprocessError", () => {
    expect(renderDownloadReceiptsEvent(reprocessError(err, "receipt.pdf"))).not.toBeNull();
  });
});
