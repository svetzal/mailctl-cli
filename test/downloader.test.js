import { describe, expect, it, mock } from "bun:test";
import { downloadReceipts } from "../src/downloader.js";
import { makeLock } from "./helpers.js";

const PDF_BYTES = Buffer.from("%PDF-1.4 fake content");
const OTHER_BYTES = Buffer.from("not a pdf");

/** Minimal IMAP client mock for download tests. */
function makeMockClient(pdfContent = PDF_BYTES) {
  return {
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    fetch: mock((_uid, _opts) => {
      async function* gen() {
        yield {
          bodyStructure: {
            type: "multipart/mixed",
            childNodes: [
              { type: "text/plain", part: "1", size: 100 },
              {
                type: "application/pdf",
                part: "2",
                size: pdfContent.length,
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
      async function* gen() {
        yield pdfContent;
      }
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
    saveManifest: mock((m) => {
      Object.assign(manifest, m);
    }),
    fs: {
      exists: mock(() => false),
      readdir: mock(() => []),
      readBuffer: mock(() => Buffer.alloc(0)),
      mkdir: mock(() => {}),
      writeFile: mock((path, data) => {
        written.push({ path, data });
      }),
    },
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
  describe("downloads PDF for a business-classified receipt", () => {
    it("increments downloaded count", async () => {
      const client = makeMockClient();
      const deps = makeBaseDeps(client);
      const stats = await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);
      expect(stats.downloaded).toBe(1);
    });

    it("calls writeFile once", async () => {
      const client = makeMockClient();
      const deps = makeBaseDeps(client);
      await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);
      expect(deps.fs.writeFile).toHaveBeenCalledTimes(1);
    });
  });

  describe("does NOT download PDF for a personal-classified receipt", () => {
    it("reports zero downloads", async () => {
      const client = makeMockClient();
      const deps = makeBaseDeps(client, { loadClassifications: () => ({ "billing@vendor.com": "personal" }) });
      const stats = await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);
      expect(stats.downloaded).toBe(0);
    });

    it("does not call writeFile", async () => {
      const client = makeMockClient();
      const deps = makeBaseDeps(client, { loadClassifications: () => ({ "billing@vendor.com": "personal" }) });
      await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);
      expect(deps.fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("does NOT download PDF for an unclassified receipt", () => {
    it("reports zero downloads", async () => {
      const client = makeMockClient();
      const deps = makeBaseDeps(client, { loadClassifications: () => ({}) });
      const stats = await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);
      expect(stats.downloaded).toBe(0);
    });

    it("does not call writeFile", async () => {
      const client = makeMockClient();
      const deps = makeBaseDeps(client, { loadClassifications: () => ({}) });
      await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);
      expect(deps.fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("skips message already recorded in the manifest", () => {
    it("increments alreadyHave count", async () => {
      const client = makeMockClient();
      const manifestKey = "test@example.com:INBOX:1";
      const deps = makeBaseDeps(client, {
        loadManifest: () => ({ [manifestKey]: { status: "downloaded", filename: "old.pdf" } }),
      });
      const stats = await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);
      expect(stats.alreadyHave).toBe(1);
    });

    it("does not call writeFile", async () => {
      const client = makeMockClient();
      const manifestKey = "test@example.com:INBOX:1";
      const deps = makeBaseDeps(client, {
        loadManifest: () => ({ [manifestKey]: { status: "downloaded", filename: "old.pdf" } }),
      });
      await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);
      expect(deps.fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("skips file that has duplicate content hash", () => {
    it("increments alreadyHave count", async () => {
      const client = makeMockClient();
      const deps = makeBaseDeps(client);
      deps.fs.exists = mock(() => true);
      deps.fs.readdir = /** @type {any} */ (mock(() => ["existing.pdf"]));
      deps.fs.readBuffer = mock(() => PDF_BYTES);
      const stats = await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);
      expect(stats.alreadyHave).toBe(1);
    });

    it("does not call writeFile", async () => {
      const client = makeMockClient();
      const deps = makeBaseDeps(client);
      deps.fs.exists = mock(() => true);
      deps.fs.readdir = /** @type {any} */ (mock(() => ["existing.pdf"]));
      deps.fs.readBuffer = mock(() => PDF_BYTES);
      await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);
      expect(deps.fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("increments noPdf when email has no PDF attachment", () => {
    function makeNoPdfClient() {
      return {
        getMailboxLock: mock(() => Promise.resolve(makeLock())),
        fetch: mock(() => {
          async function* gen() {
            yield { bodyStructure: { type: "text/plain", part: "1", size: 100 } };
          }
          return gen();
        }),
        download: mock(() => Promise.resolve({ content: (async function* () {})() })),
      };
    }

    it("increments noPdf count", async () => {
      const deps = makeBaseDeps(makeNoPdfClient());
      const stats = await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);
      expect(stats.noPdf).toBe(1);
    });

    it("does not call writeFile", async () => {
      const deps = makeBaseDeps(makeNoPdfClient());
      await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);
      expect(deps.fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("does not write files in dry-run mode", () => {
    it("still counts downloaded", async () => {
      const client = makeMockClient();
      const deps = makeBaseDeps(client);
      const stats = await downloadReceipts({ outputDir: "/tmp/test-dl", dryRun: true }, deps);
      expect(stats.downloaded).toBe(1);
    });

    it("does not call writeFile", async () => {
      const client = makeMockClient();
      const deps = makeBaseDeps(client);
      await downloadReceipts({ outputDir: "/tmp/test-dl", dryRun: true }, deps);
      expect(deps.fs.writeFile).not.toHaveBeenCalled();
    });

    it("does not call saveManifest", async () => {
      const client = makeMockClient();
      const deps = makeBaseDeps(client);
      await downloadReceipts({ outputDir: "/tmp/test-dl", dryRun: true }, deps);
      expect(deps.saveManifest).not.toHaveBeenCalled();
    });
  });

  describe("rejects non-PDF content that starts with wrong bytes", () => {
    it("does not call writeFile", async () => {
      const client = makeMockClient(OTHER_BYTES);
      const deps = makeBaseDeps(client);
      await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);
      expect(deps.fs.writeFile).not.toHaveBeenCalled();
    });

    it("reports zero downloads", async () => {
      const client = makeMockClient(OTHER_BYTES);
      const deps = makeBaseDeps(client);
      const stats = await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);
      expect(stats.downloaded).toBe(0);
    });
  });

  it("saves the manifest after successful download", async () => {
    const client = makeMockClient();
    const deps = makeBaseDeps(client);

    await downloadReceipts({ outputDir: "/tmp/test-dl" }, deps);

    expect(deps.saveManifest).toHaveBeenCalledTimes(1);
  });
});
