import { describe, expect, it } from "bun:test";
import { createReceiptRun, createReceiptRunState, createReceiptWriteContext } from "../src/receipts/receipt-run.js";

// ── Fake gateways ────────────────────────────────────────────────────────────

/** @returns {import('../src/gateways/fs-gateway.js').FileSystemGateway} */
function makeFakeFs(overrides = {}) {
  return /** @type {any} */ ({
    exists: () => false,
    readdir: () => [],
    readJson: () => ({}),
    readText: () => "",
    readBuffer: () => Buffer.from(""),
    writeFile: () => {},
    writeJson: () => {},
    rm: () => {},
    mkdir: () => {},
    ...overrides,
  });
}

/** @returns {import('../src/gateways/subprocess-gateway.js').SubprocessGateway} */
const fakeSubprocess = /** @type {any} */ ({ execFileSync: () => "" });

// ── createReceiptWriteContext ─────────────────────────────────────────────────

describe("createReceiptWriteContext", () => {
  it("returns an empty usedPaths set", () => {
    const ctx = createReceiptWriteContext(
      { outputDir: "/tmp/receipts", dryRun: false, includeEmpty: false, fs: makeFakeFs(), subprocess: fakeSubprocess },
      () => {},
    );
    expect(ctx.usedPaths).toBeInstanceOf(Set);
    expect(ctx.usedPaths.size).toBe(0);
  });

  it("populates existingInvoiceNumbers from sidecars in outputDir", () => {
    const fs = makeFakeFs({
      exists: (/** @type {string} */ p) => p === "/out",
      readdir: (/** @type {string} */ dir) => {
        if (dir === "/out") return ["2025"];
        if (dir === "/out/2025") return ["03"];
        if (dir === "/out/2025/03") return ["receipt.json"];
        return [];
      },
      readJson: () => ({ invoice_number: "INV-2025-001" }),
    });
    const ctx = createReceiptWriteContext(
      { outputDir: "/out", dryRun: false, includeEmpty: false, fs, subprocess: fakeSubprocess },
      () => {},
    );
    expect(ctx.existingInvoiceNumbers.has("INV-2025-001")).toBe(true);
  });

  it("seeds existingHashes as an empty set when no PDFs exist", () => {
    const ctx = createReceiptWriteContext(
      { outputDir: "/tmp/empty", dryRun: true, includeEmpty: false, fs: makeFakeFs(), subprocess: fakeSubprocess },
      () => {},
    );
    expect(ctx.existingHashes).toBeInstanceOf(Set);
    expect(ctx.existingHashes.size).toBe(0);
  });

  describe("when the output directory cannot be read", () => {
    const fs = makeFakeFs({
      exists: () => true,
      readdir: () => {
        throw new Error("EACCES: permission denied");
      },
    });

    it("returns a context with indexErrors > 0", () => {
      const ctx = createReceiptWriteContext(
        { outputDir: "/out", dryRun: false, includeEmpty: false, fs, subprocess: fakeSubprocess },
        () => {},
      );
      expect(ctx.indexErrors).toBeGreaterThan(0);
    });

    it("still emits an onProgress event for each index-load failure", () => {
      const events = [];
      createReceiptWriteContext(
        { outputDir: "/out", dryRun: false, includeEmpty: false, fs, subprocess: fakeSubprocess },
        (event) => events.push(event),
      );
      expect(events.length).toBeGreaterThan(0);
    });
  });
});

// ── createReceiptRun ──────────────────────────────────────────────────────────

describe("createReceiptRun", () => {
  it("maps resolvedOpts.perMessageTimeoutMs to limits.perMessageTimeoutMs", () => {
    const resolvedOpts = { maxMessages: null, perMessageTimeoutMs: 5000, budgetMs: null };
    const writeContext = createReceiptWriteContext(
      { outputDir: "/tmp", dryRun: false, includeEmpty: false, fs: makeFakeFs(), subprocess: fakeSubprocess },
      () => {},
    );
    const run = createReceiptRun({
      resolvedOpts,
      writeContext,
      llm: null,
      processMessage: () => {},
      startedAt: 0,
      vendorFilter: null,
      onProgress: () => {},
    });
    expect(run.limits.perMessageTimeoutMs).toBe(5000);
  });

  it("zeroes all run state counters", () => {
    const resolvedOpts = { maxMessages: null, perMessageTimeoutMs: 30000, budgetMs: null };
    const writeContext = createReceiptWriteContext(
      { outputDir: "/tmp", dryRun: false, includeEmpty: false, fs: makeFakeFs(), subprocess: fakeSubprocess },
      () => {},
    );
    const run = createReceiptRun({
      resolvedOpts,
      writeContext,
      llm: null,
      processMessage: () => {},
      startedAt: 0,
      vendorFilter: null,
      onProgress: () => {},
    });
    const { stats, records, processedCount, stopped } = run.runState;
    expect(stats.found).toBe(0);
    expect(stats.downloaded).toBe(0);
    expect(stats.errors).toBe(0);
    expect(records).toEqual([]);
    expect(processedCount).toBe(0);
    expect(stopped).toBe(false);
  });

  it("sets vendorFilter to null when not provided", () => {
    const resolvedOpts = { maxMessages: null, perMessageTimeoutMs: 30000, budgetMs: null };
    const writeContext = createReceiptWriteContext(
      { outputDir: "/tmp", dryRun: false, includeEmpty: false, fs: makeFakeFs(), subprocess: fakeSubprocess },
      () => {},
    );
    const run = createReceiptRun({
      resolvedOpts,
      writeContext,
      llm: null,
      processMessage: () => {},
      startedAt: 0,
      vendorFilter: null,
      onProgress: () => {},
    });
    expect(run.vendorFilter).toBeNull();
  });
});

// ── createReceiptRunState ─────────────────────────────────────────────────────

describe("createReceiptRunState", () => {
  it("returns all stats counters at zero", () => {
    const state = createReceiptRunState();
    expect(state.stats.found).toBe(0);
    expect(state.stats.downloaded).toBe(0);
    expect(state.stats.noPdf).toBe(0);
    expect(state.stats.skipped).toBe(0);
    expect(state.stats.skippedEmpty).toBe(0);
    expect(state.stats.alreadyHave).toBe(0);
    expect(state.stats.errors).toBe(0);
  });

  it("returns independent state objects on each call", () => {
    const a = createReceiptRunState();
    const b = createReceiptRunState();
    a.stats.found = 5;
    expect(b.stats.found).toBe(0);
  });
});
