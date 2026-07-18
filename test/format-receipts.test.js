import { describe, expect, it } from "bun:test";
import {
  buildClassifyJson,
  buildScanJson,
  formatClassifyOutput,
  formatDownloadText,
  formatImportClassificationsOutput,
  formatScanOutput,
  formatScanText,
  formatSortOutput,
  formatSortText,
  formatUnclassifiedText,
} from "../src/format-receipts.js";

// ── format-scan ───────────────────────────────────────────────────────────────

describe("formatScanText", () => {
  const sender = {
    address: "receipts@shop.example.com",
    name: "Shop Example",
    count: 5,
    accounts: ["iCloud"],
    sampleSubjects: ["Your order #1234", "Your order #5678"],
  };

  describe("formats a single sender correctly", () => {
    const text = formatScanText(5, [sender]);

    it("shows sender name and count", () => {
      expect(text).toContain("Shop Example (5 emails)");
    });

    it("shows sender address", () => {
      expect(text).toContain("Address:  receipts@shop.example.com");
    });

    it("shows accounts", () => {
      expect(text).toContain("Accounts: iCloud");
    });

    it("shows example subject", () => {
      expect(text).toContain("Example:  Your order #1234");
    });
  });

  describe("formats multiple senders in the order provided", () => {
    const second = {
      address: "billing@vendor.example.com",
      name: "Vendor",
      count: 2,
      accounts: ["Gmail"],
      sampleSubjects: ["Invoice #99"],
    };
    const text = formatScanText(7, [sender, second]);

    it("shows first sender", () => {
      expect(text).toContain("Shop Example");
    });

    it("shows second sender", () => {
      expect(text).toContain("Vendor");
    });
  });

  it("includes the total count in output", () => {
    const text = formatScanText(42, [sender]);

    expect(text).toContain("Total: 42 receipt emails from 1 unique senders");
  });

  describe("shows zero results with empty senders list", () => {
    const text = formatScanText(0, []);

    it("shows header", () => {
      expect(text).toContain("=== Receipt Senders Found ===");
    });

    it("shows zero total", () => {
      expect(text).toContain("Total: 0 receipt emails from 0 unique senders");
    });
  });

  it("falls back to address when sender has no display name", () => {
    const noName = { ...sender, name: undefined };
    const text = formatScanText(5, [noName]);

    expect(text).toContain("receipts@shop.example.com (5 emails)");
  });

  it("shows N/A when there are no sample subjects", () => {
    const noSubjects = { ...sender, sampleSubjects: [] };
    const text = formatScanText(5, [noSubjects]);

    expect(text).toContain("Example:  N/A");
  });
});

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

  describe("formats a list of unclassified senders", () => {
    const text = formatUnclassifiedText(unclassified);

    it("shows sender address", () => {
      expect(text).toContain("billing@example.com");
    });

    it("shows classification prompt", () => {
      expect(text).toContain("senders need classification");
    });
  });

  it("returns all-classified message when list is empty", () => {
    const text = formatUnclassifiedText([]);

    expect(text).toBe("All senders are classified!");
  });
});

describe("buildScanJson", () => {
  const senders = [{ address: "shop@example.com", name: "Shop", count: 5, accounts: ["iCloud"], sampleSubjects: [] }];

  it("includes total", () => {
    const result = buildScanJson(42, senders);

    expect(result.total).toBe(42);
  });

  it("includes senders array", () => {
    const result = buildScanJson(42, senders);

    expect(result.senders).toBe(senders);
  });
});

describe("buildClassifyJson", () => {
  const unclassified = [
    {
      address: "shop@example.com",
      name: "Shop",
      count: 5,
      accounts: ["iCloud"],
      example: "Invoice #1",
      classification: null,
    },
  ];

  it("wraps the list under unclassified key", () => {
    const result = buildClassifyJson(unclassified);

    expect(result.unclassified).toBe(unclassified);
  });
});

describe("formatScanOutput", () => {
  it("returns JSON when json is true", () => {
    const result = formatScanOutput(true, 3, []);
    expect(JSON.parse(result)).toHaveProperty("total", 3);
  });
});

describe("formatClassifyOutput", () => {
  it("returns JSON when json is true", () => {
    const result = formatClassifyOutput(true, []);
    expect(JSON.parse(result)).toHaveProperty("unclassified");
  });
});

// ── format-sort ───────────────────────────────────────────────────────────────

describe("formatSortText", () => {
  it("includes the Sort Complete header", () => {
    const text = formatSortText({ moved: 0, skipped: 0, unclassified: 0 });
    expect(text).toContain("=== Sort Complete ===");
  });

  it("shows moved count", () => {
    const text = formatSortText({ moved: 5, skipped: 0, unclassified: 0 });
    expect(text).toContain("Moved:        5");
  });

  it("shows skipped count", () => {
    const text = formatSortText({ moved: 0, skipped: 3, unclassified: 0 });
    expect(text).toContain("Skipped:      3");
  });

  it("shows unclassified count with default note", () => {
    const text = formatSortText({ moved: 0, skipped: 0, unclassified: 2 });
    expect(text).toContain("Unclassified: 2 (defaulted to personal)");
  });

  describe("formats all stats together correctly", () => {
    const text = formatSortText({ moved: 10, skipped: 5, unclassified: 1 });

    it("shows moved count", () => {
      expect(text).toContain("Moved:        10");
    });

    it("shows skipped count", () => {
      expect(text).toContain("Skipped:      5");
    });

    it("shows unclassified count", () => {
      expect(text).toContain("Unclassified: 1 (defaulted to personal)");
    });
  });
});

describe("formatSortOutput", () => {
  it("returns JSON when json is true", () => {
    const result = formatSortOutput(true, { moved: 4, skipped: 2, alreadySorted: 1, unclassified: 3 });
    const parsed = JSON.parse(result);
    expect(parsed.moved).toBe(4);
    expect(parsed.alreadySorted).toBe(1);
  });
});

// ── format-download ───────────────────────────────────────────────────────────

describe("formatDownloadText", () => {
  it("includes the Download Complete header", () => {
    const text = formatDownloadText({ downloaded: 0, alreadyHave: 0, noPdf: 0, skipped: 0 });
    expect(text).toContain("=== Download Complete ===");
  });

  it("shows downloaded count", () => {
    const text = formatDownloadText({ downloaded: 7, alreadyHave: 0, noPdf: 0, skipped: 0 });
    expect(text).toContain("Downloaded:    7");
  });

  it("shows already had count", () => {
    const text = formatDownloadText({ downloaded: 0, alreadyHave: 3, noPdf: 0, skipped: 0 });
    expect(text).toContain("Already had:   3");
  });

  it("shows no PDF count", () => {
    const text = formatDownloadText({ downloaded: 0, alreadyHave: 0, noPdf: 4, skipped: 0 });
    expect(text).toContain("No PDF:        4");
  });

  it("shows skipped/error count", () => {
    const text = formatDownloadText({ downloaded: 0, alreadyHave: 0, noPdf: 0, skipped: 2 });
    expect(text).toContain("Skipped/Error: 2");
  });

  describe("formats all stats together correctly", () => {
    const text = formatDownloadText({ downloaded: 5, alreadyHave: 2, noPdf: 1, skipped: 1 });

    it("shows downloaded count", () => {
      expect(text).toContain("Downloaded:    5");
    });

    it("shows already had count", () => {
      expect(text).toContain("Already had:   2");
    });

    it("shows no PDF count", () => {
      expect(text).toContain("No PDF:        1");
    });

    it("shows skipped/error count", () => {
      expect(text).toContain("Skipped/Error: 1");
    });
  });
});

// ── format-import-classifications ─────────────────────────────────────────────

describe("formatImportClassificationsOutput", () => {
  it("returns a serialised JSON object when json is true", () => {
    const result = formatImportClassificationsOutput(true, 3, "/data/classifications.json");

    expect(JSON.parse(result)).toEqual({ imported: 3, path: "/data/classifications.json" });
  });

  it("returns a human-readable text string when json is false", () => {
    const result = formatImportClassificationsOutput(false, 3, "/data/classifications.json");

    expect(result).toBe("Imported 3 classifications to /data/classifications.json");
  });
});
