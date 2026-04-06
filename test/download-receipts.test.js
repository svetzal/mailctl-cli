import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  collectSidecarFiles,
  downloadReceiptEmails,
  loadExistingHashes,
  loadExistingInvoiceNumbers,
  reprocessReceipts,
  searchMailboxForReceipts,
  uniqueBaseName,
  walkOutputTree,
} from "../src/download-receipts.js";
import { FileSystemGateway } from "../src/gateways/fs-gateway.js";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const REAL_FS = new FileSystemGateway();
const FAKE_PDF = Buffer.from("%PDF-1.4 fake content for tests");
const FAKE_PDF_HASH = createHash("sha256").update(FAKE_PDF).digest("hex");

let tmpDir;

beforeEach(() => {
  tmpDir = join("/tmp", `mailctl-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── walkOutputTree ────────────────────────────────────────────────────────────

describe("walkOutputTree", () => {
  it("does nothing when the output directory does not exist", () => {
    const visitor = mock(() => {});
    walkOutputTree("/does/not/exist", REAL_FS, visitor);
    expect(visitor).not.toHaveBeenCalled();
  });

  describe("visits files in year/month subdirectories", () => {
    it("visits exactly one file", () => {
      const monthDir = join(tmpDir, "2025", "03");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "receipt.json"), "{}");
      const visited = [];
      walkOutputTree(tmpDir, REAL_FS, (filePath, fileName) => {
        visited.push({ filePath, fileName });
      });
      expect(visited).toHaveLength(1);
    });

    it("visited file has correct fileName", () => {
      const monthDir = join(tmpDir, "2025", "03");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "receipt.json"), "{}");
      const visited = [];
      walkOutputTree(tmpDir, REAL_FS, (filePath, fileName) => {
        visited.push({ filePath, fileName });
      });
      expect(visited[0].fileName).toBe("receipt.json");
    });

    it("visited file has correct filePath", () => {
      const monthDir = join(tmpDir, "2025", "03");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "receipt.json"), "{}");
      const visited = [];
      walkOutputTree(tmpDir, REAL_FS, (filePath, fileName) => {
        visited.push({ filePath, fileName });
      });
      expect(visited[0].filePath).toBe(join(monthDir, "receipt.json"));
    });
  });

  it("skips non-year top-level directories", () => {
    const badDir = join(tmpDir, "not-a-year");
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, "file.txt"), "data");

    const visitor = mock(() => {});
    walkOutputTree(tmpDir, REAL_FS, visitor);
    expect(visitor).not.toHaveBeenCalled();
  });

  describe("visits files across multiple years and months", () => {
    it("visits two files", () => {
      mkdirSync(join(tmpDir, "2024", "12"), { recursive: true });
      mkdirSync(join(tmpDir, "2025", "01"), { recursive: true });
      writeFileSync(join(tmpDir, "2024", "12", "a.pdf"), "pdf1");
      writeFileSync(join(tmpDir, "2025", "01", "b.json"), "{}");
      const fileNames = [];
      walkOutputTree(tmpDir, REAL_FS, (_filePath, fileName) => {
        fileNames.push(fileName);
      });
      expect(fileNames).toHaveLength(2);
    });

    it("visits a.pdf from 2024", () => {
      mkdirSync(join(tmpDir, "2024", "12"), { recursive: true });
      mkdirSync(join(tmpDir, "2025", "01"), { recursive: true });
      writeFileSync(join(tmpDir, "2024", "12", "a.pdf"), "pdf1");
      writeFileSync(join(tmpDir, "2025", "01", "b.json"), "{}");
      const fileNames = [];
      walkOutputTree(tmpDir, REAL_FS, (_filePath, fileName) => {
        fileNames.push(fileName);
      });
      expect(fileNames).toContain("a.pdf");
    });

    it("visits b.json from 2025", () => {
      mkdirSync(join(tmpDir, "2024", "12"), { recursive: true });
      mkdirSync(join(tmpDir, "2025", "01"), { recursive: true });
      writeFileSync(join(tmpDir, "2024", "12", "a.pdf"), "pdf1");
      writeFileSync(join(tmpDir, "2025", "01", "b.json"), "{}");
      const fileNames = [];
      walkOutputTree(tmpDir, REAL_FS, (_filePath, fileName) => {
        fileNames.push(fileName);
      });
      expect(fileNames).toContain("b.json");
    });
  });

  describe("continues past files that cause visitor errors (default no-op onError)", () => {
    it("still visits good.json after bad.json throws", () => {
      const monthDir = join(tmpDir, "2025", "03");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "good.json"), "{}");
      writeFileSync(join(monthDir, "bad.json"), "{}");
      const visited = [];
      walkOutputTree(tmpDir, REAL_FS, (_filePath, fileName) => {
        if (fileName === "bad.json") throw new Error("intentional");
        visited.push(fileName);
      });
      expect(visited).toContain("good.json");
    });

    it("does not include bad.json in visited list", () => {
      const monthDir = join(tmpDir, "2025", "03");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "good.json"), "{}");
      writeFileSync(join(monthDir, "bad.json"), "{}");
      const visited = [];
      walkOutputTree(tmpDir, REAL_FS, (_filePath, fileName) => {
        if (fileName === "bad.json") throw new Error("intentional");
        visited.push(fileName);
      });
      expect(visited).not.toContain("bad.json");
    });
  });

  describe("calls onError with the error and file context when visitor throws", () => {
    it("calls onError once", () => {
      const monthDir = join(tmpDir, "2025", "03");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "bad.json"), "{}");

      const errors = [];
      walkOutputTree(
        tmpDir,
        REAL_FS,
        (_filePath, fileName) => {
          if (fileName === "bad.json") throw new Error("visitor-fail");
        },
        (err, ctx) => errors.push({ err, ctx }),
      );

      expect(errors).toHaveLength(1);
    });

    it("passes the error message to onError", () => {
      const monthDir2 = join(tmpDir, "2025", "03");
      mkdirSync(monthDir2, { recursive: true });
      writeFileSync(join(monthDir2, "bad.json"), "{}");

      const errors = [];
      walkOutputTree(
        tmpDir,
        REAL_FS,
        (_filePath, fileName) => {
          if (fileName === "bad.json") throw new Error("visitor-fail");
        },
        (err, ctx) => errors.push({ err, ctx }),
      );

      expect(errors[0].err.message).toBe("visitor-fail");
    });

    it("passes ctx.level as file to onError", () => {
      const monthDir3 = join(tmpDir, "2025", "03");
      mkdirSync(monthDir3, { recursive: true });
      writeFileSync(join(monthDir3, "bad.json"), "{}");

      const errors = [];
      walkOutputTree(
        tmpDir,
        REAL_FS,
        (_filePath, fileName) => {
          if (fileName === "bad.json") throw new Error("visitor-fail");
        },
        (err, ctx) => errors.push({ err, ctx }),
      );

      expect(errors[0].ctx.level).toBe("file");
    });
  });
});

// ── loadExistingInvoiceNumbers ────────────────────────────────────────────────

describe("loadExistingInvoiceNumbers", () => {
  it("returns an empty Set when the output directory does not exist", () => {
    const result = loadExistingInvoiceNumbers("/does/not/exist", REAL_FS);
    expect(result.size).toBe(0);
  });

  it("returns an empty Set for an empty directory", () => {
    const result = loadExistingInvoiceNumbers(tmpDir, REAL_FS);
    expect(result.size).toBe(0);
  });

  it("extracts invoice numbers from JSON sidecars in year/month subdirectories", () => {
    const monthDir = join(tmpDir, "2025", "03");
    mkdirSync(monthDir, { recursive: true });
    writeFileSync(join(monthDir, "receipt.json"), JSON.stringify({ invoice_number: "INV-001" }));

    const result = loadExistingInvoiceNumbers(tmpDir, REAL_FS);
    expect(result.has("INV-001")).toBe(true);
  });

  it("ignores non-year top-level directories", () => {
    const badDir = join(tmpDir, "not-a-year");
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, "some.json"), JSON.stringify({ invoice_number: "SKIP-ME" }));

    const result = loadExistingInvoiceNumbers(tmpDir, REAL_FS);
    expect(result.size).toBe(0);
  });

  it("ignores JSON files without an invoice_number field", () => {
    const monthDir = join(tmpDir, "2025", "03");
    mkdirSync(monthDir, { recursive: true });
    writeFileSync(join(monthDir, "no-invoice.json"), JSON.stringify({ vendor: "Acme" }));

    const result = loadExistingInvoiceNumbers(tmpDir, REAL_FS);
    expect(result.size).toBe(0);
  });

  describe("collects invoice numbers from multiple months", () => {
    it("includes INV-001 from march", () => {
      const march = join(tmpDir, "2025", "03");
      const april = join(tmpDir, "2025", "04");
      mkdirSync(march, { recursive: true });
      mkdirSync(april, { recursive: true });
      writeFileSync(join(march, "a.json"), JSON.stringify({ invoice_number: "INV-001" }));
      writeFileSync(join(april, "b.json"), JSON.stringify({ invoice_number: "INV-002" }));

      const result = loadExistingInvoiceNumbers(tmpDir, REAL_FS);
      expect(result.has("INV-001")).toBe(true);
    });

    it("includes INV-002 from april", () => {
      const march = join(tmpDir, "2025", "03");
      const april = join(tmpDir, "2025", "04");
      mkdirSync(march, { recursive: true });
      mkdirSync(april, { recursive: true });
      writeFileSync(join(march, "a.json"), JSON.stringify({ invoice_number: "INV-001" }));
      writeFileSync(join(april, "b.json"), JSON.stringify({ invoice_number: "INV-002" }));

      const result = loadExistingInvoiceNumbers(tmpDir, REAL_FS);
      expect(result.has("INV-002")).toBe(true);
    });
  });

  it("ignores non-json files in month directories", () => {
    const monthDir = join(tmpDir, "2025", "03");
    mkdirSync(monthDir, { recursive: true });
    writeFileSync(join(monthDir, "receipt.pdf"), FAKE_PDF);

    const result = loadExistingInvoiceNumbers(tmpDir, REAL_FS);
    expect(result.size).toBe(0);
  });
});

// ── loadExistingHashes ────────────────────────────────────────────────────────

describe("loadExistingHashes", () => {
  it("returns an empty Set when the output directory does not exist", () => {
    const result = loadExistingHashes("/does/not/exist", REAL_FS);
    expect(result.size).toBe(0);
  });

  it("returns an empty Set for an empty directory", () => {
    const result = loadExistingHashes(tmpDir, REAL_FS);
    expect(result.size).toBe(0);
  });

  it("returns the SHA-256 hash of a PDF in a year/month subdirectory", () => {
    const monthDir = join(tmpDir, "2025", "03");
    mkdirSync(monthDir, { recursive: true });
    writeFileSync(join(monthDir, "invoice.pdf"), FAKE_PDF);

    const result = loadExistingHashes(tmpDir, REAL_FS);
    expect(result.has(FAKE_PDF_HASH)).toBe(true);
  });

  it("ignores non-PDF files in month directories", () => {
    const monthDir = join(tmpDir, "2025", "03");
    mkdirSync(monthDir, { recursive: true });
    writeFileSync(join(monthDir, "notes.txt"), "not a PDF");

    const result = loadExistingHashes(tmpDir, REAL_FS);
    expect(result.size).toBe(0);
  });

  describe("collects hashes from PDFs across multiple months", () => {
    it("returns size 2 for two distinct PDFs", () => {
      const march = join(tmpDir, "2025", "03");
      const april = join(tmpDir, "2025", "04");
      mkdirSync(march, { recursive: true });
      mkdirSync(april, { recursive: true });
      const otherPdf = Buffer.from("%PDF-different");
      writeFileSync(join(march, "a.pdf"), FAKE_PDF);
      writeFileSync(join(april, "b.pdf"), otherPdf);

      const result = loadExistingHashes(tmpDir, REAL_FS);
      expect(result.size).toBe(2);
    });

    it("includes the hash of the first PDF", () => {
      const march = join(tmpDir, "2025", "03");
      const april = join(tmpDir, "2025", "04");
      mkdirSync(march, { recursive: true });
      mkdirSync(april, { recursive: true });
      const otherPdf = Buffer.from("%PDF-different");
      writeFileSync(join(march, "a.pdf"), FAKE_PDF);
      writeFileSync(join(april, "b.pdf"), otherPdf);

      const result = loadExistingHashes(tmpDir, REAL_FS);
      expect(result.has(FAKE_PDF_HASH)).toBe(true);
    });

    it("includes the hash of the second PDF", () => {
      const march = join(tmpDir, "2025", "03");
      const april = join(tmpDir, "2025", "04");
      mkdirSync(march, { recursive: true });
      mkdirSync(april, { recursive: true });
      const otherPdf = Buffer.from("%PDF-different");
      writeFileSync(join(march, "a.pdf"), FAKE_PDF);
      writeFileSync(join(april, "b.pdf"), otherPdf);

      const result = loadExistingHashes(tmpDir, REAL_FS);
      expect(result.has(createHash("sha256").update(otherPdf).digest("hex"))).toBe(true);
    });
  });
});

// ── uniqueBaseName ────────────────────────────────────────────────────────────

describe("uniqueBaseName", () => {
  it("returns the base name when no conflicts exist", () => {
    const usedPaths = new Set();
    const result = uniqueBaseName(tmpDir, "Acme-INV001", usedPaths, REAL_FS);
    expect(result).toBe("Acme-INV001");
  });

  it("adds the name to usedPaths after returning it", () => {
    const usedPaths = new Set();
    uniqueBaseName(tmpDir, "Acme-INV001", usedPaths, REAL_FS);
    expect(usedPaths.size).toBe(1);
  });

  it("appends _2 when the base name is already in usedPaths", () => {
    const usedPaths = new Set([`${tmpDir}/acme-inv001`]);
    const result = uniqueBaseName(tmpDir, "Acme-INV001", usedPaths, REAL_FS);
    expect(result).toBe("Acme-INV001_2");
  });

  it("appends _3 when both base and _2 are already taken", () => {
    const usedPaths = new Set([`${tmpDir}/acme-inv001`, `${tmpDir}/acme-inv001_2`]);
    const result = uniqueBaseName(tmpDir, "Acme-INV001", usedPaths, REAL_FS);
    expect(result).toBe("Acme-INV001_3");
  });

  it("appends _2 when a .json file with base name already exists on disk", () => {
    writeFileSync(join(tmpDir, "Acme-INV001.json"), "{}");
    const usedPaths = new Set();
    const result = uniqueBaseName(tmpDir, "Acme-INV001", usedPaths, REAL_FS);
    expect(result).toBe("Acme-INV001_2");
  });

  it("appends _2 when a .pdf file with base name already exists on disk", () => {
    writeFileSync(join(tmpDir, "Acme-INV001.pdf"), FAKE_PDF);
    const usedPaths = new Set();
    const result = uniqueBaseName(tmpDir, "Acme-INV001", usedPaths, REAL_FS);
    expect(result).toBe("Acme-INV001_2");
  });
});

// ── searchMailboxForReceipts ──────────────────────────────────────────────────

describe("searchMailboxForReceipts", () => {
  it("returns an empty array when getMailboxLock throws", async () => {
    const client = {
      getMailboxLock: mock(() => Promise.reject(new Error("no such mailbox"))),
    };
    const result = await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date());
    expect(result).toHaveLength(0);
  });

  describe("emits mailbox-lock-failed event when getMailboxLock throws", () => {
    it("emits exactly one event", async () => {
      const lockErr = new Error("no such mailbox");
      const client = { getMailboxLock: mock(() => Promise.reject(lockErr)) };
      const events = [];
      await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date(), (e) => events.push(e));
      expect(events).toHaveLength(1);
    });

    it("emits event with type mailbox-lock-failed", async () => {
      const lockErr = new Error("no such mailbox");
      const client = { getMailboxLock: mock(() => Promise.reject(lockErr)) };
      const events = [];
      await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date(), (e) => events.push(e));
      expect(events[0].type).toBe("mailbox-lock-failed");
    });

    it("emits event with the correct mailbox", async () => {
      const lockErr = new Error("no such mailbox");
      const client = { getMailboxLock: mock(() => Promise.reject(lockErr)) };
      const events = [];
      await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date(), (e) => events.push(e));
      expect(events[0].mailbox).toBe("INBOX");
    });

    it("emits event with the original error", async () => {
      const lockErr = new Error("no such mailbox");
      const client = { getMailboxLock: mock(() => Promise.reject(lockErr)) };
      const events = [];
      await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date(), (e) => events.push(e));
      expect(events[0].error).toBe(lockErr);
    });
  });

  describe("emits search-term-error and continues when a subject search throws", () => {
    function makeSearchErrClient() {
      const lock = { release: mock(() => {}) };
      const searchErr = new Error("search failed");
      const client = {
        getMailboxLock: mock(() => Promise.resolve(lock)),
        search: mock(() => Promise.reject(searchErr)),
        mailbox: { exists: 0 },
        fetch: mock(() => (async function* () {})()),
      };
      return { client, searchErr };
    }

    it("emits at least one search-term-error event", async () => {
      const { client } = makeSearchErrClient();
      const events = [];
      await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date(), (e) => events.push(e));
      const errorEvents = events.filter((e) => e.type === "search-term-error");
      expect(errorEvents.length).toBeGreaterThan(0);
    });

    it("emits search-term-error with the correct mailbox", async () => {
      const { client } = makeSearchErrClient();
      const events = [];
      await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date(), (e) => events.push(e));
      const errorEvents = events.filter((e) => e.type === "search-term-error");
      expect(errorEvents[0].mailbox).toBe("INBOX");
    });

    it("emits search-term-error with the original error", async () => {
      const { client, searchErr } = makeSearchErrClient();
      const events = [];
      await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date(), (e) => events.push(e));
      const errorEvents = events.filter((e) => e.type === "search-term-error");
      expect(errorEvents[0].error).toBe(searchErr);
    });

    it("returns an empty array after error", async () => {
      const { client } = makeSearchErrClient();
      const result = await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date());
      expect(result).toHaveLength(0);
    });
  });

  it("returns an empty array when no UIDs match any search term", async () => {
    const lock = { release: mock(() => {}) };
    const client = {
      getMailboxLock: mock(() => Promise.resolve(lock)),
      search: mock(() => Promise.resolve([])),
      mailbox: { exists: 0 },
      fetch: mock(() => (async function* () {})()),
    };
    const result = await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date());
    expect(result).toHaveLength(0);
  });

  describe("deduplicates UIDs across multiple search terms", () => {
    function makeDedupClient() {
      const lock = { release: mock(() => {}) };
      return {
        getMailboxLock: mock(() => Promise.resolve(lock)),
        search: mock(() => Promise.resolve([42])),
        mailbox: { exists: 1 },
        fetch: mock((_range) => {
          async function* gen() {
            yield {
              uid: 42,
              envelope: {
                date: new Date(),
                from: [{ address: "billing@acme.com", name: "Acme" }],
                subject: "Your invoice",
                messageId: "msg-42",
              },
            };
          }
          return gen();
        }),
      };
    }

    it("returns only one result despite multiple matching search terms", async () => {
      const client = makeDedupClient();
      const result = await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date());
      expect(result).toHaveLength(1);
    });

    it("returns the correct uid in the deduplicated result", async () => {
      const client = makeDedupClient();
      const result = await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date());
      expect(result[0].uid).toBe(42);
    });
  });

  it("releases the mailbox lock when done", async () => {
    const lock = { release: mock(() => {}) };
    const client = {
      getMailboxLock: mock(() => Promise.resolve(lock)),
      search: mock(() => Promise.resolve([])),
      mailbox: { exists: 0 },
      fetch: mock(() => (async function* () {})()),
    };
    await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date());
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  describe("maps envelope fields to result objects", () => {
    const emailDate = new Date("2025-03-01");

    function makeEnvelopeClient() {
      const lock = { release: mock(() => {}) };
      return {
        getMailboxLock: mock(() => Promise.resolve(lock)),
        search: mock(() => Promise.resolve([99])),
        mailbox: { exists: 1 },
        fetch: mock(() => {
          async function* gen() {
            yield {
              uid: 99,
              envelope: {
                date: emailDate,
                from: [{ address: "Bill@Acme.COM", name: "Acme Billing" }],
                subject: "Invoice #123",
                messageId: "msg-99@acme.com",
              },
            };
          }
          return gen();
        }),
      };
    }

    it("sets uid", async () => {
      const [result] = await searchMailboxForReceipts(makeEnvelopeClient(), "TestAccount", "INBOX", new Date());
      expect(result.uid).toBe(99);
    });

    it("lowercases fromAddress", async () => {
      const [result] = await searchMailboxForReceipts(makeEnvelopeClient(), "TestAccount", "INBOX", new Date());
      expect(result.fromAddress).toBe("bill@acme.com");
    });

    it("sets fromName", async () => {
      const [result] = await searchMailboxForReceipts(makeEnvelopeClient(), "TestAccount", "INBOX", new Date());
      expect(result.fromName).toBe("Acme Billing");
    });

    it("sets subject", async () => {
      const [result] = await searchMailboxForReceipts(makeEnvelopeClient(), "TestAccount", "INBOX", new Date());
      expect(result.subject).toBe("Invoice #123");
    });

    it("sets messageId", async () => {
      const [result] = await searchMailboxForReceipts(makeEnvelopeClient(), "TestAccount", "INBOX", new Date());
      expect(result.messageId).toBe("msg-99@acme.com");
    });

    it("sets account", async () => {
      const [result] = await searchMailboxForReceipts(makeEnvelopeClient(), "TestAccount", "INBOX", new Date());
      expect(result.account).toBe("TestAccount");
    });

    it("sets mailbox", async () => {
      const [result] = await searchMailboxForReceipts(makeEnvelopeClient(), "TestAccount", "INBOX", new Date());
      expect(result.mailbox).toBe("INBOX");
    });
  });
});

// ── downloadReceiptEmails integration ────────────────────────────────────────

/** Minimal mock client that yields one parseable email with a PDF attachment. */
function makeEmailClient(pdfContent = FAKE_PDF) {
  const emailDate = new Date("2025-03-07");
  // Minimal RFC 2822 email with a PDF attachment
  const boundary = "----=_Part_boundary";
  const emailBody = [
    `From: billing@acme.com`,
    `Subject: Invoice #TEST-001`,
    `Date: ${emailDate.toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    `Message-ID: <test-msg-001@acme.com>`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain`,
    ``,
    `Your invoice is attached. Total: $99.00`,
    ``,
    `--${boundary}`,
    `Content-Type: application/pdf; name="invoice.pdf"`,
    `Content-Disposition: attachment; filename="invoice.pdf"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    pdfContent.toString("base64"),
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  const rawBuffer = Buffer.from(emailBody);

  return {
    getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
    search: mock(() => Promise.resolve([1])),
    mailbox: { exists: 1 },
    fetch: mock(() => {
      async function* gen() {
        yield {
          uid: 1,
          envelope: {
            date: emailDate,
            from: [{ address: "billing@acme.com", name: "Acme" }],
            subject: "Invoice #TEST-001",
            messageId: "test-msg-001@acme.com",
          },
        };
      }
      return gen();
    }),
    download: mock(() => {
      async function* gen() {
        yield rawBuffer;
      }
      return Promise.resolve({ content: gen() });
    }),
  };
}

/** Mock fs gateway that captures writes without touching disk. */
function makeMockFs(existingFiles = {}) {
  const written = {};

  return {
    mockFs: {
      exists: mock((p) => p in existingFiles),
      readdir: mock((p) => {
        if (existingFiles[p]?.isDir) return existingFiles[p].entries;
        return [];
      }),
      readJson: mock((p) => existingFiles[p]?.content ?? {}),
      readBuffer: mock((p) => existingFiles[p]?.content ?? Buffer.alloc(0)),
      readText: mock((p) => (existingFiles[p]?.content ?? "").toString()),
      writeFile: mock((p, data) => {
        written[p] = data;
      }),
      mkdir: mock(() => {}),
      rm: mock(() => {}),
    },
    written,
  };
}

describe("downloadReceiptEmails", () => {
  it("throws when no accounts are configured", async () => {
    const { mockFs } = makeMockFs();
    await expect(
      downloadReceiptEmails(
        {},
        {
          fs: mockFs,
          subprocess: { execFileSync: mock(() => {}) },
          loadAccounts: () => [],
          forEachAccount: async () => {},
          listMailboxes: async () => [],
          createLlmBroker: () => null,
        },
      ),
    ).rejects.toThrow("No accounts configured");
  });

  it("throws when the specified account is not found", async () => {
    const { mockFs } = makeMockFs();
    await expect(
      downloadReceiptEmails(
        { account: "nonexistent" },
        {
          fs: mockFs,
          subprocess: { execFileSync: mock(() => {}) },
          loadAccounts: () => [{ name: "Personal", user: "a@b.com" }],
          forEachAccount: async () => {},
          listMailboxes: async () => [],
          createLlmBroker: () => null,
        },
      ),
    ).rejects.toThrow('Account "nonexistent" not found');
  });

  it("counts found messages and returns stats", async () => {
    const client = makeEmailClient();
    const { mockFs } = makeMockFs();

    const { stats } = await downloadReceiptEmails(
      { outputDir: tmpDir },
      {
        fs: mockFs,
        subprocess: { execFileSync: mock(() => {}) },
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (accounts, fn) => fn(client, accounts[0]),
        listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
        createLlmBroker: () => null,
      },
    );

    expect(stats.found).toBeGreaterThan(0);
  });

  it("writes a PDF file for emails with PDF attachments", async () => {
    const client = makeEmailClient();
    const { mockFs, written } = makeMockFs();

    await downloadReceiptEmails(
      { outputDir: tmpDir },
      {
        fs: mockFs,
        subprocess: { execFileSync: mock(() => {}) },
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (accounts, fn) => fn(client, accounts[0]),
        listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
        createLlmBroker: () => null,
      },
    );

    const pdfKeys = Object.keys(written).filter((k) => k.endsWith(".pdf"));
    expect(pdfKeys.length).toBeGreaterThan(0);
  });

  it("writes a JSON sidecar alongside every downloaded PDF", async () => {
    const client = makeEmailClient();
    const { mockFs, written } = makeMockFs();

    await downloadReceiptEmails(
      { outputDir: tmpDir },
      {
        fs: mockFs,
        subprocess: { execFileSync: mock(() => {}) },
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (accounts, fn) => fn(client, accounts[0]),
        listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
        createLlmBroker: () => null,
      },
    );

    const jsonKeys = Object.keys(written).filter((k) => k.endsWith(".json"));
    expect(jsonKeys.length).toBeGreaterThan(0);
  });

  it("does not write output files to the output directory in dry-run mode", async () => {
    const client = makeEmailClient();
    const { mockFs, written } = makeMockFs();

    await downloadReceiptEmails(
      { outputDir: tmpDir, dryRun: true },
      {
        fs: mockFs,
        subprocess: { execFileSync: mock(() => {}) },
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (accounts, fn) => fn(client, accounts[0]),
        listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
        createLlmBroker: () => null,
      },
    );

    // No files should be written inside the output directory
    const outputWrites = Object.keys(written).filter((p) => p.startsWith(tmpDir));
    expect(outputWrites).toHaveLength(0);
  });

  it("deduplicates messages with the same message-id across mailboxes", async () => {
    const emailDate = new Date("2025-03-07");
    const _boundary = "----=_Part_boundary";
    const emailBody = [
      `From: billing@acme.com`,
      `Subject: Invoice`,
      `Date: ${emailDate.toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain`,
      `Message-ID: <duplicate-msg@acme.com>`,
      ``,
      `Your invoice. Total: $50.00`,
    ].join("\r\n");
    const rawBuffer = Buffer.from(emailBody);

    const client = {
      getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
      search: mock(() => Promise.resolve([1])),
      mailbox: { exists: 1 },
      fetch: mock(() => {
        async function* gen() {
          yield {
            uid: 1,
            envelope: {
              date: emailDate,
              from: [{ address: "billing@acme.com", name: "Acme" }],
              subject: "Invoice",
              // Same message-id in both INBOX and Archive
              messageId: "duplicate-msg@acme.com",
            },
          };
        }
        return gen();
      }),
      download: mock(() => {
        async function* gen() {
          yield rawBuffer;
        }
        return Promise.resolve({ content: gen() });
      }),
    };

    const { mockFs } = makeMockFs();
    const { stats } = await downloadReceiptEmails(
      { outputDir: tmpDir },
      {
        fs: mockFs,
        subprocess: { execFileSync: mock(() => {}) },
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (accounts, fn) => fn(client, accounts[0]),
        // Two mailboxes — same message appears in both
        listMailboxes: async () => [
          { path: "INBOX", specialUse: null, flags: new Set() },
          { path: "Archive", specialUse: null, flags: new Set() },
        ],
        createLlmBroker: () => null,
      },
    );

    // Processed as unique=1 despite appearing in 2 mailboxes
    expect(stats.found).toBe(1);
  });

  it("excludes messages with non-invoice subjects before processing", async () => {
    const emailDate = new Date("2025-03-07");
    const emailBody = [
      `From: billing@acme.com`,
      `Subject: Payment date approaching`,
      `Date: ${emailDate.toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain`,
      `Message-ID: <excluded-msg@acme.com>`,
      ``,
      `Your payment date is approaching.`,
    ].join("\r\n");
    const rawBuffer = Buffer.from(emailBody);

    const client = {
      getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
      search: mock(() => Promise.resolve([1])),
      mailbox: { exists: 1 },
      fetch: mock(() => {
        async function* gen() {
          yield {
            uid: 1,
            envelope: {
              date: emailDate,
              from: [{ address: "billing@acme.com", name: "Acme" }],
              subject: "Payment date approaching",
              messageId: "excluded-msg@acme.com",
            },
          };
        }
        return gen();
      }),
      download: mock(() => {
        async function* gen() {
          yield rawBuffer;
        }
        return Promise.resolve({ content: gen() });
      }),
    };

    const { mockFs } = makeMockFs();
    const { stats } = await downloadReceiptEmails(
      { outputDir: tmpDir },
      {
        fs: mockFs,
        subprocess: { execFileSync: mock(() => {}) },
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (accounts, fn) => fn(client, accounts[0]),
        listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
        createLlmBroker: () => null,
      },
    );

    // The message should be excluded, so found=0 and nothing processed
    expect(stats.found).toBe(0);
  });

  it("sets downloaded to 0 when all messages are excluded by subject filter", async () => {
    const emailDate = new Date("2025-03-07");
    const emailBody = [
      `From: billing@acme.com`,
      `Subject: Payment date approaching`,
      `Date: ${emailDate.toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain`,
      `Message-ID: <excluded-msg2@acme.com>`,
      ``,
      `Your payment date is approaching.`,
    ].join("\r\n");
    const rawBuffer = Buffer.from(emailBody);

    const client = {
      getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
      search: mock(() => Promise.resolve([1])),
      mailbox: { exists: 1 },
      fetch: mock(() => {
        async function* gen() {
          yield {
            uid: 1,
            envelope: {
              date: emailDate,
              from: [{ address: "billing@acme.com", name: "Acme" }],
              subject: "Payment date approaching",
              messageId: "excluded-msg2@acme.com",
            },
          };
        }
        return gen();
      }),
      download: mock(() => {
        async function* gen() {
          yield rawBuffer;
        }
        return Promise.resolve({ content: gen() });
      }),
    };

    const { mockFs } = makeMockFs();
    const { stats } = await downloadReceiptEmails(
      { outputDir: tmpDir },
      {
        fs: mockFs,
        subprocess: { execFileSync: mock(() => {}) },
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (accounts, fn) => fn(client, accounts[0]),
        listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
        createLlmBroker: () => null,
      },
    );

    expect(stats.downloaded).toBe(0);
  });

  it("sets noPdf to 0 when all messages are excluded by subject filter", async () => {
    const emailDate = new Date("2025-03-07");
    const emailBody = [
      `From: billing@acme.com`,
      `Subject: Payment date approaching`,
      `Date: ${emailDate.toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain`,
      `Message-ID: <excluded-msg3@acme.com>`,
      ``,
      `Your payment date is approaching.`,
    ].join("\r\n");
    const rawBuffer = Buffer.from(emailBody);

    const client = {
      getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
      search: mock(() => Promise.resolve([1])),
      mailbox: { exists: 1 },
      fetch: mock(() => {
        async function* gen() {
          yield {
            uid: 1,
            envelope: {
              date: emailDate,
              from: [{ address: "billing@acme.com", name: "Acme" }],
              subject: "Payment date approaching",
              messageId: "excluded-msg3@acme.com",
            },
          };
        }
        return gen();
      }),
      download: mock(() => {
        async function* gen() {
          yield rawBuffer;
        }
        return Promise.resolve({ content: gen() });
      }),
    };

    const { mockFs } = makeMockFs();
    const { stats } = await downloadReceiptEmails(
      { outputDir: tmpDir },
      {
        fs: mockFs,
        subprocess: { execFileSync: mock(() => {}) },
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (accounts, fn) => fn(client, accounts[0]),
        listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
        createLlmBroker: () => null,
      },
    );

    expect(stats.noPdf).toBe(0);
  });
});

// ── source_body_snippet ───────────────────────────────────────────────────────

/** Make an email client that yields a plain-text email (no PDF attachment). */
function makeNoPdfEmailClient(bodyText = "Your payment of $9.99 has been processed.") {
  const emailDate = new Date("2025-03-07");
  const emailBody = [
    `From: billing@acme.com`,
    `Subject: Payment confirmation`,
    `Date: ${emailDate.toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain`,
    `Message-ID: <no-pdf-msg@acme.com>`,
    ``,
    bodyText,
  ].join("\r\n");
  const rawBuffer = Buffer.from(emailBody);

  return {
    getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
    search: mock(() => Promise.resolve([1])),
    mailbox: { exists: 1 },
    fetch: mock(() => {
      async function* gen() {
        yield {
          uid: 1,
          envelope: {
            date: emailDate,
            from: [{ address: "billing@acme.com", name: "Acme" }],
            subject: "Payment confirmation",
            messageId: "no-pdf-msg@acme.com",
          },
        };
      }
      return gen();
    }),
    download: mock(() => {
      async function* gen() {
        yield rawBuffer;
      }
      return Promise.resolve({ content: gen() });
    }),
  };
}

function standardGateways(client, mockFs) {
  return {
    fs: mockFs,
    subprocess: { execFileSync: mock(() => {}) },
    loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
    forEachAccount: async (accounts, fn) => fn(client, accounts[0]),
    listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
    createLlmBroker: () => null,
  };
}

describe("source_body_snippet", () => {
  describe("stores body snippet for no-PDF receipt", () => {
    it("writes a json sidecar", async () => {
      const bodyText = "Your payment of $9.99 has been processed.";
      const client = makeNoPdfEmailClient(bodyText);
      const { mockFs, written } = makeMockFs();
      await downloadReceiptEmails({ outputDir: tmpDir }, standardGateways(client, mockFs));
      const jsonKey = Object.keys(written).find((k) => k.endsWith(".json"));
      expect(jsonKey).toBeDefined();
    });

    it("sidecar has the body snippet", async () => {
      const bodyText = "Your payment of $9.99 has been processed.";
      const client = makeNoPdfEmailClient(bodyText);
      const { mockFs, written } = makeMockFs();
      await downloadReceiptEmails({ outputDir: tmpDir }, standardGateways(client, mockFs));
      const jsonKey = Object.keys(written).find((k) => k.endsWith(".json"));
      const sidecar = JSON.parse(written[jsonKey]);
      expect(sidecar.source_body_snippet).toBe(bodyText);
    });
  });

  describe("stores body snippet for PDF receipt", () => {
    it("writes a json sidecar", async () => {
      const client = makeEmailClient();
      const { mockFs, written } = makeMockFs();
      await downloadReceiptEmails({ outputDir: tmpDir }, standardGateways(client, mockFs));
      const jsonKey = Object.keys(written).find((k) => k.endsWith(".json"));
      expect(jsonKey).toBeDefined();
    });

    it("sidecar has a defined body snippet", async () => {
      const client = makeEmailClient();
      const { mockFs, written } = makeMockFs();
      await downloadReceiptEmails({ outputDir: tmpDir }, standardGateways(client, mockFs));
      const jsonKey = Object.keys(written).find((k) => k.endsWith(".json"));
      const sidecar = JSON.parse(written[jsonKey]);
      expect(sidecar.source_body_snippet).toBeDefined();
    });

    it("body snippet contains the email body text", async () => {
      const client = makeEmailClient();
      const { mockFs, written } = makeMockFs();
      await downloadReceiptEmails({ outputDir: tmpDir }, standardGateways(client, mockFs));
      const jsonKey = Object.keys(written).find((k) => k.endsWith(".json"));
      const sidecar = JSON.parse(written[jsonKey]);
      expect(sidecar.source_body_snippet).toContain("Your invoice is attached");
    });
  });

  it("truncates body snippet at 2000 characters", async () => {
    const longBody = "A".repeat(3000);
    const client = makeNoPdfEmailClient(longBody);
    const { mockFs, written } = makeMockFs();

    await downloadReceiptEmails({ outputDir: tmpDir }, standardGateways(client, mockFs));

    const jsonKey = Object.keys(written).find((k) => k.endsWith(".json"));
    const sidecar = JSON.parse(written[jsonKey]);
    expect(sidecar.source_body_snippet.length).toBe(2000);
  });

  it("preserves existing snippet during reprocess", async () => {
    const outputDir = "/fake/receipts";
    const { mockFs, written } = makeReprocessFs({
      [outputDir]: { isDir: true, entries: ["2026"] },
      [`${outputDir}/2026`]: { isDir: true, entries: ["01"] },
      [`${outputDir}/2026/01`]: { isDir: true, entries: ["Stripe-INV-123.json"] },
      [`${outputDir}/2026/01/Stripe-INV-123.json`]: {
        json: {
          vendor: "Stripe",
          date: "2026-01-15",
          source_email: "billing@stripe.com",
          receipt_file: "Stripe-INV-123.pdf",
          source_body_snippet: "old body text",
        },
      },
      [`${outputDir}/2026/01/Stripe-INV-123.pdf`]: { buffer: FAKE_PDF },
      [join(process.env.HOME, ".local/bin/docling")]: {},
    });

    const gateways = makeReprocessGateways(mockFs);
    await reprocessReceipts({ outputDir }, gateways);

    const jsonPath = `${outputDir}/2026/01/Stripe-INV-123.json`;
    const updated = JSON.parse(written[jsonPath]);
    expect(updated.source_body_snippet).toBe("old body text");
  });
});

// ── collectSidecarFiles ───────────────────────────────────────────────────────

describe("collectSidecarFiles", () => {
  it("returns an empty array when the output directory does not exist", () => {
    const result = collectSidecarFiles("/does/not/exist", REAL_FS);
    expect(result).toHaveLength(0);
  });

  describe("finds JSON sidecars in year/month subdirectories", () => {
    it("returns one sidecar file", () => {
      const monthDir = join(tmpDir, "2026", "01");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "Stripe-INV-123.json"), JSON.stringify({ vendor: "Stripe", date: "2026-01-15" }));
      const result = collectSidecarFiles(tmpDir, REAL_FS);
      expect(result).toHaveLength(1);
    });

    it("sidecar has the correct vendor", () => {
      const monthDir = join(tmpDir, "2026", "01");
      mkdirSync(monthDir, { recursive: true });
      writeFileSync(join(monthDir, "Stripe-INV-123.json"), JSON.stringify({ vendor: "Stripe", date: "2026-01-15" }));
      const result = collectSidecarFiles(tmpDir, REAL_FS);
      expect(result[0].sidecar.vendor).toBe("Stripe");
    });
  });
});

// ── reprocessReceipts ─────────────────────────────────────────────────────────

/** Build a mock fs that simulates a receipt directory with sidecars and PDFs. */
function makeReprocessFs(files = {}) {
  const written = {};
  const fileMap = { ...files };

  return {
    mockFs: {
      exists: mock((p) => p in fileMap),
      readdir: mock((p) => {
        if (fileMap[p]?.isDir) return fileMap[p].entries;
        // Simulate docling output — temp directories get a .md file
        if (p.includes("mailctl-docling-")) return ["output.md"];
        return [];
      }),
      readJson: mock((p) => {
        if (fileMap[p]?.json) return fileMap[p].json;
        throw new Error(`No JSON at ${p}`);
      }),
      readBuffer: mock((p) => fileMap[p]?.buffer ?? Buffer.alloc(0)),
      readText: mock(() => "Invoice #123\nTotal: $49.00\nDate: 2026-01-15"),
      writeFile: mock((p, data) => {
        written[p] = data;
      }),
      mkdir: mock(() => {}),
      rm: mock(() => {}),
    },
    written,
  };
}

function makeReprocessGateways(mockFs, opts = {}) {
  const { llmFails = false, doclingFails = false } = opts;

  return {
    fs: mockFs,
    subprocess: {
      execFileSync: mock(() => {
        if (doclingFails) throw new Error("docling timeout");
      }),
    },
    createLlmBroker: () => ({
      broker: {
        generateObject: mock(async () => {
          if (llmFails) return { ok: false, error: "LLM error" };
          return {
            ok: true,
            value: {
              vendor: "Stripe",
              amount: 49,
              date: "2026-01-15",
              invoice_number: "INV-123",
              is_invoice: true,
              confidence: 0.9,
            },
          };
        }),
      },
      gateway: {},
    }),
  };
}

describe("reprocessReceipts", () => {
  it("scans directory for .json sidecars", async () => {
    const outputDir = "/fake/receipts";
    const { mockFs } = makeReprocessFs({
      [outputDir]: { isDir: true, entries: ["2026"] },
      [`${outputDir}/2026`]: { isDir: true, entries: ["01"] },
      [`${outputDir}/2026/01`]: { isDir: true, entries: ["Stripe-INV-123.json"] },
      [`${outputDir}/2026/01/Stripe-INV-123.json`]: {
        json: {
          vendor: "Stripe",
          date: "2026-01-15",
          source_email: "billing@stripe.com",
          receipt_file: "Stripe-INV-123.pdf",
        },
      },
      [`${outputDir}/2026/01/Stripe-INV-123.pdf`]: { buffer: FAKE_PDF },
      [join(process.env.HOME, ".local/bin/docling")]: {},
    });

    const gateways = makeReprocessGateways(mockFs);
    const result = await reprocessReceipts({ outputDir }, gateways);

    expect(result.reprocessed).toBe(1);
  });

  describe("re-runs extraction on files with matching PDFs", () => {
    function makeStripeFs() {
      const outputDir = "/fake/receipts";
      const { mockFs, written } = makeReprocessFs({
        [outputDir]: { isDir: true, entries: ["2026"] },
        [`${outputDir}/2026`]: { isDir: true, entries: ["01"] },
        [`${outputDir}/2026/01`]: { isDir: true, entries: ["Stripe-INV-123.json"] },
        [`${outputDir}/2026/01/Stripe-INV-123.json`]: {
          json: {
            vendor: "Stripe",
            date: "2026-01-15",
            source_email: "billing@stripe.com",
            receipt_file: "Stripe-INV-123.pdf",
          },
        },
        [`${outputDir}/2026/01/Stripe-INV-123.pdf`]: { buffer: FAKE_PDF },
        [join(process.env.HOME, ".local/bin/docling")]: {},
      });
      return { mockFs, written, outputDir };
    }

    it("writes the updated sidecar", async () => {
      const { mockFs, written, outputDir } = makeStripeFs();
      await reprocessReceipts({ outputDir }, makeReprocessGateways(mockFs));
      expect(written[`${outputDir}/2026/01/Stripe-INV-123.json`]).toBeDefined();
    });

    it("sets reprocessedAt in the updated sidecar", async () => {
      const { mockFs, written, outputDir } = makeStripeFs();
      await reprocessReceipts({ outputDir }, makeReprocessGateways(mockFs));
      const updated = JSON.parse(written[`${outputDir}/2026/01/Stripe-INV-123.json`]);
      expect(updated.reprocessedAt).toBeDefined();
    });
  });

  describe("skips files without PDFs and without body snippet", () => {
    function makeNoPdfFs() {
      const outputDir = "/fake/receipts";
      const { mockFs } = makeReprocessFs({
        [outputDir]: { isDir: true, entries: ["2026"] },
        [`${outputDir}/2026`]: { isDir: true, entries: ["01"] },
        [`${outputDir}/2026/01`]: { isDir: true, entries: ["NoPdf-receipt.json"] },
        [`${outputDir}/2026/01/NoPdf-receipt.json`]: {
          json: { vendor: "GitHub", date: "2026-01-20", source_email: "noreply@github.com" },
        },
        [join(process.env.HOME, ".local/bin/docling")]: {},
      });
      return { mockFs, outputDir };
    }

    it("increments skipped count", async () => {
      const { mockFs, outputDir } = makeNoPdfFs();
      const result = await reprocessReceipts({ outputDir }, makeReprocessGateways(mockFs));
      expect(result.skipped).toBe(1);
    });

    it("does not increment reprocessed count", async () => {
      const { mockFs, outputDir } = makeNoPdfFs();
      const result = await reprocessReceipts({ outputDir }, makeReprocessGateways(mockFs));
      expect(result.reprocessed).toBe(0);
    });
  });

  describe("adds reprocessedAt timestamp to updated sidecar", () => {
    function makeAnthropicFs() {
      const outputDir = "/fake/receipts";
      const { mockFs, written } = makeReprocessFs({
        [outputDir]: { isDir: true, entries: ["2026"] },
        [`${outputDir}/2026`]: { isDir: true, entries: ["02"] },
        [`${outputDir}/2026/02`]: { isDir: true, entries: ["Anthropic-2655.json"] },
        [`${outputDir}/2026/02/Anthropic-2655.json`]: {
          json: {
            vendor: "Anthropic",
            date: "2026-02-01",
            source_email: "billing@anthropic.com",
            receipt_file: "Anthropic-2655.pdf",
            downloadedAt: "2026-03-01T12:00:00Z",
          },
        },
        [`${outputDir}/2026/02/Anthropic-2655.pdf`]: { buffer: FAKE_PDF },
        [join(process.env.HOME, ".local/bin/docling")]: {},
      });
      return { mockFs, written, outputDir };
    }

    it("sets reprocessedAt to a truthy value", async () => {
      const { mockFs, written, outputDir } = makeAnthropicFs();
      await reprocessReceipts({ outputDir }, makeReprocessGateways(mockFs));
      const updated = JSON.parse(written[`${outputDir}/2026/02/Anthropic-2655.json`]);
      expect(updated.reprocessedAt).toBeTruthy();
    });

    it("preserves the original downloadedAt timestamp", async () => {
      const { mockFs, written, outputDir } = makeAnthropicFs();
      await reprocessReceipts({ outputDir }, makeReprocessGateways(mockFs));
      const updated = JSON.parse(written[`${outputDir}/2026/02/Anthropic-2655.json`]);
      expect(updated.downloadedAt).toBe("2026-03-01T12:00:00Z");
    });
  });

  describe("dry-run does not modify files", () => {
    function makeDryRunFs() {
      const outputDir = "/fake/receipts";
      const { mockFs, written } = makeReprocessFs({
        [outputDir]: { isDir: true, entries: ["2026"] },
        [`${outputDir}/2026`]: { isDir: true, entries: ["01"] },
        [`${outputDir}/2026/01`]: { isDir: true, entries: ["Stripe-INV-123.json"] },
        [`${outputDir}/2026/01/Stripe-INV-123.json`]: {
          json: {
            vendor: "Stripe",
            date: "2026-01-15",
            source_email: "billing@stripe.com",
            receipt_file: "Stripe-INV-123.pdf",
          },
        },
        [`${outputDir}/2026/01/Stripe-INV-123.pdf`]: { buffer: FAKE_PDF },
        [join(process.env.HOME, ".local/bin/docling")]: {},
      });
      return { mockFs, written, outputDir };
    }

    it("reports reprocessed count of 1", async () => {
      const { mockFs, outputDir } = makeDryRunFs();
      const result = await reprocessReceipts({ outputDir, dryRun: true }, makeReprocessGateways(mockFs));
      expect(result.reprocessed).toBe(1);
    });

    it("writes no files", async () => {
      const { mockFs, written, outputDir } = makeDryRunFs();
      await reprocessReceipts({ outputDir, dryRun: true }, makeReprocessGateways(mockFs));
      expect(Object.keys(written)).toHaveLength(0);
    });
  });

  it("filters by since date", async () => {
    const outputDir = "/fake/receipts";
    const { mockFs } = makeReprocessFs({
      [outputDir]: { isDir: true, entries: ["2026"] },
      [`${outputDir}/2026`]: { isDir: true, entries: ["01", "03"] },
      [`${outputDir}/2026/01`]: { isDir: true, entries: ["Old-receipt.json"] },
      [`${outputDir}/2026/01/Old-receipt.json`]: {
        json: {
          vendor: "OldVendor",
          date: "2026-01-10",
          source_email: "old@vendor.com",
          receipt_file: "Old-receipt.pdf",
        },
      },
      [`${outputDir}/2026/01/Old-receipt.pdf`]: { buffer: FAKE_PDF },
      [`${outputDir}/2026/03`]: { isDir: true, entries: ["New-receipt.json"] },
      [`${outputDir}/2026/03/New-receipt.json`]: {
        json: {
          vendor: "NewVendor",
          date: "2026-03-01",
          source_email: "new@vendor.com",
          receipt_file: "New-receipt.pdf",
        },
      },
      [`${outputDir}/2026/03/New-receipt.pdf`]: { buffer: FAKE_PDF },
      [join(process.env.HOME, ".local/bin/docling")]: {},
    });

    const gateways = makeReprocessGateways(mockFs);
    const result = await reprocessReceipts(
      {
        outputDir,
        since: new Date("2026-02-01"),
      },
      gateways,
    );

    expect(result.reprocessed).toBe(1);
  });

  describe("handles extraction errors gracefully without overwriting sidecar", () => {
    function makeFailFs() {
      const outputDir = "/fake/receipts";
      const { mockFs, written } = makeReprocessFs({
        [outputDir]: { isDir: true, entries: ["2026"] },
        [`${outputDir}/2026`]: { isDir: true, entries: ["01"] },
        [`${outputDir}/2026/01`]: { isDir: true, entries: ["Fail-receipt.json"] },
        [`${outputDir}/2026/01/Fail-receipt.json`]: {
          json: {
            vendor: "FailVendor",
            date: "2026-01-15",
            source_email: "fail@vendor.com",
            receipt_file: "Fail-receipt.pdf",
          },
        },
        [`${outputDir}/2026/01/Fail-receipt.pdf`]: { buffer: FAKE_PDF },
        [join(process.env.HOME, ".local/bin/docling")]: {},
      });
      return { mockFs, written, outputDir };
    }

    it("increments errors count", async () => {
      const { mockFs, outputDir } = makeFailFs();
      const result = await reprocessReceipts({ outputDir }, makeReprocessGateways(mockFs, { llmFails: true }));
      expect(result.errors).toBe(1);
    });

    it("does not increment reprocessed count", async () => {
      const { mockFs, outputDir } = makeFailFs();
      const result = await reprocessReceipts({ outputDir }, makeReprocessGateways(mockFs, { llmFails: true }));
      expect(result.reprocessed).toBe(0);
    });

    it("does not overwrite the sidecar file", async () => {
      const { mockFs, written, outputDir } = makeFailFs();
      await reprocessReceipts({ outputDir }, makeReprocessGateways(mockFs, { llmFails: true }));
      expect(written[`${outputDir}/2026/01/Fail-receipt.json`]).toBeUndefined();
    });
  });

  it("filters by vendor name", async () => {
    const outputDir = "/fake/receipts";
    const { mockFs } = makeReprocessFs({
      [outputDir]: { isDir: true, entries: ["2026"] },
      [`${outputDir}/2026`]: { isDir: true, entries: ["01"] },
      [`${outputDir}/2026/01`]: { isDir: true, entries: ["Stripe-INV-1.json", "GitHub-GH-2.json"] },
      [`${outputDir}/2026/01/Stripe-INV-1.json`]: {
        json: {
          vendor: "Stripe",
          date: "2026-01-15",
          source_email: "billing@stripe.com",
          receipt_file: "Stripe-INV-1.pdf",
        },
      },
      [`${outputDir}/2026/01/Stripe-INV-1.pdf`]: { buffer: FAKE_PDF },
      [`${outputDir}/2026/01/GitHub-GH-2.json`]: {
        json: {
          vendor: "GitHub",
          date: "2026-01-20",
          source_email: "billing@github.com",
          receipt_file: "GitHub-GH-2.pdf",
        },
      },
      [`${outputDir}/2026/01/GitHub-GH-2.pdf`]: { buffer: FAKE_PDF },
      [join(process.env.HOME, ".local/bin/docling")]: {},
    });

    const gateways = makeReprocessGateways(mockFs);
    const result = await reprocessReceipts({ outputDir, vendor: "stripe" }, gateways);

    expect(result.reprocessed).toBe(1);
  });

  describe("uses body snippet when no PDF exists", () => {
    const outputDir = "/fake/receipts";
    const snippet = "Your payment of $9.99 for GitHub Copilot has been processed. Invoice #GH-2026-001.";

    function makeBodySnippetFs() {
      /** @type {any[]} */
      let llmCalledWith = [];
      const { mockFs, written } = makeReprocessFs({
        [outputDir]: { isDir: true, entries: ["2026"] },
        [`${outputDir}/2026`]: { isDir: true, entries: ["01"] },
        [`${outputDir}/2026/01`]: { isDir: true, entries: ["GitHub-receipt.json"] },
        [`${outputDir}/2026/01/GitHub-receipt.json`]: {
          json: {
            vendor: "GitHub",
            date: "2026-01-20",
            source_email: "noreply@github.com",
            receipt_file: null,
            source_body_snippet: snippet,
          },
        },
        [join(process.env.HOME, ".local/bin/docling")]: {},
      });

      const gateways = {
        fs: mockFs,
        subprocess: { execFileSync: mock(() => {}) },
        createLlmBroker: () => ({
          broker: {
            generateObject: mock(async (messages) => {
              llmCalledWith = messages;
              return {
                ok: true,
                value: {
                  vendor: "GitHub",
                  amount: 9.99,
                  invoice_number: "GH-2026-001",
                  is_invoice: true,
                  confidence: 0.9,
                },
              };
            }),
          },
          gateway: {},
        }),
      };
      return { mockFs, written, gateways, getLlmCalledWith: () => llmCalledWith };
    }

    it("increments reprocessed count", async () => {
      const { gateways } = makeBodySnippetFs();
      const result = await reprocessReceipts({ outputDir }, gateways);
      expect(result.reprocessed).toBe(1);
    });

    it("does not increment skipped count", async () => {
      const { gateways } = makeBodySnippetFs();
      const result = await reprocessReceipts({ outputDir }, gateways);
      expect(result.skipped).toBe(0);
    });

    it("writes the json sidecar", async () => {
      const { written, gateways } = makeBodySnippetFs();
      await reprocessReceipts({ outputDir }, gateways);
      expect(written[`${outputDir}/2026/01/GitHub-receipt.json`]).toBeDefined();
    });

    it("sets reprocessedAt in updated sidecar", async () => {
      const { written, gateways } = makeBodySnippetFs();
      await reprocessReceipts({ outputDir }, gateways);
      const updated = JSON.parse(written[`${outputDir}/2026/01/GitHub-receipt.json`]);
      expect(updated.reprocessedAt).toBeDefined();
    });

    it("calls LLM with the body snippet content", async () => {
      const { gateways, getLlmCalledWith } = makeBodySnippetFs();
      await reprocessReceipts({ outputDir }, gateways);
      const userMsg = getLlmCalledWith().find((m) => m.role === "user");
      expect(userMsg.content).toContain(snippet);
    });
  });

  describe("skips when no PDF and no body snippet", () => {
    function makeNoSnippetFs() {
      const outputDir = "/fake/receipts";
      const { mockFs } = makeReprocessFs({
        [outputDir]: { isDir: true, entries: ["2026"] },
        [`${outputDir}/2026`]: { isDir: true, entries: ["01"] },
        [`${outputDir}/2026/01`]: { isDir: true, entries: ["NoPdf-receipt.json"] },
        [`${outputDir}/2026/01/NoPdf-receipt.json`]: {
          json: { vendor: "GitHub", date: "2026-01-20", source_email: "noreply@github.com", receipt_file: null },
        },
        [join(process.env.HOME, ".local/bin/docling")]: {},
      });
      return { mockFs, outputDir };
    }

    it("increments skipped count", async () => {
      const { mockFs, outputDir } = makeNoSnippetFs();
      const result = await reprocessReceipts({ outputDir }, makeReprocessGateways(mockFs));
      expect(result.skipped).toBe(1);
    });

    it("does not increment reprocessed count", async () => {
      const { mockFs, outputDir } = makeNoSnippetFs();
      const result = await reprocessReceipts({ outputDir }, makeReprocessGateways(mockFs));
      expect(result.reprocessed).toBe(0);
    });

    it("sets reason to no PDF and no body snippet", async () => {
      const { mockFs, outputDir } = makeNoSnippetFs();
      const result = await reprocessReceipts({ outputDir }, makeReprocessGateways(mockFs));
      const skipResult = result.results.find((r) => r.file === "NoPdf-receipt.json");
      expect(skipResult.reason).toBe("no PDF and no body snippet");
    });
  });

  describe("deletes sidecar when reclassified as non-invoice", () => {
    const outputDir = "/fake/receipts";
    const snippet = "Your payment date is approaching...";

    function makeReclassifyFs() {
      const { mockFs, written } = makeReprocessFs({
        [outputDir]: { isDir: true, entries: ["2026"] },
        [`${outputDir}/2026`]: { isDir: true, entries: ["01"] },
        [`${outputDir}/2026/01`]: { isDir: true, entries: ["NotInvoice.json"] },
        [`${outputDir}/2026/01/NotInvoice.json`]: {
          json: {
            vendor: "SomeVendor",
            date: "2026-01-20",
            source_email: "billing@vendor.com",
            receipt_file: null,
            source_body_snippet: snippet,
          },
        },
        [join(process.env.HOME, ".local/bin/docling")]: {},
      });

      const gateways = {
        fs: mockFs,
        subprocess: { execFileSync: mock(() => {}) },
        createLlmBroker: () => ({
          broker: {
            generateObject: mock(async () => {
              return { ok: true, value: { vendor: "SomeVendor", is_invoice: false, confidence: 0.85 } };
            }),
          },
          gateway: {},
        }),
      };
      return { mockFs, written, gateways };
    }

    it("increments reclassified count", async () => {
      const { gateways } = makeReclassifyFs();
      const result = await reprocessReceipts({ outputDir }, gateways);
      expect(result.reclassified).toBe(1);
    });

    it("does not increment reprocessed count", async () => {
      const { gateways } = makeReclassifyFs();
      const result = await reprocessReceipts({ outputDir }, gateways);
      expect(result.reprocessed).toBe(0);
    });

    it("calls fs.rm to delete the sidecar", async () => {
      const { mockFs, gateways } = makeReclassifyFs();
      await reprocessReceipts({ outputDir }, gateways);
      expect(mockFs.rm).toHaveBeenCalledWith(`${outputDir}/2026/01/NotInvoice.json`, { force: true });
    });

    it("does not rewrite the sidecar", async () => {
      const { written, gateways } = makeReclassifyFs();
      await reprocessReceipts({ outputDir }, gateways);
      expect(written[`${outputDir}/2026/01/NotInvoice.json`]).toBeUndefined();
    });
  });

  it("prefers PDF over body snippet when both exist", async () => {
    const outputDir = "/fake/receipts";
    /** @type {any[]} */
    let llmCalledWith = [];
    const { mockFs } = makeReprocessFs({
      [outputDir]: { isDir: true, entries: ["2026"] },
      [`${outputDir}/2026`]: { isDir: true, entries: ["01"] },
      [`${outputDir}/2026/01`]: { isDir: true, entries: ["Stripe-INV-123.json"] },
      [`${outputDir}/2026/01/Stripe-INV-123.json`]: {
        json: {
          vendor: "Stripe",
          date: "2026-01-15",
          source_email: "billing@stripe.com",
          receipt_file: "Stripe-INV-123.pdf",
          source_body_snippet: "email body text",
        },
      },
      [`${outputDir}/2026/01/Stripe-INV-123.pdf`]: { buffer: FAKE_PDF },
      [join(process.env.HOME, ".local/bin/docling")]: {},
    });

    const gateways = {
      fs: mockFs,
      subprocess: { execFileSync: mock(() => {}) },
      createLlmBroker: () => ({
        broker: {
          generateObject: mock(async (messages) => {
            llmCalledWith = messages;
            return {
              ok: true,
              value: {
                vendor: "Stripe",
                amount: 49,
                date: "2026-01-15",
                invoice_number: "INV-123",
                is_invoice: true,
                confidence: 0.9,
              },
            };
          }),
        },
        gateway: {},
      }),
    };
    await reprocessReceipts({ outputDir }, gateways);

    // The LLM should have been called with the docling output, not the body snippet
    const userMsg = llmCalledWith.find((m) => m.role === "user");
    expect(userMsg.content).toContain("Invoice #123"); // from the mock readText (docling output)
  });

  it("does not call LLM with email body text when PDF is available", async () => {
    const outputDir = "/fake/receipts";
    /** @type {any[]} */
    let llmCalledWith = [];
    const { mockFs } = makeReprocessFs({
      [outputDir]: { isDir: true, entries: ["2026"] },
      [`${outputDir}/2026`]: { isDir: true, entries: ["01"] },
      [`${outputDir}/2026/01`]: { isDir: true, entries: ["Stripe-INV-123.json"] },
      [`${outputDir}/2026/01/Stripe-INV-123.json`]: {
        json: {
          vendor: "Stripe",
          date: "2026-01-15",
          source_email: "billing@stripe.com",
          receipt_file: "Stripe-INV-123.pdf",
          source_body_snippet: "email body text",
        },
      },
      [`${outputDir}/2026/01/Stripe-INV-123.pdf`]: { buffer: FAKE_PDF },
      [join(process.env.HOME, ".local/bin/docling")]: {},
    });

    const gateways = {
      fs: mockFs,
      subprocess: { execFileSync: mock(() => {}) },
      createLlmBroker: () => ({
        broker: {
          generateObject: mock(async (messages) => {
            llmCalledWith = messages;
            return {
              ok: true,
              value: {
                vendor: "Stripe",
                amount: 49,
                date: "2026-01-15",
                invoice_number: "INV-123",
                is_invoice: true,
                confidence: 0.9,
              },
            };
          }),
        },
        gateway: {},
      }),
    };
    await reprocessReceipts({ outputDir }, gateways);

    const userMsg = llmCalledWith.find((m) => m.role === "user");
    expect(userMsg.content).not.toContain("email body text");
  });

  it("throws when OPENAI_API_KEY is not set (no LLM broker)", async () => {
    const { mockFs } = makeReprocessFs({});
    await expect(
      reprocessReceipts(
        { outputDir: "/fake" },
        {
          fs: mockFs,
          subprocess: { execFileSync: mock(() => {}) },
          createLlmBroker: () => null,
        },
      ),
    ).rejects.toThrow("OPENAI_API_KEY not set");
  });
});
