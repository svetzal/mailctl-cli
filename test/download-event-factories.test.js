import { describe, expect, it } from "bun:test";
import {
  downloadAccountStart,
  downloadBizCount,
  downloadDryRun,
  downloaded,
  downloadFailed,
  duplicateContent,
  fetchStructureError,
  invalidPdf,
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

describe("fetchStructureError", () => {
  it("has type fetch-structure-error", () => {
    expect(fetchStructureError(new Error("failed"), 42).type).toBe("fetch-structure-error");
  });

  it("has severity error", () => {
    expect(fetchStructureError(new Error("failed"), 42).severity).toBe("error");
  });

  it("has error field", () => {
    const err = new Error("failed");
    expect(fetchStructureError(err, 42).error).toBe(err);
  });

  it("has uid field", () => {
    expect(fetchStructureError(new Error("failed"), 42).uid).toBe(42);
  });
});

describe("invalidPdf", () => {
  it("has type invalid-pdf", () => {
    expect(invalidPdf(new Error("not a pdf"), "receipt.pdf").type).toBe("invalid-pdf");
  });

  it("has severity warning", () => {
    expect(invalidPdf(new Error("not a pdf"), "receipt.pdf").severity).toBe("warning");
  });

  it("has error field", () => {
    const err = new Error("not a pdf");
    expect(invalidPdf(err, "receipt.pdf").error).toBe(err);
  });

  it("has filename field", () => {
    expect(invalidPdf(new Error("not a pdf"), "receipt.pdf").filename).toBe("receipt.pdf");
  });
});

describe("downloadFailed", () => {
  it("has type download-failed", () => {
    expect(downloadFailed(new Error("timeout"), "receipt.pdf").type).toBe("download-failed");
  });

  it("has severity error", () => {
    expect(downloadFailed(new Error("timeout"), "receipt.pdf").severity).toBe("error");
  });

  it("has error field", () => {
    const err = new Error("timeout");
    expect(downloadFailed(err, "receipt.pdf").error).toBe(err);
  });

  it("has filename field", () => {
    expect(downloadFailed(new Error("timeout"), "receipt.pdf").filename).toBe("receipt.pdf");
  });
});
