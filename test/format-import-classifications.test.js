import { describe, expect, it } from "bun:test";
import { buildImportClassificationsJson } from "../src/format-import-classifications.js";

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
