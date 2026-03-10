import { describe, it, expect } from "bun:test";
import { formatScanSummaryText, formatUnclassifiedText } from "../src/format-scan.js";

// ── formatScanSummaryText ─────────────────────────────────────────────────────

describe("formatScanSummaryText", () => {
  const sender = {
    address: "receipts@shop.example.com",
    name: "Shop Example",
    count: 5,
    accounts: ["iCloud"],
    sampleSubjects: ["Your order #1234", "Your order #5678"],
  };

  it("formats a single sender correctly", () => {
    const text = formatScanSummaryText([sender], 5);

    expect(text).toContain("Shop Example (5 emails)");
    expect(text).toContain("Address:  receipts@shop.example.com");
    expect(text).toContain("Accounts: iCloud");
    expect(text).toContain("Example:  Your order #1234");
  });

  it("formats multiple senders in the order provided", () => {
    const second = {
      address: "billing@vendor.example.com",
      name: "Vendor",
      count: 2,
      accounts: ["Gmail"],
      sampleSubjects: ["Invoice #99"],
    };
    const text = formatScanSummaryText([sender, second], 7);

    expect(text).toContain("Shop Example");
    expect(text).toContain("Vendor");
  });

  it("includes the total count in output", () => {
    const text = formatScanSummaryText([sender], 42);

    expect(text).toContain("Total: 42 receipt emails from 1 unique senders");
  });

  it("shows zero results with empty senders list", () => {
    const text = formatScanSummaryText([], 0);

    expect(text).toContain("=== Receipt Senders Found ===");
    expect(text).toContain("Total: 0 receipt emails from 0 unique senders");
  });

  it("falls back to address when sender has no display name", () => {
    const noName = { ...sender, name: undefined };
    const text = formatScanSummaryText([noName], 5);

    expect(text).toContain("receipts@shop.example.com (5 emails)");
  });

  it("shows N/A when there are no sample subjects", () => {
    const noSubjects = { ...sender, sampleSubjects: [] };
    const text = formatScanSummaryText([noSubjects], 5);

    expect(text).toContain("Example:  N/A");
  });
});

// ── formatUnclassifiedText ────────────────────────────────────────────────────

describe("formatUnclassifiedText", () => {
  const unclassified = [
    {
      address: "billing@example.com",
      name: "Example Billing",
      count: 3,
      accounts: ["iCloud"],
      example: "Your invoice",
      classification: null,
    },
  ];

  it("formats a list of unclassified senders", () => {
    const text = formatUnclassifiedText(unclassified);

    expect(text).toContain("billing@example.com");
    expect(text).toContain("senders need classification");
  });

  it("returns all-classified message when list is empty", () => {
    const text = formatUnclassifiedText([]);

    expect(text).toBe("All senders are classified!");
  });
});
