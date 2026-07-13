import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { processReceiptMessage } from "../src/receipts/process-receipt-message.js";

const FAKE_PDF = Buffer.from("%PDF-1.4 fake content for tests");

let tmpDir;

beforeEach(() => {
  tmpDir = join("/tmp", `mailctl-pm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function buildEmailWithPdf(pdfContent = FAKE_PDF) {
  const emailDate = new Date("2025-03-07");
  const boundary = "----=_Part_boundary";
  const body = [
    `From: billing@acme.com`,
    `Subject: Invoice #TEST-001`,
    `Date: ${emailDate.toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    `Message-ID: <pm-test-msg-001@acme.com>`,
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
  return Buffer.from(body);
}

function buildPlainEmail(bodyText = "Your payment of $9.99 has been processed.") {
  const emailDate = new Date("2025-03-07");
  const body = [
    `From: billing@acme.com`,
    `Subject: Payment confirmation`,
    `Date: ${emailDate.toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain`,
    `Message-ID: <pm-no-pdf-msg@acme.com>`,
    ``,
    bodyText,
  ].join("\r\n");
  return Buffer.from(body);
}

function buildEmptyExtractionEmail() {
  const emailDate = new Date("2025-03-07");
  const body = [
    `From: newsletter@acme.com`,
    `Subject: Thank you for being a subscriber`,
    `Date: ${emailDate.toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain`,
    `Message-ID: <pm-empty-extraction-msg@acme.com>`,
    ``,
    `Thank you for being a subscriber. We appreciate your business.`,
  ].join("\r\n");
  return Buffer.from(body);
}

function makeDownloadClient(rawBuffer) {
  return {
    download: mock(() => {
      async function* gen() {
        yield rawBuffer;
      }
      return Promise.resolve({ content: gen() });
    }),
  };
}

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

function makeMsg(overrides = {}) {
  return {
    uid: 1,
    fromAddress: "billing@acme.com",
    fromName: "Acme",
    date: new Date("2025-03-07"),
    subject: "Invoice #TEST-001",
    mailbox: "INBOX",
    ...overrides,
  };
}

function makeContext(opts = /** @type {any} */ ({})) {
  const { mockFs, outputDir, ...overrides } = opts;
  return {
    accountName: "Test",
    outputDir: outputDir || tmpDir,
    dryRun: false,
    includeEmpty: false,
    llm: null,
    existingInvoiceNumbers: new Set(),
    existingHashes: new Set(),
    usedPaths: new Set(),
    fs: mockFs || makeMockFs().mockFs,
    subprocess: /** @type {any} */ ({ execFileSync: mock(() => {}) }),
    onProgress: mock(() => {}),
    ...overrides,
  };
}

// ── processReceiptMessage — PDF download ──────────────────────────────────────

describe("processReceiptMessage with PDF attachment", () => {
  it("writes a PDF file for emails with PDF attachments", async () => {
    const { mockFs, written } = makeMockFs();
    const client = makeDownloadClient(buildEmailWithPdf());
    await processReceiptMessage(client, makeMsg(), makeContext({ mockFs }));
    const pdfKeys = Object.keys(written).filter((k) => k.endsWith(".pdf"));
    expect(pdfKeys.length).toBeGreaterThan(0);
  });

  it("writes a JSON sidecar alongside the downloaded PDF", async () => {
    const { mockFs, written } = makeMockFs();
    const client = makeDownloadClient(buildEmailWithPdf());
    await processReceiptMessage(client, makeMsg(), makeContext({ mockFs }));
    const jsonKeys = Object.keys(written).filter((k) => k.endsWith(".json"));
    expect(jsonKeys.length).toBeGreaterThan(0);
  });

  it("does not write output files in dry-run mode", async () => {
    const { mockFs, written } = makeMockFs();
    const client = makeDownloadClient(buildEmailWithPdf());
    await processReceiptMessage(client, makeMsg(), makeContext({ mockFs, dryRun: true }));
    const outputWrites = Object.keys(written).filter((p) => p.startsWith(tmpDir));
    expect(outputWrites).toHaveLength(0);
  });
});

// ── source_body_snippet ───────────────────────────────────────────────────────

describe("source_body_snippet (no-PDF receipt)", () => {
  it("writes a json sidecar for a plain-text receipt", async () => {
    const { mockFs, written } = makeMockFs();
    const client = makeDownloadClient(buildPlainEmail("Your payment of $9.99 has been processed."));
    await processReceiptMessage(client, makeMsg({ subject: "Payment confirmation" }), makeContext({ mockFs }));
    const jsonKey = Object.keys(written).find((k) => k.endsWith(".json"));
    expect(jsonKey).toBeDefined();
  });

  it("sidecar has the body snippet", async () => {
    const bodyText = "Your payment of $9.99 has been processed.";
    const { mockFs, written } = makeMockFs();
    const client = makeDownloadClient(buildPlainEmail(bodyText));
    await processReceiptMessage(client, makeMsg({ subject: "Payment confirmation" }), makeContext({ mockFs }));
    const jsonKey = Object.keys(written).find((k) => k.endsWith(".json"));
    const sidecar = JSON.parse(written[jsonKey]);
    expect(sidecar.source_body_snippet).toBe(bodyText);
  });
});

describe("source_body_snippet (PDF receipt)", () => {
  it("writes a json sidecar for a PDF receipt", async () => {
    const { mockFs, written } = makeMockFs();
    const client = makeDownloadClient(buildEmailWithPdf());
    await processReceiptMessage(client, makeMsg(), makeContext({ mockFs }));
    const jsonKey = Object.keys(written).find((k) => k.endsWith(".json"));
    expect(jsonKey).toBeDefined();
  });

  it("sidecar has a defined body snippet", async () => {
    const { mockFs, written } = makeMockFs();
    const client = makeDownloadClient(buildEmailWithPdf());
    await processReceiptMessage(client, makeMsg(), makeContext({ mockFs }));
    const jsonKey = Object.keys(written).find((k) => k.endsWith(".json"));
    const sidecar = JSON.parse(written[jsonKey]);
    expect(sidecar.source_body_snippet).toBeDefined();
  });

  it("body snippet contains the email body text", async () => {
    const { mockFs, written } = makeMockFs();
    const client = makeDownloadClient(buildEmailWithPdf());
    await processReceiptMessage(client, makeMsg(), makeContext({ mockFs }));
    const jsonKey = Object.keys(written).find((k) => k.endsWith(".json"));
    const sidecar = JSON.parse(written[jsonKey]);
    expect(sidecar.source_body_snippet).toContain("Your invoice is attached");
  });

  it("truncates body snippet at 2000 characters", async () => {
    const longBody = "A".repeat(3000);
    const { mockFs, written } = makeMockFs();
    const client = makeDownloadClient(buildPlainEmail(longBody));
    await processReceiptMessage(client, makeMsg({ subject: "Long body" }), makeContext({ mockFs, includeEmpty: true }));
    const jsonKey = Object.keys(written).find((k) => k.endsWith(".json"));
    const sidecar = JSON.parse(written[jsonKey]);
    expect(sidecar.source_body_snippet.length).toBe(2000);
  });
});

// ── error handling ────────────────────────────────────────────────────────────

describe("error handling", () => {
  it("returns error action when client.download rejects", async () => {
    const client = {
      download: mock(() => Promise.reject(new Error("connection lost"))),
    };
    const { mockFs } = makeMockFs();
    const result = await processReceiptMessage(client, makeMsg(), makeContext({ mockFs }));

    expect(result.action).toBe("error");
  });

  it("emits a progress event when client.download rejects", async () => {
    const client = {
      download: mock(() => Promise.reject(new Error("connection lost"))),
    };
    const onProgress = mock(() => {});
    const { mockFs } = makeMockFs();
    await processReceiptMessage(client, makeMsg(), makeContext({ mockFs, onProgress }));

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: "process-error", severity: "error" }));
  });
});

// ── empty extraction skipping ─────────────────────────────────────────────────

describe("empty extraction skipping", () => {
  it("returns skippedEmpty action when extraction is empty by default", async () => {
    const { mockFs } = makeMockFs();
    const client = makeDownloadClient(buildEmptyExtractionEmail());
    const result = await processReceiptMessage(
      client,
      makeMsg({ fromAddress: "newsletter@acme.com", subject: "Thank you for being a subscriber" }),
      makeContext({ mockFs }),
    );
    expect(result.action).toBe("skippedEmpty");
  });

  it("skips sidecar when extraction is empty by default", async () => {
    const { mockFs, written } = makeMockFs();
    const client = makeDownloadClient(buildEmptyExtractionEmail());
    await processReceiptMessage(
      client,
      makeMsg({ fromAddress: "newsletter@acme.com", subject: "Thank you for being a subscriber" }),
      makeContext({ mockFs }),
    );
    const jsonKeys = Object.keys(written).filter((k) => k.endsWith(".json"));
    expect(jsonKeys).toHaveLength(0);
  });

  it("writes sidecar when includeEmpty is set", async () => {
    const { mockFs, written } = makeMockFs();
    const client = makeDownloadClient(buildEmptyExtractionEmail());
    await processReceiptMessage(
      client,
      makeMsg({ fromAddress: "newsletter@acme.com", subject: "Thank you for being a subscriber" }),
      makeContext({ mockFs, includeEmpty: true }),
    );
    const jsonKeys = Object.keys(written).filter((k) => k.endsWith(".json"));
    expect(jsonKeys.length).toBeGreaterThan(0);
  });
});
