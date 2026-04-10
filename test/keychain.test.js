import { describe, expect, it } from "bun:test";
import { loadAccountCredentials, loadOpenAiKey } from "../src/keychain.js";

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

// ── loadAccountCredentials ───────────────────────────────────────────────────

describe("loadAccountCredentials", () => {
  it("returns password-based account when keychain has password", () => {
    const accounts = [
      {
        prefix: "ICLOUD",
        name: "iCloud",
        user: "me@icloud.com",
        keychainService: "newt-icloud-imap",
        host: "imap.mail.me.com",
        port: 993,
      },
    ];
    const keychain = mockKeychain({ "newt-icloud-imap": "secret123" });

    const result = loadAccountCredentials(accounts, keychain);

    expect(result[0].pass).toBe("secret123");
  });

  it("sets name from config", () => {
    const accounts = [
      {
        prefix: "ICLOUD",
        name: "iCloud",
        user: "me@icloud.com",
        keychainService: "newt-icloud-imap",
        host: "imap.mail.me.com",
        port: 993,
      },
    ];
    const keychain = mockKeychain({ "newt-icloud-imap": "secret123" });

    const result = loadAccountCredentials(accounts, keychain);

    expect(result[0].name).toBe("iCloud");
  });

  it("sets host and port from config", () => {
    const accounts = [
      {
        prefix: "ICLOUD",
        name: "iCloud",
        user: "me@icloud.com",
        keychainService: "newt-icloud-imap",
        host: "imap.mail.me.com",
        port: 993,
      },
    ];
    const keychain = mockKeychain({ "newt-icloud-imap": "secret123" });

    const result = loadAccountCredentials(accounts, keychain);

    expect(result[0].host).toBe("imap.mail.me.com");
  });

  it("defaults port to 993 when not specified", () => {
    const accounts = [
      { prefix: "TEST", name: "Test", user: "a@b.com", keychainService: "test-svc", host: "imap.test.com" },
    ];
    const keychain = mockKeychain({ "test-svc": "pw" });

    const result = loadAccountCredentials(accounts, keychain);

    expect(result[0].port).toBe(993);
  });

  it("returns OAuth2 account when all three OAuth2 secrets are present", () => {
    const accounts = [
      {
        prefix: "M365",
        name: "Microsoft",
        user: "me@outlook.com",
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

    const result = loadAccountCredentials(accounts, keychain);

    expect(result[0].oauth2).toEqual({ clientId: "cid", tenantId: "tid", clientSecret: "csec" });
  });

  it("prefers OAuth2 over password when both are available", () => {
    const accounts = [
      {
        prefix: "M365",
        name: "Microsoft",
        user: "me@outlook.com",
        keychainService: "newt-m365-imap",
        host: "outlook.office365.com",
        port: 993,
      },
    ];
    const keychain = mockKeychain({
      "newt-m365-imap": "password123",
      "newt-m365-imap-client-id": "cid",
      "newt-m365-imap-tenant-id": "tid",
      "newt-m365-imap-client-secret": "csec",
    });

    const result = loadAccountCredentials(accounts, keychain);

    expect(result[0].oauth2).toBeDefined();
  });

  it("does not include pass field on OAuth2 accounts", () => {
    const accounts = [
      {
        prefix: "M365",
        name: "Microsoft",
        user: "me@outlook.com",
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

    const result = loadAccountCredentials(accounts, keychain);

    expect(result[0]).not.toHaveProperty("pass");
  });

  it("falls back to password when only some OAuth2 secrets are present", () => {
    const accounts = [
      {
        prefix: "M365",
        name: "Microsoft",
        user: "me@outlook.com",
        keychainService: "newt-m365-imap",
        host: "outlook.office365.com",
        port: 993,
      },
    ];
    const keychain = mockKeychain({
      "newt-m365-imap": "password123",
      "newt-m365-imap-client-id": "cid",
      // tenant-id and client-secret missing
    });

    const result = loadAccountCredentials(accounts, keychain);

    expect(result[0].pass).toBe("password123");
  });

  it("skips account without keychainService", () => {
    const accounts = [{ prefix: "TEST", name: "Test", user: "a@b.com", host: "imap.test.com", port: 993 }];
    const keychain = mockKeychain({});

    const result = loadAccountCredentials(accounts, keychain);

    expect(result).toEqual([]);
  });

  it("skips account without user", () => {
    const accounts = [{ prefix: "TEST", name: "Test", keychainService: "test-svc", host: "imap.test.com", port: 993 }];
    const keychain = mockKeychain({ "test-svc": "pw" });

    const result = loadAccountCredentials(accounts, keychain);

    expect(result).toEqual([]);
  });

  it("skips account without host", () => {
    const accounts = [{ prefix: "TEST", name: "Test", user: "a@b.com", keychainService: "test-svc", port: 993 }];
    const keychain = mockKeychain({ "test-svc": "pw" });

    const result = loadAccountCredentials(accounts, keychain);

    expect(result).toEqual([]);
  });

  it("skips account when no secrets found in keychain", () => {
    const accounts = [
      { prefix: "TEST", name: "Test", user: "a@b.com", keychainService: "test-svc", host: "imap.test.com", port: 993 },
    ];
    const keychain = mockKeychain({});

    const result = loadAccountCredentials(accounts, keychain);

    expect(result).toEqual([]);
  });

  it("includes smtp config when present", () => {
    const smtp = { host: "smtp.test.com", port: 587, secure: true };
    const accounts = [
      {
        prefix: "TEST",
        name: "Test",
        user: "a@b.com",
        keychainService: "test-svc",
        host: "imap.test.com",
        port: 993,
        smtp,
      },
    ];
    const keychain = mockKeychain({ "test-svc": "pw" });

    const result = loadAccountCredentials(accounts, keychain);

    expect(result[0].smtp).toEqual(smtp);
  });

  it("sets smtp to null when not in config", () => {
    const accounts = [
      { prefix: "TEST", name: "Test", user: "a@b.com", keychainService: "test-svc", host: "imap.test.com", port: 993 },
    ];
    const keychain = mockKeychain({ "test-svc": "pw" });

    const result = loadAccountCredentials(accounts, keychain);

    expect(result[0].smtp).toBeNull();
  });

  it("loads multiple accounts", () => {
    const accounts = [
      { prefix: "A", name: "AccountA", user: "a@a.com", keychainService: "svc-a", host: "imap.a.com", port: 993 },
      { prefix: "B", name: "AccountB", user: "b@b.com", keychainService: "svc-b", host: "imap.b.com", port: 993 },
    ];
    const keychain = mockKeychain({ "svc-a": "pa", "svc-b": "pb" });

    const result = loadAccountCredentials(accounts, keychain);

    expect(result).toHaveLength(2);
  });
});

// ── loadOpenAiKey ────────────────────────────────────────────────────────────

describe("loadOpenAiKey", () => {
  it("returns the key when present in keychain", () => {
    const keychain = mockKeychain({ "newt-openai-api": "sk-abc123" });

    expect(loadOpenAiKey(keychain)).toBe("sk-abc123");
  });

  it("returns null when key is not in keychain", () => {
    const keychain = mockKeychain({});

    expect(loadOpenAiKey(keychain)).toBeNull();
  });
});
