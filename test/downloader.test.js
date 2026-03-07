import { describe, it, expect, mock } from "bun:test";
import { downloadReceipts } from "../src/downloader.js";

const PDF_BYTES = Buffer.from("%PDF-1.4 fake content");
const OTHER_BYTES = Buffer.from("not a pdf");

/** Minimal IMAP client mock for download tests. */
function makeMockClient(pdfContent = PDF_BYTES) {
  return {
    getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
    fetch: mock((_uid, opts) => {
      async function* gen() {
        yield {
          bodyStructure: {
            type: "multipart/mixed",
            childNodes: [
              { type: "text/plain", part: "1", size: 100 },
              {
                type: "application/pdf", part: "2", size: pdfContent.length,
                disposition: "attachment",
                dispositionParameters: { filename: "invoice.pdf" },
              },
            ],
          },
        };
      }
      return gen();
    }),
    download: mock(() => {
      async function* gen() { yield pdfContent; }
      return Promise.resolve({ content: gen() });
    }),
  };
}

/** Standard business-receipt scan result. */
function makeReceipt(uid = 1, address = "billing@vendor.com", mailbox = "INBOX") {
  return { uid, address, name: "Vendor", mailbox, date: new Date("2025-03-07"), subject: "Receipt" };
}

/** Deps that skip all real I/O. */
function makeBaseDeps(client, overrides = {}) {
  const manifest = {};
  const written = [];

  return {
    loadClassifications: () => ({ "billing@vendor.com": "business" }),
    loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
    loadManifest: () => manifest,
    saveManifest: mock((m) => { Object.assign(manifest, m); }),
    readOutputDir: (_dir) => [],
    readFileForHash: (_path) => Buffer.alloc(0),
    ensureOutputDir: mock(() => {}),
    writeFile: mock((path, data) => { written.push({ path, data }); }),
    forEachAccount: async (_accounts, fn) => fn(client, { name: "Test", user: "test@example.com" }),
    listMailboxes: () => Promise.resolve([{ path: "INBOX", specialUse: null, flags: new Set() }]),
    filterScanMailboxes: () => ["INBOX"],
    scanForReceipts: () => Promise.resolve([makeReceipt()]),
    _written: written,
    _manifest: manifest,
    ...overrides,
  };
}

describe("downloadReceipts", () => {
  it("downloads PDF for a business-classified receipt", async () => {
    const client = makeMockClient();
    const deps = makeBaseDeps(client);

    const stats = await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);

    expect(stats.downloaded).toBe(1);
    expect(deps.writeFile).toHaveBeenCalledTimes(1);
  });

  it("does NOT download PDF for a personal-classified receipt", async () => {
    const client = makeMockClient();
    const deps = makeBaseDeps(client, {
      loadClassifications: () => ({ "billing@vendor.com": "personal" }),
    });

    const stats = await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);

    expect(stats.downloaded).toBe(0);
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it("does NOT download PDF for an unclassified receipt", async () => {
    const client = makeMockClient();
    const deps = makeBaseDeps(client, {
      loadClassifications: () => ({}),
    });

    const stats = await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);

    expect(stats.downloaded).toBe(0);
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it("skips message already recorded in the manifest", async () => {
    const client = makeMockClient();
    const manifestKey = "test@example.com:INBOX:1";
    const deps = makeBaseDeps(client, {
      loadManifest: () => ({ [manifestKey]: { status: "downloaded", filename: "old.pdf" } }),
    });

    const stats = await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);

    expect(stats.alreadyHave).toBe(1);
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it("skips file that has duplicate content hash", async () => {
    const client = makeMockClient();
    const { createHash } = await import("crypto");
    const existingHash = createHash("sha256").update(PDF_BYTES).digest("hex");

    const deps = makeBaseDeps(client, {
      // Simulate existing file with same content
      readOutputDir: () => ["existing.pdf"],
      readFileForHash: () => PDF_BYTES,
    });

    const stats = await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);

    expect(stats.alreadyHave).toBe(1);
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it("increments noPdf when email has no PDF attachment", async () => {
    const clientNoPdf = {
      getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
      fetch: mock(() => {
        async function* gen() {
          yield {
            bodyStructure: {
              type: "text/plain",
              part: "1",
              size: 100,
            },
          };
        }
        return gen();
      }),
      download: mock(() => Promise.resolve({ content: (async function*() {})() })),
    };

    const deps = makeBaseDeps(clientNoPdf);
    const stats = await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);

    expect(stats.noPdf).toBe(1);
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it("does not write files in dry-run mode", async () => {
    const client = makeMockClient();
    const deps = makeBaseDeps(client);

    const stats = await downloadReceipts({ outputDir: "/tmp/test-dl", dryRun: true }, deps);

    // Dry-run counts downloads but doesn't write
    expect(stats.downloaded).toBe(1);
    expect(deps.writeFile).not.toHaveBeenCalled();
    expect(deps.saveManifest).not.toHaveBeenCalled();
  });

  it("rejects non-PDF content that starts with wrong bytes", async () => {
    const client = makeMockClient(OTHER_BYTES);
    const deps = makeBaseDeps(client);

    const stats = await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);

    expect(deps.writeFile).not.toHaveBeenCalled();
    expect(stats.downloaded).toBe(0);
  });

  it("saves the manifest after successful download", async () => {
    const client = makeMockClient();
    const deps = makeBaseDeps(client);

    await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);

    expect(deps.saveManifest).toHaveBeenCalledTimes(1);
  });
});
