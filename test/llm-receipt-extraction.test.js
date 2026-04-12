import { describe, expect, it, mock } from "bun:test";
import { createLlmBroker, extractReceiptMetadata, RECEIPT_EXTRACTION_SCHEMA } from "../src/llm-receipt-extraction.js";

// ── createLlmBroker ───────────────────────────────────────────────────────────

describe("createLlmBroker", () => {
  it("returns null when no API key is provided", () => {
    // Temporarily clear env var to ensure no fallback
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const result = createLlmBroker(null);

    process.env.OPENAI_API_KEY = saved;
    expect(result).toBeNull();
  });

  it("returns null when apiKey is null and OPENAI_API_KEY is not set", () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const result = createLlmBroker(null, () => {});

    process.env.OPENAI_API_KEY = saved;
    expect(result).toBeNull();
  });
});

// ── RECEIPT_EXTRACTION_SCHEMA ─────────────────────────────────────────────────

describe("RECEIPT_EXTRACTION_SCHEMA", () => {
  it("has is_invoice in required fields", () => {
    expect(RECEIPT_EXTRACTION_SCHEMA.required).toContain("is_invoice");
  });

  it("has vendor in required fields", () => {
    expect(RECEIPT_EXTRACTION_SCHEMA.required).toContain("vendor");
  });

  it("has confidence in required fields", () => {
    expect(RECEIPT_EXTRACTION_SCHEMA.required).toContain("confidence");
  });

  it("defines is_invoice as boolean type", () => {
    expect(RECEIPT_EXTRACTION_SCHEMA.properties.is_invoice.type).toBe("boolean");
  });

  it("defines confidence as number type", () => {
    expect(RECEIPT_EXTRACTION_SCHEMA.properties.confidence.type).toBe("number");
  });

  it("defines vendor as string type", () => {
    expect(RECEIPT_EXTRACTION_SCHEMA.properties.vendor.type).toBe("string");
  });
});

// ── extractReceiptMetadata ────────────────────────────────────────────────────

describe("extractReceiptMetadata", () => {
  it("falls back to regex when llmBroker is null", async () => {
    const emailDate = new Date("2025-03-07");
    const result = await extractReceiptMetadata(
      null,
      "Your invoice total is $49.00",
      "Invoice #123",
      "billing@acme.com",
      "Acme",
      emailDate,
    );

    // Should return a metadata object (from regex fallback)
    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
  });

  it("falls back to regex when llm object is null (no broker field)", async () => {
    const emailDate = new Date("2025-03-07");
    const result = await extractReceiptMetadata(
      null,
      "Your payment of $9.99 has been processed.",
      "Payment confirmation",
      "billing@acme.com",
      "Acme",
      emailDate,
    );

    expect(result).toBeDefined();
    expect(result.source_email).toBe("billing@acme.com");
  });

  it("uses LLM result when broker succeeds", async () => {
    const emailDate = new Date("2025-03-07");
    const mockBroker = {
      generateObject: mock(async () => ({
        ok: true,
        value: {
          vendor: "GitHub",
          amount: 39,
          date: "2025-03-07",
          currency: "USD",
          is_invoice: true,
          confidence: 0.95,
          invoice_number: "GH-001",
          service: "Copilot Business",
          tax_amount: null,
          tax_type: null,
        },
      })),
    };

    const result = await extractReceiptMetadata(
      { broker: mockBroker },
      "Your GitHub Copilot Business invoice",
      "Invoice GH-001",
      "billing@github.com",
      "GitHub",
      emailDate,
    );

    expect(result).not.toBeNull();
    expect(result.invoice_number).toBe("GH-001");
  });

  it("falls back to regex when LLM broker throws", async () => {
    const emailDate = new Date("2025-03-07");
    const mockBroker = {
      generateObject: mock(async () => {
        throw new Error("LLM unavailable");
      }),
    };

    const events = [];
    const result = await extractReceiptMetadata(
      { broker: mockBroker },
      "Invoice total $49.00",
      "Invoice #TEST",
      "billing@acme.com",
      "Acme",
      emailDate,
      (e) => events.push(e),
    );

    // Should have fallen back and returned a result
    expect(result).not.toBeNull();
    // Should have emitted an error event
    const errEvent = events.find((e) => e.type === "llm-extraction-failed");
    expect(errEvent).toBeDefined();
  });
});
