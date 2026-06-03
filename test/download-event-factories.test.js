import { describe, expect, it } from "bun:test";
import {
  downloadAccountStart,
  downloadBizCount,
  downloadDryRun,
  downloaded,
  downloadFailed,
  duplicateContent,
  fetchStructureError,
  hashReadError,
  invalidPdf,
} from "../src/download-event-factories.js";

describe("downloadAccountStart", () => {
  it("builds the download-account-start event", () => {
    expect(downloadAccountStart("TestAccount", "user@example.com")).toEqual({
      type: "download-account-start",
      name: "TestAccount",
      user: "user@example.com",
    });
  });
});

describe("downloadBizCount", () => {
  it("builds the download-biz-count event", () => {
    expect(downloadBizCount(7)).toEqual({
      type: "download-biz-count",
      count: 7,
    });
  });
});

describe("downloadDryRun", () => {
  it("builds the download-dry-run event", () => {
    expect(downloadDryRun("receipt.pdf")).toEqual({
      type: "download-dry-run",
      filename: "receipt.pdf",
    });
  });
});

describe("duplicateContent", () => {
  it("builds the duplicate-content event", () => {
    expect(duplicateContent("receipt.pdf")).toEqual({
      type: "duplicate-content",
      filename: "receipt.pdf",
    });
  });
});

describe("downloaded", () => {
  it("builds the downloaded event", () => {
    expect(downloaded("receipt.pdf", 1024)).toEqual({
      type: "downloaded",
      filename: "receipt.pdf",
      size: 1024,
    });
  });
});

describe("fetchStructureError", () => {
  it("builds the fetch-structure-error event", () => {
    const err = new Error("failed");
    expect(fetchStructureError(err, 42)).toEqual({
      type: "fetch-structure-error",
      severity: "error",
      error: err,
      uid: 42,
    });
  });
});

describe("invalidPdf", () => {
  it("builds the invalid-pdf event", () => {
    const err = new Error("not a pdf");
    expect(invalidPdf(err, "receipt.pdf")).toEqual({
      type: "invalid-pdf",
      severity: "warning",
      error: err,
      filename: "receipt.pdf",
    });
  });
});

describe("downloadFailed", () => {
  it("builds the download-failed event", () => {
    const err = new Error("timeout");
    expect(downloadFailed(err, "receipt.pdf")).toEqual({
      type: "download-failed",
      severity: "error",
      error: err,
      filename: "receipt.pdf",
    });
  });
});

describe("hashReadError", () => {
  it("builds the hash-read-error event", () => {
    const err = new Error("permission denied");
    expect(hashReadError(err, "receipt.pdf")).toEqual({
      type: "hash-read-error",
      severity: "warning",
      error: err,
      file: "receipt.pdf",
    });
  });
});
