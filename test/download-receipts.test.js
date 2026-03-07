import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import {
  loadExistingInvoiceNumbers,
  loadExistingHashes,
  uniqueBaseName,
  searchMailboxForReceipts,
  downloadReceiptEmails,
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

  it("collects invoice numbers from multiple months", () => {
    const march = join(tmpDir, "2025", "03");
    const april = join(tmpDir, "2025", "04");
    mkdirSync(march, { recursive: true });
    mkdirSync(april, { recursive: true });
    writeFileSync(join(march, "a.json"), JSON.stringify({ invoice_number: "INV-001" }));
    writeFileSync(join(april, "b.json"), JSON.stringify({ invoice_number: "INV-002" }));

    const result = loadExistingInvoiceNumbers(tmpDir, REAL_FS);
    expect(result.has("INV-001")).toBe(true);
    expect(result.has("INV-002")).toBe(true);
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

  it("collects hashes from PDFs across multiple months", () => {
    const march = join(tmpDir, "2025", "03");
    const april = join(tmpDir, "2025", "04");
    mkdirSync(march, { recursive: true });
    mkdirSync(april, { recursive: true });
    const otherPdf = Buffer.from("%PDF-different");
    writeFileSync(join(march, "a.pdf"), FAKE_PDF);
    writeFileSync(join(april, "b.pdf"), otherPdf);

    const result = loadExistingHashes(tmpDir, REAL_FS);
    expect(result.size).toBe(2);
    expect(result.has(FAKE_PDF_HASH)).toBe(true);
    expect(result.has(createHash("sha256").update(otherPdf).digest("hex"))).toBe(true);
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
    const usedPaths = new Set([
      `${tmpDir}/acme-inv001`,
      `${tmpDir}/acme-inv001_2`,
    ]);
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

  it("returns an empty array when no UIDs match any search term", async () => {
    const lock = { release: mock(() => {}) };
    const client = {
      getMailboxLock: mock(() => Promise.resolve(lock)),
      search: mock(() => Promise.resolve([])),
      mailbox: { exists: 0 },
      fetch: mock(() => (async function*() {})()),
    };
    const result = await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date());
    expect(result).toHaveLength(0);
  });

  it("deduplicates UIDs across multiple search terms", async () => {
    const lock = { release: mock(() => {}) };
    const fetchedMessages = [];
    const client = {
      getMailboxLock: mock(() => Promise.resolve(lock)),
      // Return the same UID 42 for both "receipt" and "invoice" terms
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
    const result = await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date());
    // Despite multiple search terms returning UID 42, it should appear only once
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe(42);
  });

  it("releases the mailbox lock when done", async () => {
    const lock = { release: mock(() => {}) };
    const client = {
      getMailboxLock: mock(() => Promise.resolve(lock)),
      search: mock(() => Promise.resolve([])),
      mailbox: { exists: 0 },
      fetch: mock(() => (async function*() {})()),
    };
    await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date());
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it("maps envelope fields to result objects", async () => {
    const lock = { release: mock(() => {}) };
    const emailDate = new Date("2025-03-01");
    const client = {
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
    const [result] = await searchMailboxForReceipts(client, "TestAccount", "INBOX", new Date());
    expect(result.uid).toBe(99);
    expect(result.fromAddress).toBe("bill@acme.com");  // lowercased
    expect(result.fromName).toBe("Acme Billing");
    expect(result.subject).toBe("Invoice #123");
    expect(result.messageId).toBe("msg-99@acme.com");
    expect(result.account).toBe("TestAccount");
    expect(result.mailbox).toBe("INBOX");
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
      async function* gen() { yield rawBuffer; }
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
      writeFile: mock((p, data) => { written[p] = data; }),
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
      downloadReceiptEmails({}, {
        fs: mockFs,
        subprocess: { execFileSync: mock(() => {}) },
        loadAccounts: () => [],
        forEachAccount: async () => {},
        listMailboxes: async () => [],
        createLlmBroker: () => null,
      })
    ).rejects.toThrow("No email accounts configured");
  });

  it("throws when the specified account is not found", async () => {
    const { mockFs } = makeMockFs();
    await expect(
      downloadReceiptEmails({ account: "nonexistent" }, {
        fs: mockFs,
        subprocess: { execFileSync: mock(() => {}) },
        loadAccounts: () => [{ name: "Personal", user: "a@b.com" }],
        forEachAccount: async () => {},
        listMailboxes: async () => [],
        createLlmBroker: () => null,
      })
    ).rejects.toThrow('Account "nonexistent" not found');
  });

  it("counts found messages and returns stats", async () => {
    const client = makeEmailClient();
    const { mockFs } = makeMockFs();

    const { stats } = await downloadReceiptEmails({ outputDir: tmpDir }, {
      fs: mockFs,
      subprocess: { execFileSync: mock(() => {}) },
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (accounts, fn) => fn(client, accounts[0]),
      listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
      createLlmBroker: () => null,
    });

    expect(stats.found).toBeGreaterThan(0);
  });

  it("writes a PDF file for emails with PDF attachments", async () => {
    const client = makeEmailClient();
    const { mockFs, written } = makeMockFs();

    await downloadReceiptEmails({ outputDir: tmpDir }, {
      fs: mockFs,
      subprocess: { execFileSync: mock(() => {}) },
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (accounts, fn) => fn(client, accounts[0]),
      listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
      createLlmBroker: () => null,
    });

    const pdfKeys = Object.keys(written).filter((k) => k.endsWith(".pdf"));
    expect(pdfKeys.length).toBeGreaterThan(0);
  });

  it("writes a JSON sidecar alongside every downloaded PDF", async () => {
    const client = makeEmailClient();
    const { mockFs, written } = makeMockFs();

    await downloadReceiptEmails({ outputDir: tmpDir }, {
      fs: mockFs,
      subprocess: { execFileSync: mock(() => {}) },
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (accounts, fn) => fn(client, accounts[0]),
      listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
      createLlmBroker: () => null,
    });

    const jsonKeys = Object.keys(written).filter((k) => k.endsWith(".json"));
    expect(jsonKeys.length).toBeGreaterThan(0);
  });

  it("does not write output files to the output directory in dry-run mode", async () => {
    const client = makeEmailClient();
    const { mockFs, written } = makeMockFs();

    await downloadReceiptEmails({ outputDir: tmpDir, dryRun: true }, {
      fs: mockFs,
      subprocess: { execFileSync: mock(() => {}) },
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (accounts, fn) => fn(client, accounts[0]),
      listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
      createLlmBroker: () => null,
    });

    // No files should be written inside the output directory
    const outputWrites = Object.keys(written).filter((p) => p.startsWith(tmpDir));
    expect(outputWrites).toHaveLength(0);
  });

  it("deduplicates messages with the same message-id across mailboxes", async () => {
    const emailDate = new Date("2025-03-07");
    const boundary = "----=_Part_boundary";
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
        async function* gen() { yield rawBuffer; }
        return Promise.resolve({ content: gen() });
      }),
    };

    const { mockFs } = makeMockFs();
    const { stats } = await downloadReceiptEmails({ outputDir: tmpDir }, {
      fs: mockFs,
      subprocess: { execFileSync: mock(() => {}) },
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (accounts, fn) => fn(client, accounts[0]),
      // Two mailboxes — same message appears in both
      listMailboxes: async () => [
        { path: "INBOX",   specialUse: null, flags: new Set() },
        { path: "Archive", specialUse: null, flags: new Set() },
      ],
      createLlmBroker: () => null,
    });

    // Processed as unique=1 despite appearing in 2 mailboxes
    expect(stats.found).toBe(1);
  });
});
