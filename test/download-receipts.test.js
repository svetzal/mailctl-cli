import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { downloadReceiptEmails, listReceiptVendors, reprocessReceipts } from "../src/download-receipts.js";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const HOME = process.env.HOME ?? "/tmp";

const FAKE_PDF = Buffer.from("%PDF-1.4 fake content for tests");

let tmpDir;

beforeEach(() => {
  tmpDir = join("/tmp", `mailctl-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
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
      [join(HOME, ".local/bin/docling")]: {},
    });

    const gateways = makeReprocessGateways(mockFs);
    await reprocessReceipts({ outputDir }, gateways);

    const jsonPath = `${outputDir}/2026/01/Stripe-INV-123.json`;
    const updated = JSON.parse(written[jsonPath]);
    expect(updated.source_body_snippet).toBe("old body text");
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
      [join(HOME, ".local/bin/docling")]: {},
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
        [join(HOME, ".local/bin/docling")]: {},
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
        [join(HOME, ".local/bin/docling")]: {},
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
        [join(HOME, ".local/bin/docling")]: {},
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
        [join(HOME, ".local/bin/docling")]: {},
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
      [join(HOME, ".local/bin/docling")]: {},
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
        [join(HOME, ".local/bin/docling")]: {},
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
      [join(HOME, ".local/bin/docling")]: {},
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
        [join(HOME, ".local/bin/docling")]: {},
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
        [join(HOME, ".local/bin/docling")]: {},
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
        [join(HOME, ".local/bin/docling")]: {},
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
      [join(HOME, ".local/bin/docling")]: {},
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
      [join(HOME, ".local/bin/docling")]: {},
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

// ── listReceiptVendors ────────────────────────────────────────────────────────

function _makeVendorGateways(searchResults = [], overrides = {}) {
  return {
    loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
    forEachAccount: async (accounts, fn) => fn({}, accounts[0]),
    listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
    searchAccountForReceipts: async () => searchResults,
    ...overrides,
  };
}

describe("listReceiptVendors", () => {
  it("throws when no accounts are configured", async () => {
    await expect(
      listReceiptVendors(
        {},
        {
          loadAccounts: () => [],
          forEachAccount: async () => {},
          listMailboxes: async () => [],
        },
      ),
    ).rejects.toThrow("No accounts configured");
  });

  it("returns an empty array when no receipts are found", async () => {
    const gateways = {
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (_accounts, fn) => {
        // Call fn but the receipt search returns nothing for this account
        await fn({}, _accounts[0]);
      },
      listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
    };

    const vendors = await listReceiptVendors({}, gateways);

    expect(vendors).toEqual([]);
  });

  it("aggregates vendor counts from search results", async () => {
    // Two emails from the same vendor address
    const msgs = [
      {
        fromAddress: "billing@acme.com",
        fromName: "Acme",
        uid: 1,
        mailbox: "INBOX",
        date: new Date("2025-01-01"),
        subject: "Invoice",
      },
      {
        fromAddress: "billing@acme.com",
        fromName: "Acme",
        uid: 2,
        mailbox: "INBOX",
        date: new Date("2025-02-01"),
        subject: "Invoice",
      },
      {
        fromAddress: "orders@shop.com",
        fromName: "Shop",
        uid: 3,
        mailbox: "INBOX",
        date: new Date("2025-01-15"),
        subject: "Receipt",
      },
    ];

    const _gateways = {
      loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
      forEachAccount: async (_accounts, fn) => {
        // Provide a client whose searchAccountForReceipts returns our msgs
        await fn({ _msgs: msgs }, _accounts[0]);
      },
      listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
    };

    // We need to override the searchAccountForReceipts dependency via a custom
    // forEachAccount that injects results through the receipt search pipeline.
    // Since listReceiptVendors uses searchAccountForReceipts internally, we
    // need to provide a real-enough client mock that the receipt search pipeline
    // returns our messages. The simplest approach is to have the mock IMAP search
    // return UIDs and envelopes for our messages.
    const _emailDate = new Date("2025-01-01");
    const client = {
      getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
      search: mock(() => Promise.resolve([1, 2, 3])),
      mailbox: { exists: 3 },
      fetch: mock(() => {
        async function* gen() {
          for (const msg of msgs) {
            yield {
              uid: msg.uid,
              envelope: {
                date: msg.date,
                from: [{ address: msg.fromAddress, name: msg.fromName }],
                subject: msg.subject,
                messageId: `msg-${msg.uid}@example.com`,
              },
            };
          }
        }
        return gen();
      }),
    };

    const vendors = await listReceiptVendors(
      {},
      {
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (_accounts, fn) => fn(client, _accounts[0]),
        listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
      },
    );

    const acme = vendors.find((v) => v.address === "billing@acme.com");
    expect(acme).toBeDefined();
    expect(acme?.count).toBe(2);
  });

  it("sorts vendors by count descending", async () => {
    const emailDate = new Date("2025-01-01");

    // Build distinct fetch calls: one returns 1 item, the other returns 3 items
    // We'll use a single client that returns different counts per search term.
    // The simplest way: three messages from domainA and one from domainB.
    const msgs = [
      { uid: 1, address: "a@frequent.com", name: "Frequent", subject: "Invoice" },
      { uid: 2, address: "a@frequent.com", name: "Frequent", subject: "Invoice" },
      { uid: 3, address: "a@frequent.com", name: "Frequent", subject: "Invoice" },
      { uid: 4, address: "b@rare.com", name: "Rare", subject: "Receipt" },
    ];

    const client = {
      getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
      search: mock(() => Promise.resolve(msgs.map((m) => m.uid))),
      mailbox: { exists: msgs.length },
      fetch: mock(() => {
        async function* gen() {
          for (const msg of msgs) {
            yield {
              uid: msg.uid,
              envelope: {
                date: emailDate,
                from: [{ address: msg.address, name: msg.name }],
                subject: msg.subject,
                messageId: `msg-${msg.uid}@example.com`,
              },
            };
          }
        }
        return gen();
      }),
    };

    const vendors = await listReceiptVendors(
      {},
      {
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (_accounts, fn) => fn(client, _accounts[0]),
        listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
      },
    );

    expect(vendors.length).toBeGreaterThanOrEqual(2);
    expect(vendors[0].count).toBeGreaterThanOrEqual(vendors[1].count);
  });

  it("includes vendor display name and address in each result", async () => {
    const client = {
      getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
      search: mock(() => Promise.resolve([5])),
      mailbox: { exists: 1 },
      fetch: mock(() => {
        async function* gen() {
          yield {
            uid: 5,
            envelope: {
              date: new Date("2025-03-01"),
              from: [{ address: "billing@vendor.com", name: "Vendor Corp" }],
              subject: "Invoice",
              messageId: "msg-5@example.com",
            },
          };
        }
        return gen();
      }),
    };

    const vendors = await listReceiptVendors(
      {},
      {
        loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
        forEachAccount: async (_accounts, fn) => fn(client, _accounts[0]),
        listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
      },
    );

    const vendor = vendors.find((v) => v.address === "billing@vendor.com");
    expect(vendor?.vendor).toBeDefined();
    expect(vendor?.address).toBe("billing@vendor.com");
  });
});
