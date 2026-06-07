import { describe, expect, it, mock } from "bun:test";
import { processDownloadMessage } from "../src/process-download-message.js";
import { makeLock } from "./helpers.js";

const PDF_BYTES = Buffer.from("%PDF-1.4 fake content");
const NON_PDF_BYTES = Buffer.from("not a pdf at all");

function makeMsg(uid = 1) {
  return { uid, address: "billing@vendor.com", name: "Vendor", date: new Date("2025-03-07"), mailbox: "INBOX" };
}

function makeBodyStructureClient(pdfContent = PDF_BYTES) {
  return {
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    fetch: mock(() => {
      async function* gen() {
        yield {
          bodyStructure: {
            type: "multipart/mixed",
            childNodes: [
              { type: "text/plain", part: "1", size: 10 },
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

function makeNoPdfClient() {
  return {
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    fetch: mock(() => {
      async function* gen() {
        yield { bodyStructure: { type: "text/plain", part: "1", size: 10 } };
      }
      return gen();
    }),
    download: mock(() => Promise.resolve({ content: (async function* () {})() })),
  };
}

function makeContext(overrides = {}) {
  const written = [];
  return {
    account: { user: "test@example.com" },
    manifest: {},
    dryRun: false,
    outputDir: "/tmp/test-receipts",
    existingFiles: new Set(),
    existingHashes: new Set(),
    fs: {
      writeFile: mock((path, data) => written.push({ path, data })),
      mkdir: mock(() => {}),
    },
    onProgress: mock(() => {}),
    _written: written,
    ...overrides,
  };
}

describe("processDownloadMessage", () => {
  describe("already-in-manifest short-circuit", () => {
    it("returns alreadyHave action", async () => {
      const msg = makeMsg(1);
      const manifest = { "test@example.com:INBOX:1": { status: "downloaded" } };
      const context = makeContext({ manifest });
      const { action } = await processDownloadMessage({}, msg, "INBOX", context);
      expect(action).toBe("alreadyHave");
    });

    it("does not call client.fetch", async () => {
      const msg = makeMsg(1);
      const manifest = { "test@example.com:INBOX:1": { status: "downloaded" } };
      const context = makeContext({ manifest });
      const client = { fetch: mock(() => {}), download: mock(() => {}) };
      await processDownloadMessage(client, msg, "INBOX", context);
      expect(client.fetch).not.toHaveBeenCalled();
    });
  });

  describe("no-PDF path", () => {
    it("returns noPdf action", async () => {
      const client = makeNoPdfClient();
      const context = makeContext();
      const { action } = await processDownloadMessage(client, makeMsg(), "INBOX", context);
      expect(action).toBe("noPdf");
    });

    it("records no-pdf in manifest", async () => {
      const client = makeNoPdfClient();
      const context = makeContext();
      await processDownloadMessage(client, makeMsg(1), "INBOX", context);
      expect(context.manifest["test@example.com:INBOX:1"]).toBeDefined();
    });

    it("does not call fs.writeFile", async () => {
      const client = makeNoPdfClient();
      const context = makeContext();
      await processDownloadMessage(client, makeMsg(), "INBOX", context);
      expect(context.fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("successful download and write", () => {
    it("returns downloaded action", async () => {
      const client = makeBodyStructureClient();
      const context = makeContext();
      const { action } = await processDownloadMessage(client, makeMsg(), "INBOX", context);
      expect(action).toBe("downloaded");
    });

    it("calls fs.writeFile once", async () => {
      const client = makeBodyStructureClient();
      const context = makeContext();
      await processDownloadMessage(client, makeMsg(), "INBOX", context);
      expect(context.fs.writeFile).toHaveBeenCalledTimes(1);
    });

    it("records downloaded status in manifest", async () => {
      const client = makeBodyStructureClient();
      const context = makeContext();
      await processDownloadMessage(client, makeMsg(1), "INBOX", context);
      expect(context.manifest["test@example.com:INBOX:1"]).toBeDefined();
    });
  });

  describe("duplicate-hash skip", () => {
    it("returns alreadyHave action", async () => {
      const client = makeBodyStructureClient(PDF_BYTES);
      // Pre-seed the existingHashes so the content hash matches
      const crypto = await import("node:crypto");
      const hash = crypto.createHash("sha256").update(PDF_BYTES).digest("hex");
      const context = makeContext({ existingHashes: new Set([hash]) });
      const { action } = await processDownloadMessage(client, makeMsg(), "INBOX", context);
      expect(action).toBe("alreadyHave");
    });

    it("does not call fs.writeFile", async () => {
      const client = makeBodyStructureClient(PDF_BYTES);
      const crypto = await import("node:crypto");
      const hash = crypto.createHash("sha256").update(PDF_BYTES).digest("hex");
      const context = makeContext({ existingHashes: new Set([hash]) });
      await processDownloadMessage(client, makeMsg(), "INBOX", context);
      expect(context.fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("invalid-PDF skip", () => {
    it("returns skipped action when all parts are invalid", async () => {
      const client = makeBodyStructureClient(NON_PDF_BYTES);
      const context = makeContext();
      const { action } = await processDownloadMessage(client, makeMsg(), "INBOX", context);
      expect(action).toBe("skipped");
    });

    it("does not call fs.writeFile", async () => {
      const client = makeBodyStructureClient(NON_PDF_BYTES);
      const context = makeContext();
      await processDownloadMessage(client, makeMsg(), "INBOX", context);
      expect(context.fs.writeFile).not.toHaveBeenCalled();
    });
  });
});
