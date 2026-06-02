import { describe, expect, it, mock } from "bun:test";

// Cache-busting dynamic import to bypass mock.module contamination from
// scan-command.test.js which mocks "../src/scan-data.js".
const {
  ensureDataDir,
  loadClassificationsData,
  loadSenders,
  requireClassificationsData,
  saveClassifications,
  saveScanResults,
} = await import(`../src/scan-data.js?t=${Date.now()}`);

/** @returns {import("../src/gateways/fs-gateway.js").FileSystemGateway} */
function makeMockFs(overrides = {}) {
  const base = new (class {
    mkdir = mock(() => {});
    writeJson = mock(() => {});
    readJson = mock(() => ({}));
    exists = mock(() => false);
    readText = mock(() => "");
    readBuffer = mock(() => Buffer.from(""));
    writeFile = mock(() => {});
    readdir = mock(() => []);
    rm = mock(() => {});
  })();
  return Object.assign(base, overrides);
}

describe("ensureDataDir", () => {
  it("calls mkdir with the data directory path", () => {
    const fs = makeMockFs();
    ensureDataDir("/data", fs);

    expect(fs.mkdir).toHaveBeenCalledWith("/data");
  });
});

describe("saveScanResults", () => {
  it("writes scan results to scan-results.json by default", () => {
    const fs = makeMockFs();
    saveScanResults("/data", { scanResults: [{ id: 1 }], senders: [] }, fs);

    expect(fs.writeJson).toHaveBeenCalledWith("/data/scan-results.json", [{ id: 1 }]);
  });

  it("writes senders to senders.json", () => {
    const fs = makeMockFs();
    saveScanResults("/data", { scanResults: [], senders: [{ address: "a@b.com" }] }, fs);

    expect(fs.writeJson).toHaveBeenCalledWith("/data/senders.json", [{ address: "a@b.com" }]);
  });

  it("uses rawPath override when provided", () => {
    const fs = makeMockFs();
    saveScanResults("/data", { scanResults: [], senders: [], rawPath: "/custom/path.json" }, fs);

    expect(fs.writeJson).toHaveBeenCalledWith("/custom/path.json", []);
  });

  describe("returns the resolved raw path and summary path", () => {
    const fs = makeMockFs();
    const result = saveScanResults("/data", { scanResults: [], senders: [] }, fs);

    it("returns the raw path", () => expect(result.rawPath).toBe("/data/scan-results.json"));
    it("returns the summary path", () => expect(result.summaryPath).toBe("/data/senders.json"));
  });
});

describe("loadSenders", () => {
  describe("reads from senders.json in the data directory", () => {
    const fs = makeMockFs({ readJson: mock(() => [{ address: "test@example.com" }]) });
    const senders = loadSenders("/data", fs);

    it("calls readJson with the senders file path", () => expect(fs.readJson).toHaveBeenCalledWith("/data/senders.json"));
    it("returns the senders list", () => expect(senders).toEqual([{ address: "test@example.com" }]));
  });
});

describe("loadClassificationsData", () => {
  it("returns empty object when classifications file does not exist", () => {
    const fs = makeMockFs({ exists: mock(() => false) });
    const result = loadClassificationsData("/data", fs);

    expect(result).toEqual({});
  });

  describe("reads classifications from file when it exists", () => {
    const data = { "bill@example.com": "business" };
    const fs = makeMockFs({
      exists: mock(() => true),
      readJson: mock(() => data),
    });
    const result = loadClassificationsData("/data", fs);

    it("calls readJson with the classifications file path", () =>
      expect(fs.readJson).toHaveBeenCalledWith("/data/classifications.json"));
    it("returns the classifications data", () => expect(result).toEqual(data));
  });
});

describe("saveClassifications", () => {
  it("writes classifications to classifications.json in the data directory", () => {
    const fs = makeMockFs();
    const data = { "bill@example.com": "business" };
    saveClassifications("/data", data, fs);

    expect(fs.writeJson).toHaveBeenCalledWith("/data/classifications.json", data);
  });
});

describe("requireClassificationsData", () => {
  it("throws when the classifications file does not exist", () => {
    const fs = makeMockFs({ exists: mock(() => false) });

    expect(() => requireClassificationsData("/data", fs)).toThrow(
      "No classifications.json found. Run scan + classify first.",
    );
  });

  describe("reads and returns classifications when the file exists", () => {
    const data = { "billing@example.com": "business" };
    const fs = makeMockFs({
      exists: mock(() => true),
      readJson: mock(() => data),
    });
    const result = requireClassificationsData("/data", fs);

    it("calls readJson with the classifications file path", () =>
      expect(fs.readJson).toHaveBeenCalledWith("/data/classifications.json"));
    it("returns the classifications data", () => expect(result).toEqual(data));
  });
});
