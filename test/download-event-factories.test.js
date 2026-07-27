import { describe, expect, it } from "bun:test";
import { downloadEvents } from "../src/download-event-factories.js";

describe("downloadEvents.downloadAccountStart", () => {
  it("builds the download-account-start event", () => {
    expect(downloadEvents.downloadAccountStart("TestAccount", "user@example.com")).toEqual({
      type: "download-account-start",
      name: "TestAccount",
      user: "user@example.com",
    });
  });
});

describe("downloadEvents.downloadBizCount", () => {
  it("builds the download-biz-count event", () => {
    expect(downloadEvents.downloadBizCount(7)).toEqual({
      type: "download-biz-count",
      count: 7,
    });
  });
});

describe("downloadEvents.downloadDryRun", () => {
  it("builds the download-dry-run event", () => {
    expect(downloadEvents.downloadDryRun("receipt.pdf")).toEqual({
      type: "download-dry-run",
      filename: "receipt.pdf",
    });
  });
});

describe("downloadEvents.duplicateContent", () => {
  it("builds the duplicate-content event", () => {
    expect(downloadEvents.duplicateContent("receipt.pdf")).toEqual({
      type: "duplicate-content",
      filename: "receipt.pdf",
    });
  });
});

describe("downloadEvents.downloaded", () => {
  it("builds the downloaded event", () => {
    expect(downloadEvents.downloaded("receipt.pdf", 1024)).toEqual({
      type: "downloaded",
      filename: "receipt.pdf",
      size: 1024,
    });
  });
});

describe("downloadEvents.fetchStructureError", () => {
  it("builds the fetch-structure-error event", () => {
    const err = new Error("failed");
    expect(downloadEvents.fetchStructureError(err, 42)).toEqual({
      type: "fetch-structure-error",
      severity: "error",
      error: err,
      uid: 42,
    });
  });
});

describe("downloadEvents.invalidPdf", () => {
  it("builds the invalid-pdf event", () => {
    const err = new Error("not a pdf");
    expect(downloadEvents.invalidPdf(err, "receipt.pdf")).toEqual({
      type: "invalid-pdf",
      severity: "warning",
      error: err,
      filename: "receipt.pdf",
    });
  });
});

describe("downloadEvents.downloadFailed", () => {
  it("builds the download-failed event", () => {
    const err = new Error("timeout");
    expect(downloadEvents.downloadFailed(err, "receipt.pdf")).toEqual({
      type: "download-failed",
      severity: "error",
      error: err,
      filename: "receipt.pdf",
    });
  });
});

describe("downloadEvents.hashReadError", () => {
  it("builds the hash-read-error event", () => {
    const err = new Error("permission denied");
    expect(downloadEvents.hashReadError(err, "receipt.pdf")).toEqual({
      type: "hash-read-error",
      severity: "warning",
      error: err,
      file: "receipt.pdf",
    });
  });
});
