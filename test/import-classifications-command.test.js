import { describe, expect, it, mock } from "bun:test";
import { importClassificationsCommand } from "../src/import-classifications-command.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeDeps(overrides = {}) {
  const fsGateway = {
    exists: mock(() => false), // classifications.json doesn't exist by default
    readJson: mock(() => []),
    writeJson: mock(() => {}),
  };

  return {
    fsGateway,
    ...overrides,
  };
}

// ── importClassificationsCommand ───────────────────────────────────────────────

describe("importClassificationsCommand", () => {
  it("imports entries with valid address and classification", () => {
    const entries = [
      { address: "vendor@amazon.com", classification: "business" },
      { address: "noreply@netflix.com", classification: "personal" },
    ];
    const deps = makeDeps({
      fsGateway: {
        exists: mock(() => false),
        readJson: mock(() => entries),
        writeJson: mock(() => {}),
      },
    });

    const result = importClassificationsCommand("/tmp/input.json", "/data/cls.json", deps);

    expect(result.imported).toBe(2);
  });

  it("returns the output file path", () => {
    const deps = makeDeps({
      fsGateway: {
        exists: mock(() => false),
        readJson: mock(() => [{ address: "a@b.com", classification: "business" }]),
        writeJson: mock(() => {}),
      },
    });

    const result = importClassificationsCommand("/tmp/input.json", "/data/cls.json", deps);

    expect(result.path).toBe("/data/cls.json");
  });

  it("skips entries without a classification field", () => {
    const entries = [
      { address: "a@b.com", classification: "business" },
      { address: "c@d.com" }, // missing classification
    ];
    const deps = makeDeps({
      fsGateway: {
        exists: mock(() => false),
        readJson: mock(() => entries),
        writeJson: mock(() => {}),
      },
    });

    const result = importClassificationsCommand("/tmp/input.json", "/data/cls.json", deps);

    expect(result.imported).toBe(1);
  });

  it("skips entries without an address field", () => {
    const entries = [
      { classification: "business" }, // missing address
      { address: "a@b.com", classification: "personal" },
    ];
    const deps = makeDeps({
      fsGateway: {
        exists: mock(() => false),
        readJson: mock(() => entries),
        writeJson: mock(() => {}),
      },
    });

    const result = importClassificationsCommand("/tmp/input.json", "/data/cls.json", deps);

    expect(result.imported).toBe(1);
  });

  it("merges with existing classifications when store file exists", () => {
    const existing = { "existing@vendor.com": "business" };
    const newEntries = [{ address: "new@vendor.com", classification: "personal" }];

    let writtenData;
    const deps = makeDeps({
      fsGateway: {
        exists: mock(() => true), // store file exists
        readJson: mock((path) => {
          if (path.includes("output")) return existing;
          return newEntries;
        }),
        writeJson: mock((_path, data) => {
          writtenData = data;
        }),
      },
    });

    importClassificationsCommand("/tmp/input.json", "/tmp/output.json", deps);

    expect(/** @type {any} */ (writtenData)["existing@vendor.com"]).toBe("business");
    expect(/** @type {any} */ (writtenData)["new@vendor.com"]).toBe("personal");
  });

  it("calls writeJson once to persist the merged store", () => {
    const deps = makeDeps({
      fsGateway: {
        exists: mock(() => false),
        readJson: mock(() => [{ address: "a@b.com", classification: "business" }]),
        writeJson: mock(() => {}),
      },
    });

    importClassificationsCommand("/tmp/input.json", "/data/cls.json", deps);

    expect(deps.fsGateway.writeJson).toHaveBeenCalledTimes(1);
  });
});
