import { describe, expect, it } from "bun:test";
import {
  downloadAccountStart,
  downloadBizCount,
  downloadDryRun,
  downloaded,
  duplicateContent,
} from "../src/download-event-factories.js";

describe("downloadAccountStart", () => {
  it("has type download-account-start", () => {
    expect(downloadAccountStart("TestAccount", "user@example.com").type).toBe("download-account-start");
  });

  it("has name field", () => {
    expect(downloadAccountStart("TestAccount", "user@example.com").name).toBe("TestAccount");
  });

  it("has user field", () => {
    expect(downloadAccountStart("TestAccount", "user@example.com").user).toBe("user@example.com");
  });
});

describe("downloadBizCount", () => {
  it("has type download-biz-count", () => {
    expect(downloadBizCount(7).type).toBe("download-biz-count");
  });

  it("has count field", () => {
    expect(downloadBizCount(7).count).toBe(7);
  });
});

describe("downloadDryRun", () => {
  it("has type download-dry-run", () => {
    expect(downloadDryRun("receipt.pdf").type).toBe("download-dry-run");
  });

  it("has filename field", () => {
    expect(downloadDryRun("receipt.pdf").filename).toBe("receipt.pdf");
  });
});

describe("duplicateContent", () => {
  it("has type duplicate-content", () => {
    expect(duplicateContent("receipt.pdf").type).toBe("duplicate-content");
  });

  it("has filename field", () => {
    expect(duplicateContent("receipt.pdf").filename).toBe("receipt.pdf");
  });
});

describe("downloaded", () => {
  it("has type downloaded", () => {
    expect(downloaded("receipt.pdf", 1024).type).toBe("downloaded");
  });

  it("has filename field", () => {
    expect(downloaded("receipt.pdf", 1024).filename).toBe("receipt.pdf");
  });

  it("has size field", () => {
    expect(downloaded("receipt.pdf", 1024).size).toBe(1024);
  });
});
