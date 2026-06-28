import { afterEach, describe, expect, it, mock } from "bun:test";

/**
 * Load download-filename.js with a controlled vendor address map.
 * Mocks config.js (the root dependency) so vendor-map.js itself stays
 * un-replaced in the module cache, avoiding contamination of vendor-map.test.js.
 * @param {Record<string, string>} addressMap
 */
function makeModule(addressMap = {}) {
  mock.module("../src/config.js", () => ({
    loadConfig: () => ({}),
    resetConfigCache: () => {},
    getConfigAccounts: () => [],
    getConfigSelfAddresses: () => [],
    getConfigInvoiceBlocklist: () => [],
    getConfigVendorAddressMap: () => addressMap,
    getConfigVendorDomainMap: () => ({}),
    getConfigSmtp: () => null,
    getConfigCanadianDomains: () => [],
    getConfigDownloadDir: () => "/tmp",
  }));
  return require("../src/download-filename.js");
}

afterEach(() => {
  mock.restore();
});

describe("buildFilename", () => {
  it("formats a Date as Vendor YYYY-MM-DD.pdf with zero-padded month and day", () => {
    const { buildFilename } = makeModule();
    expect(buildFilename("Vendor", new Date(2026, 0, 5), null, new Set())).toBe("Vendor 2026-01-05.pdf");
  });

  it("accepts a string date and produces the same result as the equivalent Date object", () => {
    const { buildFilename } = makeModule();
    const str = "2026-03-15T12:00:00";
    const obj = new Date(str);
    expect(buildFilename("Vendor", str, null, new Set())).toBe(buildFilename("Vendor", obj, null, new Set()));
  });

  it("appends _2 suffix when the base filename is already in existingFiles", () => {
    const { buildFilename } = makeModule();
    const existing = new Set(["vendor 2026-01-05.pdf"]);
    expect(buildFilename("Vendor", new Date(2026, 0, 5), null, existing)).toBe("Vendor 2026-01-05_2.pdf");
  });

  it("appends _3 suffix when both the base and _2 filenames are already taken", () => {
    const { buildFilename } = makeModule();
    const existing = new Set(["vendor 2026-01-05.pdf", "vendor 2026-01-05_2.pdf"]);
    expect(buildFilename("Vendor", new Date(2026, 0, 5), null, existing)).toBe("Vendor 2026-01-05_3.pdf");
  });

  it("collision check normalizes filename to lowercase before comparing against existingFiles", () => {
    const { buildFilename } = makeModule();
    const existing = new Set(["vendor 2026-01-05.pdf"]);
    expect(buildFilename("VENDOR", new Date(2026, 0, 5), null, existing)).toBe("VENDOR 2026-01-05_2.pdf");
  });
});

describe("vendorName", () => {
  it("returns the mapped display name when the address is in the vendor map", () => {
    const { vendorName } = makeModule({ "billing@acme.com": "ACME Corp" });
    expect(vendorName("billing@acme.com", "Acme Billing")).toBe("ACME Corp");
  });

  it("strips special characters from senderName when address is not in the vendor map", () => {
    const { vendorName } = makeModule();
    expect(vendorName("unknown@example.com", "Acme (Payments)")).toBe("Acme Payments");
  });

  it("falls back to the local part of the address when senderName is omitted", () => {
    const { vendorName } = makeModule();
    expect(vendorName("billing@example.com")).toBe("billing");
  });

  it("truncates names longer than 30 characters at a word boundary", () => {
    const { vendorName } = makeModule();
    const result = vendorName("unknown@example.com", "A Very Long Company Name For Testing");
    expect(result.length).toBeLessThanOrEqual(30);
  });
});

describe("getVendorNames", () => {
  it("returns the object provided by getVendorDisplayNames", () => {
    const map = { "a@b.com": "B Company" };
    const { getVendorNames } = makeModule(map);
    expect(getVendorNames()).toEqual(map);
  });
});
