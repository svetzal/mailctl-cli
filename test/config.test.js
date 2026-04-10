import { beforeEach, describe, expect, it, mock } from "bun:test";

/** @returns {{ readJson: import("bun:test").Mock<(path: string) => unknown> }} */
function makeMockFs(returnValue) {
  return { readJson: mock(() => returnValue) };
}

// Use require() in beforeEach to get fresh module references, avoiding
// mock.module contamination from other test files (accounts.test.js, vendor-map.test.js).
/** @type {typeof import("../src/config.js")} */
let configModule;

beforeEach(() => {
  mock.restore();
  configModule = require("../src/config.js");
  configModule.resetConfigCache();
});

// Convenience accessors (reassigned each beforeEach via configModule)
function loadConfig(/** @type {any} */ fs, /** @type {string} */ path) {
  return configModule.loadConfig(fs, path);
}
function getConfigAccounts(/** @type {any} */ config) {
  return configModule.getConfigAccounts(config);
}
function getConfigSelfAddresses(/** @type {any} */ config) {
  return configModule.getConfigSelfAddresses(config);
}
function getConfigInvoiceBlocklist(/** @type {any} */ config) {
  return configModule.getConfigInvoiceBlocklist(config);
}
function getConfigVendorAddressMap(/** @type {any} */ config) {
  return configModule.getConfigVendorAddressMap(config);
}
function getConfigVendorDomainMap(/** @type {any} */ config) {
  return configModule.getConfigVendorDomainMap(config);
}
function getConfigSmtp(/** @type {string} */ name, /** @type {any} */ config) {
  return configModule.getConfigSmtp(name, config);
}
function getConfigCanadianDomains(/** @type {any} */ config) {
  return configModule.getConfigCanadianDomains(config);
}
function getConfigDownloadDir(/** @type {any} */ config, /** @type {string} */ homeDir) {
  return configModule.getConfigDownloadDir(config, homeDir);
}
function resetConfigCache() {
  return configModule.resetConfigCache();
}

describe("loadConfig", () => {
  it("returns the parsed config from the filesystem gateway", () => {
    const config = { accounts: [] };
    const fs = makeMockFs(config);

    const result = loadConfig(fs, "/fake/config.json");

    expect(result).toEqual(config);
  });

  it("returns null when the file cannot be read", () => {
    const fs = {
      readJson: mock(() => {
        throw new Error("ENOENT");
      }),
    };

    const result = loadConfig(fs, "/nonexistent.json");

    expect(result).toBeNull();
  });

  it("caches the config after the first read", () => {
    const fs = makeMockFs({ accounts: [] });

    loadConfig(fs, "/fake/config.json");
    loadConfig(fs, "/fake/config.json");

    expect(fs.readJson).toHaveBeenCalledTimes(1);
  });

  it("returns cached result on subsequent calls without reading again", () => {
    const config = { accounts: [{ prefix: "TEST" }] };
    const fs = makeMockFs(config);

    const first = loadConfig(fs, "/fake/config.json");
    const second = loadConfig(fs, "/fake/config.json");

    expect(first).toBe(second);
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
  it("returns the accounts array from a config object", () => {
    const config = { accounts: [{ prefix: "TEST", name: "Test" }] };

    expect(getConfigAccounts(config)).toEqual([{ prefix: "TEST", name: "Test" }]);
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
    const config = { selfAddresses: ["me@example.com", "me@work.com"] };

    expect(getConfigSelfAddresses(config)).toEqual(["me@example.com", "me@work.com"]);
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
    const config = { invoiceBlocklist: ["INV-001", "INV-002"] };

    expect(getConfigInvoiceBlocklist(config)).toEqual(["INV-001", "INV-002"]);
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
  it("returns the smtp config for a matching account name", () => {
    const smtp = { host: "smtp.example.com", port: 587, secure: false };
    const config = {
      accounts: [{ prefix: "TEST", name: "My Account", smtp }],
    };

    expect(getConfigSmtp("My Account", config)).toEqual(smtp);
  });

  it("matches account by prefix (case-insensitive)", () => {
    const smtp = { host: "smtp.example.com", port: 587, secure: false };
    const config = {
      accounts: [{ prefix: "MYACCT", name: "My Account", smtp }],
    };

    expect(getConfigSmtp("myacct", config)).toEqual(smtp);
  });

  it("matches account by name case-insensitively", () => {
    const smtp = { host: "smtp.example.com", port: 587, secure: false };
    const config = {
      accounts: [{ prefix: "TEST", name: "My Account", smtp }],
    };

    expect(getConfigSmtp("MY ACCOUNT", config)).toEqual(smtp);
  });

  it("returns null when account name does not match", () => {
    const config = {
      accounts: [{ prefix: "TEST", name: "My Account", smtp: { host: "smtp.example.com", port: 587, secure: false } }],
    };

    expect(getConfigSmtp("Other Account", config)).toBeNull();
  });

  it("returns null when account has no smtp config", () => {
    const config = {
      accounts: [{ prefix: "TEST", name: "My Account" }],
    };

    expect(getConfigSmtp("My Account", config)).toBeNull();
  });

  it("returns null when config is null", () => {
    expect(getConfigSmtp("Any Account", null)).toBeNull();
  });
});

describe("getConfigCanadianDomains", () => {
  it("returns the canadianDomains array from config", () => {
    const config = { canadianDomains: ["canadiantire.ca", "rbc.com"] };

    expect(getConfigCanadianDomains(config)).toEqual(["canadiantire.ca", "rbc.com"]);
  });

  it("returns an empty array when config is null", () => {
    expect(getConfigCanadianDomains(null)).toEqual([]);
  });

  it("returns an empty array when canadianDomains field is missing", () => {
    expect(getConfigCanadianDomains({})).toEqual([]);
  });
});

describe("getConfigDownloadDir", () => {
  it("returns the configured downloadDir with ~ expanded to homeDir", () => {
    const config = { downloadDir: "~/receipts" };

    expect(getConfigDownloadDir(config, "/home/user")).toBe("/home/user/receipts");
  });

  it("returns the configured downloadDir unchanged when it does not start with ~", () => {
    const config = { downloadDir: "/absolute/path/receipts" };

    expect(getConfigDownloadDir(config, "/home/user")).toBe("/absolute/path/receipts");
  });

  it("returns the default directory when downloadDir is not set", () => {
    expect(getConfigDownloadDir({}, "/home/user")).toBe("/home/user/mailctl-receipts");
  });

  it("returns the default directory when config is null", () => {
    expect(getConfigDownloadDir(null, "/home/user")).toBe("/home/user/mailctl-receipts");
  });

  it("replaces only the leading ~ and not ~ elsewhere in the path", () => {
    const config = { downloadDir: "~/some~dir" };

    expect(getConfigDownloadDir(config, "/home/user")).toBe("/home/user/some~dir");
  });
});
