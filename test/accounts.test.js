import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { loadAccounts } from "../src/accounts.js";

/**
 * Create a mock KeychainGateway that returns values from a lookup map.
 * @param {Record<string, string>} secrets - service → secret value
 */
function mockKeychain(secrets = {}) {
  return {
    unlockNewtKeychain() {},
    readSecret(/** @type {string} */ service) {
      return secrets[service] ?? null;
    },
  };
}

describe("loadAccounts", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("reads host, port, user from config — not env vars", () => {
    const readConfigAccounts = () => [
      {
        prefix: "TEST",
        name: "Test Account",
        user: "config@test.com",
        keychainService: "test-svc",
        host: "imap.config.com",
        port: 995,
      },
    ];
    const keychain = mockKeychain({ "test-svc": "secret123" });

    const accounts = loadAccounts(keychain, readConfigAccounts);

    expect(accounts[0].host).toBe("imap.config.com");
  });

  it("reads port from config", () => {
    const readConfigAccounts = () => [
      {
        prefix: "TEST",
        name: "Test Account",
        user: "config@test.com",
        keychainService: "test-svc",
        host: "imap.config.com",
        port: 995,
      },
    ];
    const keychain = mockKeychain({ "test-svc": "secret123" });

    const accounts = loadAccounts(keychain, readConfigAccounts);

    expect(accounts[0].port).toBe(995);
  });

  it("reads user from config", () => {
    const readConfigAccounts = () => [
      {
        prefix: "TEST",
        name: "Test Account",
        user: "config@test.com",
        keychainService: "test-svc",
        host: "imap.config.com",
        port: 993,
      },
    ];
    const keychain = mockKeychain({ "test-svc": "secret123" });

    const accounts = loadAccounts(keychain, readConfigAccounts);

    expect(accounts[0].user).toBe("config@test.com");
  });

  it("reads password from keychain via keychainService", () => {
    const readConfigAccounts = () => [
      {
        prefix: "TEST",
        name: "Test Account",
        user: "u@test.com",
        keychainService: "test-svc",
        host: "imap.test.com",
        port: 993,
      },
    ];
    const keychain = mockKeychain({ "test-svc": "my-secret-password" });

    const accounts = loadAccounts(keychain, readConfigAccounts);

    expect(accounts[0].pass).toBe("my-secret-password");
  });

  it("falls back to env-based discovery when no config accounts", () => {
    const readConfigAccounts = () => [];
    process.env.ICLOUD_USER = "test@icloud.com";
    process.env.ICLOUD_HOST = "imap.mail.me.com";
    process.env.ICLOUD_PORT = "993";
    process.env.ICLOUD_PASS = "pass123";

    const accounts = loadAccounts(undefined, readConfigAccounts);

    expect(accounts[0].user).toBe("test@icloud.com");
  });

  it("skips accounts with no user in config", () => {
    const readConfigAccounts = () => [
      { prefix: "TEST", name: "No User Account", keychainService: "test-svc", host: "imap.test.com", port: 993 },
    ];
    const keychain = mockKeychain({ "test-svc": "secret" });

    const accounts = loadAccounts(keychain, readConfigAccounts);

    expect(accounts.length).toBe(0);
  });

  it("builds OAuth2 account from config + keychain secrets", () => {
    const readConfigAccounts = () => [
      {
        prefix: "M365",
        name: "Microsoft 365",
        user: "user@company.com",
        keychainService: "newt-m365-imap",
        host: "outlook.office365.com",
        port: 993,
      },
    ];
    const keychain = mockKeychain({
      "newt-m365-imap-client-id": "cid",
      "newt-m365-imap-tenant-id": "tid",
      "newt-m365-imap-client-secret": "csec",
    });

    const accounts = loadAccounts(keychain, readConfigAccounts);

    expect(accounts[0].oauth2).toEqual({ clientId: "cid", tenantId: "tid", clientSecret: "csec" });
  });

  it("calls unlockNewtKeychain before reading secrets", () => {
    const readConfigAccounts = () => [
      {
        prefix: "TEST",
        name: "Test",
        user: "a@b.com",
        keychainService: "test-svc",
        host: "imap.test.com",
        port: 993,
      },
    ];
    let unlockCalled = false;
    const keychain = {
      unlockNewtKeychain() {
        unlockCalled = true;
      },
      readSecret(/** @type {string} */ service) {
        return service === "test-svc" ? "pw" : null;
      },
    };

    loadAccounts(keychain, readConfigAccounts);

    expect(unlockCalled).toBe(true);
  });
});
