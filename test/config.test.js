import { beforeEach, describe, expect, it, mock } from "bun:test";

// Cache-busting dynamic import to bypass mock.module contamination from
// accounts.test.js and vendor-map.test.js which mock "../src/config.js".
const {
  getConfigAccounts,
  getConfigCanadianDomains,
  getConfigDownloadDir,
  getConfigInvoiceBlocklist,
  getConfigSelfAddresses,
  getConfigSmtp,
  getConfigVendorAddressMap,
  getConfigVendorDomainMap,
  loadConfig,
  resetConfigCache,
} = await import(`../src/config.js?t=${Date.now()}`);

/** @returns {{ readJson: import("bun:test").Mock<(path: string) => unknown> }} */
function makeMockFs(returnValue) {
  return { readJson: mock(() => returnValue) };
}

beforeEach(() => {
  resetConfigCache();
});

describe("loadConfig", () => {
  it("returns the parsed config from the filesystem gateway", () => {
    const config = { accounts: [] };
    const fs = makeMockFs(config);

    const result = loadConfig(fs, "/fake/config.json");

    expect(result).toEqual(config);
  });

  it("returns null when the filesystem throws", () => {
    const fs = {
      readJson: mock(() => {
        throw new Error("ENOENT");
      }),
    };

    const result = loadConfig(fs, "/missing/config.json");

    expect(result).toBeNull();
  });

  it("caches after first successful read", () => {
    const fs = makeMockFs({ accounts: [] });

    loadConfig(fs, "/fake/config.json");
    loadConfig(fs, "/fake/config.json");

    expect(fs.readJson).toHaveBeenCalledTimes(1);
  });

  it("caches null after first failed read", () => {
    const fs = {
      readJson: mock(() => {
        throw new Error("ENOENT");
      }),
    };

    loadConfig(fs, "/missing/config.json");
    loadConfig(fs, "/missing/config.json");

    expect(fs.readJson).toHaveBeenCalledTimes(1);
  });
});

describe("resetConfigCache", () => {
  it("causes loadConfig to re-read the file after reset", () => {
    const fs = makeMockFs({ accounts: [] });

    loadConfig(fs, "/fake/config.json");
    resetConfigCache();
    loadConfig(fs, "/fake/config.json");

    expect(fs.readJson).toHaveBeenCalledTimes(2);
  });
});

describe("getConfigAccounts", () => {
  it("returns the accounts array from config", () => {
    const config = { accounts: [{ prefix: "A", name: "Acct" }] };

    expect(getConfigAccounts(config)).toEqual([{ prefix: "A", name: "Acct" }]);
  });

  it("returns an empty array when config is null", () => {
    expect(getConfigAccounts(null)).toEqual([]);
  });

  it("returns an empty array when accounts field is missing", () => {
    expect(getConfigAccounts({})).toEqual([]);
  });
});

describe("getConfigSelfAddresses", () => {
  it("returns the selfAddresses array from config", () => {
    const config = { selfAddresses: ["me@example.com"] };

    expect(getConfigSelfAddresses(config)).toEqual(["me@example.com"]);
  });

  it("returns an empty array when config is null", () => {
    expect(getConfigSelfAddresses(null)).toEqual([]);
  });

  it("returns an empty array when selfAddresses field is missing", () => {
    expect(getConfigSelfAddresses({})).toEqual([]);
  });
});

describe("getConfigInvoiceBlocklist", () => {
  it("returns the invoiceBlocklist array from config", () => {
    const config = { invoiceBlocklist: ["INV-001"] };

    expect(getConfigInvoiceBlocklist(config)).toEqual(["INV-001"]);
  });

  it("returns an empty array when config is null", () => {
    expect(getConfigInvoiceBlocklist(null)).toEqual([]);
  });

  it("returns an empty array when invoiceBlocklist field is missing", () => {
    expect(getConfigInvoiceBlocklist({})).toEqual([]);
  });
});

describe("getConfigVendorAddressMap", () => {
  it("returns the vendorAddressMap from config", () => {
    const config = { vendorAddressMap: { "billing@acme.com": "Acme Corp" } };

    expect(getConfigVendorAddressMap(config)).toEqual({ "billing@acme.com": "Acme Corp" });
  });

  it("returns an empty object when config is null", () => {
    expect(getConfigVendorAddressMap(null)).toEqual({});
  });

  it("returns an empty object when vendorAddressMap field is missing", () => {
    expect(getConfigVendorAddressMap({})).toEqual({});
  });
});

describe("getConfigVendorDomainMap", () => {
  it("returns the vendorDomainMap from config", () => {
    const config = { vendorDomainMap: { "acme.com": "Acme Corp" } };

    expect(getConfigVendorDomainMap(config)).toEqual({ "acme.com": "Acme Corp" });
  });

  it("returns an empty object when config is null", () => {
    expect(getConfigVendorDomainMap(null)).toEqual({});
  });

  it("returns an empty object when vendorDomainMap field is missing", () => {
    expect(getConfigVendorDomainMap({})).toEqual({});
  });
});

describe("getConfigSmtp", () => {
  it("returns SMTP config for a matching account", () => {
    const smtp = { host: "smtp.test.com", port: 587, secure: true };
    const config = { accounts: [{ name: "Test", prefix: "TEST", smtp }] };

    expect(getConfigSmtp("Test", config)).toEqual(smtp);
  });

  it("matches case-insensitively", () => {
    const smtp = { host: "smtp.test.com", port: 587, secure: true };
    const config = { accounts: [{ name: "Test", prefix: "TEST", smtp }] };

    expect(getConfigSmtp("test", config)).toEqual(smtp);
  });

  it("returns null when no account matches", () => {
    const config = { accounts: [{ name: "Other", prefix: "OTHER" }] };

    expect(getConfigSmtp("Test", config)).toBeNull();
  });

  it("returns null when account has no smtp config", () => {
    const config = { accounts: [{ name: "Test", prefix: "TEST" }] };

    expect(getConfigSmtp("Test", config)).toBeNull();
  });
});

describe("getConfigCanadianDomains", () => {
  it("returns the canadianDomains array from config", () => {
    const config = { canadianDomains: ["example.ca"] };

    expect(getConfigCanadianDomains(config)).toEqual(["example.ca"]);
  });

  it("returns an empty array when config is null", () => {
    expect(getConfigCanadianDomains(null)).toEqual([]);
  });

  it("returns an empty array when canadianDomains field is missing", () => {
    expect(getConfigCanadianDomains({})).toEqual([]);
  });
});

describe("getConfigDownloadDir", () => {
  it("returns the downloadDir from config with ~ expanded", () => {
    const config = { downloadDir: "~/receipts" };

    expect(getConfigDownloadDir(config, "/home/user")).toBe("/home/user/receipts");
  });

  it("returns default ~/mailctl-receipts when not configured", () => {
    expect(getConfigDownloadDir({}, "/home/user")).toBe("/home/user/mailctl-receipts");
  });

  it("returns default when config is null", () => {
    expect(getConfigDownloadDir(null, "/home/user")).toBe("/home/user/mailctl-receipts");
  });
});
