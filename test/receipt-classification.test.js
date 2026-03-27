import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { downloadReceiptEmails, RECEIPT_EXTRACTION_SCHEMA } from "../src/download-receipts.js";
import { makeLock } from "./helpers.js";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const _FAKE_PDF = Buffer.from("%PDF-1.4 fake content for tests");

let tmpDir;

beforeEach(() => {
  tmpDir = join("/tmp", `mailctl-classify-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/** Build a mock email client yielding one plain-text email. */
function makeEmailClient(subject = "Invoice #TEST-001") {
  const emailDate = new Date("2025-03-07");
  const emailBody = [
    `From: billing@acme.com`,
    `Subject: ${subject}`,
    `Date: ${emailDate.toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain`,
    `Message-ID: <classify-msg@acme.com>`,
    ``,
    `Your payment of $39.00 has been processed.`,
  ].join("\r\n");
  const rawBuffer = Buffer.from(emailBody);

  return {
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    search: mock(() => Promise.resolve([1])),
    mailbox: { exists: 1 },
    fetch: mock(() => {
      async function* gen() {
        yield {
          uid: 1,
          envelope: {
            date: emailDate,
            from: [{ address: "billing@acme.com", name: "Acme" }],
            subject,
            messageId: "classify-msg@acme.com",
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

/** Mock fs gateway that captures writes. */
function makeMockFs() {
  const written = {};
  return {
    mockFs: {
      exists: mock(() => false),
      readdir: mock(() => []),
      readJson: mock(() => ({})),
      readBuffer: mock(() => Buffer.alloc(0)),
      readText: mock(() => ""),
      writeFile: mock((p, data) => {
        written[p] = data;
      }),
      mkdir: mock(() => {}),
      rm: mock(() => {}),
    },
    written,
  };
}

/** Build standard gateways with a custom LLM response. */
function makeGateways(client, mockFs, llmResponse) {
  return {
    fs: mockFs,
    subprocess: { execFileSync: mock(() => {}) },
    loadAccounts: () => [{ name: "Test", user: "test@example.com" }],
    forEachAccount: async (accounts, fn) => fn(client, accounts[0]),
    listMailboxes: async () => [{ path: "INBOX", specialUse: null, flags: new Set() }],
    createLlmBroker: () => ({
      broker: {
        generateObject: mock(async () => ({ ok: true, value: llmResponse })),
      },
      gateway: {},
    }),
  };
}

// ── Receipt classification tests ──────────────────────────────────────────────

describe("receipt classification", () => {
  it("writes sidecar for actual invoice with high confidence", async () => {
    const client = makeEmailClient();
    const { mockFs, written } = makeMockFs();
    const gateways = makeGateways(client, mockFs, {
      vendor: "GitHub",
      amount: 39,
      date: "2025-03-07",
      currency: "USD",
      is_invoice: true,
      confidence: 0.95,
      invoice_number: null,
      service: null,
      tax_amount: null,
      tax_type: null,
    });

    await downloadReceiptEmails({ outputDir: tmpDir }, gateways);

    const jsonKey = Object.keys(written).find((k) => k.endsWith(".json"));
    expect(jsonKey).toBeDefined();
    const sidecar = JSON.parse(written[jsonKey]);
    expect(sidecar.is_invoice).toBe(true);
    expect(sidecar.confidence).toBe(0.95);
  });

  it("skips payment reminder classified as non-invoice", async () => {
    const client = makeEmailClient("Your subscription renewal");
    const { mockFs, written } = makeMockFs();
    const gateways = makeGateways(client, mockFs, {
      vendor: "JetBrains",
      amount: null,
      date: "2025-03-07",
      is_invoice: false,
      confidence: 0.85,
      invoice_number: null,
      currency: null,
      service: null,
      tax_amount: null,
      tax_type: null,
    });

    const { stats } = await downloadReceiptEmails({ outputDir: tmpDir }, gateways);

    const jsonKeys = Object.keys(written).filter((k) => k.endsWith(".json"));
    expect(jsonKeys).toHaveLength(0);
    expect(stats.skipped).toBe(1);
  });

  it("skips low confidence results even when is_invoice is true", async () => {
    const client = makeEmailClient("Invoice");
    const { mockFs, written } = makeMockFs();
    const gateways = makeGateways(client, mockFs, {
      vendor: "Unknown",
      amount: null,
      date: "2025-03-07",
      is_invoice: true,
      confidence: 0.3,
      invoice_number: null,
      currency: null,
      service: null,
      tax_amount: null,
      tax_type: null,
    });

    const { stats } = await downloadReceiptEmails({ outputDir: tmpDir }, gateways);

    const jsonKeys = Object.keys(written).filter((k) => k.endsWith(".json"));
    expect(jsonKeys).toHaveLength(0);
    expect(stats.skipped).toBe(1);
  });

  it("skips credit order classified as non-invoice", async () => {
    const client = makeEmailClient("Your order is complete");
    const { mockFs, written } = makeMockFs();
    const gateways = makeGateways(client, mockFs, {
      vendor: "Audible",
      amount: 0,
      date: "2025-03-07",
      is_invoice: false,
      confidence: 0.9,
      invoice_number: null,
      currency: null,
      service: null,
      tax_amount: null,
      tax_type: null,
    });

    const { stats } = await downloadReceiptEmails({ outputDir: tmpDir }, gateways);

    const jsonKeys = Object.keys(written).filter((k) => k.endsWith(".json"));
    expect(jsonKeys).toHaveLength(0);
    expect(stats.skipped).toBe(1);
  });

  it("passes medium confidence invoice (0.6 >= 0.4 threshold)", async () => {
    const client = makeEmailClient("Receipt");
    const { mockFs, written } = makeMockFs();
    const gateways = makeGateways(client, mockFs, {
      vendor: "Apple",
      amount: 12.99,
      date: "2025-03-07",
      currency: "USD",
      is_invoice: true,
      confidence: 0.6,
      invoice_number: null,
      service: null,
      tax_amount: null,
      tax_type: null,
    });

    await downloadReceiptEmails({ outputDir: tmpDir }, gateways);

    const jsonKeys = Object.keys(written).filter((k) => k.endsWith(".json"));
    expect(jsonKeys.length).toBeGreaterThan(0);
    const sidecar = JSON.parse(written[jsonKeys[0]]);
    expect(sidecar.is_invoice).toBe(true);
    expect(sidecar.confidence).toBe(0.6);
  });
});

// ── Schema field assertions ───────────────────────────────────────────────────

describe("RECEIPT_EXTRACTION_SCHEMA", () => {
  it("includes is_invoice and confidence in required fields", () => {
    expect(RECEIPT_EXTRACTION_SCHEMA.required).toContain("is_invoice");
    expect(RECEIPT_EXTRACTION_SCHEMA.required).toContain("confidence");
  });

  it("defines is_invoice as boolean type", () => {
    expect(RECEIPT_EXTRACTION_SCHEMA.properties.is_invoice.type).toBe("boolean");
  });

  it("defines confidence as number type", () => {
    expect(RECEIPT_EXTRACTION_SCHEMA.properties.confidence.type).toBe("number");
  });
});
