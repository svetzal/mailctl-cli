import { describe, expect, it } from "bun:test";
import {
  buildImportClassificationsJson,
  formatImportClassificationsOutput,
} from "../src/format-import-classifications.js";

// ── buildImportClassificationsJson ────────────────────────────────────────────

describe("buildImportClassificationsJson", () => {
  it("includes the imported count", () => {
    const result = buildImportClassificationsJson(5, "/data/classifications.json");

    expect(result.imported).toBe(5);
  });

  it("includes the output path", () => {
    const result = buildImportClassificationsJson(5, "/data/classifications.json");

    expect(result.path).toBe("/data/classifications.json");
  });
});

// ── formatImportClassificationsOutput ─────────────────────────────────────────

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
