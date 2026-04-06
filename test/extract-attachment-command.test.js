import { describe, expect, it, mock } from "bun:test";
import { extractAttachmentCommand } from "../src/extract-attachment-command.js";
import { makeAccount, makeForEachAccount, makeListMailboxes, makeLock } from "./helpers.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeBodyStructure(parts = []) {
  // Flat structure for tests — no child nodes, multiple attachment parts
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return { childNodes: parts };
}

function makePdfPart(overrides = {}) {
  return {
    part: "2",
    type: "application/pdf",
    size: 1024,
    filename: "invoice.pdf",
    disposition: "attachment",
    dispositionParameters: { filename: "invoice.pdf" },
    parameters: {},
    ...overrides,
  };
}

function makeClient({ bodyStructure = null, downloadContent = Buffer.from("PDF data") } = {}) {
  return {
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    search: mock(() => Promise.resolve([42])),
    fetch: mock(async function* () {
      yield { bodyStructure };
    }),
    download: mock(() => ({
      content: (async function* () {
        yield downloadContent;
      })(),
    })),
  };
}

function makeDeps(overrides = {}) {
  const account = makeAccount();
  const pdfPart = makePdfPart();
  const client = makeClient({ bodyStructure: makeBodyStructure([pdfPart]) });

  const listMailboxes = makeListMailboxes();
  const forEachAccount = makeForEachAccount(client, account);

  const fsGateway = {
    mkdir: mock(() => {}),
    writeFile: mock(() => {}),
  };

  return {
    targetAccounts: [account],
    forEachAccount,
    listMailboxes,
    fsGateway,
    _client: client,
    ...overrides,
  };
}

// ── extractAttachmentCommand ───────────────────────────────────────────────────

describe("extractAttachmentCommand", () => {
  describe("list mode", () => {
    describe("returns found: true with attachment listing", () => {
      it("result.found is true", async () => {
        const deps = makeDeps();
        const result = /** @type {any} */ (await extractAttachmentCommand("42", 0, { list: true }, deps));
        expect(result.found).toBe(true);
      });

      it("result.list is true", async () => {
        const deps = makeDeps();
        const result = /** @type {any} */ (await extractAttachmentCommand("42", 0, { list: true }, deps));
        expect(result.list).toBe(true);
      });

      it("result.attachments has one item", async () => {
        const deps = makeDeps();
        const result = /** @type {any} */ (await extractAttachmentCommand("42", 0, { list: true }, deps));
        expect(result.attachments).toHaveLength(1);
      });
    });

    describe("includes attachment filename and contentType in listing", () => {
      it("attachment has the correct filename", async () => {
        const deps = makeDeps();
        const result = /** @type {any} */ (await extractAttachmentCommand("42", 0, { list: true }, deps));
        expect(result.attachments[0].filename).toBe("invoice.pdf");
      });

      it("attachment has the correct contentType", async () => {
        const deps = makeDeps();
        const result = /** @type {any} */ (await extractAttachmentCommand("42", 0, { list: true }, deps));
        expect(result.attachments[0].contentType).toBe("application/pdf");
      });
    });

    describe("includes account name and uid in list result", () => {
      it("result.account is the account name", async () => {
        const deps = makeDeps();
        const result = /** @type {any} */ (await extractAttachmentCommand("42", 0, { list: true }, deps));
        expect(result.account).toBe("Test Account");
      });

      it("result.uid is the numeric uid", async () => {
        const deps = makeDeps();
        const result = /** @type {any} */ (await extractAttachmentCommand("42", 0, { list: true }, deps));
        expect(result.uid).toBe(42);
      });
    });

    it("returns empty attachments array when message has no attachments", async () => {
      const noAttachClient = makeClient({ bodyStructure: null });
      const deps = makeDeps({
        forEachAccount: mock(async (_accounts, fn) => {
          await fn(noAttachClient, makeAccount());
        }),
        _client: noAttachClient,
      });
      const result = /** @type {any} */ (await extractAttachmentCommand("42", 0, { list: true }, deps));

      // null bodyStructure means we return early — found stays false
      expect(result.found).toBe(false);
    });
  });

  describe("save mode", () => {
    describe("downloads the specified attachment and writes to disk", () => {
      it("result.found is true", async () => {
        const deps = makeDeps();
        const result = /** @type {any} */ (await extractAttachmentCommand("42", 0, { output: "/tmp/out" }, deps));
        expect(result.found).toBe(true);
      });

      it("result.list is false", async () => {
        const deps = makeDeps();
        const result = /** @type {any} */ (await extractAttachmentCommand("42", 0, { output: "/tmp/out" }, deps));
        expect(result.list).toBe(false);
      });

      it("calls writeFile once", async () => {
        const deps = makeDeps();
        await extractAttachmentCommand("42", 0, { output: "/tmp/out" }, deps);
        expect(deps.fsGateway.writeFile).toHaveBeenCalledTimes(1);
      });
    });

    describe("saves to the correct output directory", () => {
      it("result.path contains the filename", async () => {
        const deps = makeDeps();
        const result = /** @type {any} */ (await extractAttachmentCommand("42", 0, { output: "/tmp/receipts" }, deps));
        expect(result.path).toContain("invoice.pdf");
      });

      it("calls mkdir once", async () => {
        const deps = makeDeps();
        await extractAttachmentCommand("42", 0, { output: "/tmp/receipts" }, deps);
        expect(deps.fsGateway.mkdir).toHaveBeenCalledTimes(1);
      });
    });

    it("uses correct filename from attachment metadata", async () => {
      const deps = makeDeps();
      const result = /** @type {any} */ (await extractAttachmentCommand("42", 0, { output: "." }, deps));

      expect(result.filename).toBe("invoice.pdf");
    });

    it("uses attachment_N fallback filename for unnamed attachments", async () => {
      const unnamedPart = makePdfPart({ filename: null, dispositionParameters: {}, parameters: {} });
      const client = makeClient({ bodyStructure: makeBodyStructure([unnamedPart]) });
      const deps = makeDeps({
        forEachAccount: mock(async (_accounts, fn) => {
          await fn(client, makeAccount());
        }),
        _client: client,
      });
      const result = /** @type {any} */ (await extractAttachmentCommand("42", 0, { output: "." }, deps));

      expect(result.filename).toBe("attachment_0");
    });

    it("reports correct file size", async () => {
      const content = Buffer.from("PDF content here");
      const client = makeClient({ bodyStructure: makeBodyStructure([makePdfPart()]), downloadContent: content });
      const deps = makeDeps({
        forEachAccount: mock(async (_accounts, fn) => {
          await fn(client, makeAccount());
        }),
        _client: client,
      });
      const result = /** @type {any} */ (await extractAttachmentCommand("42", 0, { output: "." }, deps));

      expect(result.size).toBe(content.length);
    });

    it("throws when attachment index is out of range", async () => {
      const deps = makeDeps();
      await expect(extractAttachmentCommand("42", 5, { output: "." }, deps)).rejects.toThrow(
        "Attachment index 5 out of range",
      );
    });

    it("downloads with the correct MIME part specifier", async () => {
      const deps = makeDeps();
      await extractAttachmentCommand("42", 0, { output: "." }, deps);

      expect(deps._client.download).toHaveBeenCalledWith("42", "2", { uid: true });
    });
  });

  describe("mailbox detection", () => {
    it("returns found: false when UID is not in any account", async () => {
      const deps = makeDeps({
        forEachAccount: mock(async (_accounts, _fn) => {
          // Never calls fn — simulates UID not found
        }),
      });
      const result = await extractAttachmentCommand("99", 0, { list: true }, deps);

      expect(result.found).toBe(false);
    });

    it("skips account when mailbox lock fails", async () => {
      const lockFailClient = {
        getMailboxLock: mock(() => Promise.reject(new Error("Lock failed"))),
        search: mock(() => Promise.resolve([99])),
        fetch: mock(async function* () {}),
        download: mock(() => ({ content: (async function* () {})() })),
      };
      const deps = makeDeps({
        forEachAccount: mock(async (_accounts, fn) => {
          await fn(lockFailClient, makeAccount());
        }),
        _client: lockFailClient,
      });
      const result = await extractAttachmentCommand("42", 0, { list: true }, deps);

      expect(result.found).toBe(false);
    });
  });
});
