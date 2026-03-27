import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

describe("loadAccounts", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    mock.restore();
  });

  it("reads host, port, user from config — not env vars", () => {
    mock.module("../src/config.js", () => ({
      getConfigAccounts: () => [
        { prefix: "TEST", name: "Test Account", user: "config@test.com", host: "imap.config.com", port: 995 },
      ],
    }));
    process.env.TEST_PASS = "secret123";
    // Set env vars that should be IGNORED
    process.env.TEST_HOST = "imap.env.com";
    process.env.TEST_PORT = "143";
    process.env.TEST_USER = "env@test.com";

    // Re-import to pick up mocked module
    const { loadAccounts: load } = require("../src/accounts.js");
    const accounts = load();

    expect(accounts[0].host).toBe("imap.config.com");
  });

  it("reads host from config not env", () => {
    mock.module("../src/config.js", () => ({
      getConfigAccounts: () => [
        { prefix: "TEST", name: "Test Account", user: "config@test.com", host: "imap.config.com", port: 995 },
      ],
    }));
    process.env.TEST_PASS = "secret123";
    process.env.TEST_HOST = "imap.env.com";

    const { loadAccounts: load } = require("../src/accounts.js");
    const accounts = load();

    expect(accounts[0].port).toBe(995);
  });

  it("reads user from config", () => {
    mock.module("../src/config.js", () => ({
      getConfigAccounts: () => [
        { prefix: "TEST", name: "Test Account", user: "config@test.com", host: "imap.config.com", port: 993 },
      ],
    }));
    process.env.TEST_PASS = "secret123";

    const { loadAccounts: load } = require("../src/accounts.js");
    const accounts = load();

    expect(accounts[0].user).toBe("config@test.com");
  });

  it("reads password from env var", () => {
    mock.module("../src/config.js", () => ({
      getConfigAccounts: () => [
        { prefix: "TEST", name: "Test Account", user: "u@test.com", host: "imap.test.com", port: 993 },
      ],
    }));
    process.env.TEST_PASS = "my-secret-password";

    const { loadAccounts: load } = require("../src/accounts.js");
    const accounts = load();

    expect(accounts[0].pass).toBe("my-secret-password");
  });

  it("falls back to env-based discovery when no config accounts", () => {
    mock.module("../src/config.js", () => ({
      getConfigAccounts: () => [],
    }));
    process.env.ICLOUD_USER = "test@icloud.com";
    process.env.ICLOUD_HOST = "imap.mail.me.com";
    process.env.ICLOUD_PORT = "993";
    process.env.ICLOUD_PASS = "pass123";

    const { loadAccounts: load } = require("../src/accounts.js");
    const accounts = load();

    expect(accounts[0].user).toBe("test@icloud.com");
  });

  it("skips accounts with no user in config or env", () => {
    mock.module("../src/config.js", () => ({
      getConfigAccounts: () => [{ prefix: "TEST", name: "No User Account", host: "imap.test.com", port: 993 }],
    }));
    // No TEST_USER env var either
    process.env.TEST_PASS = "secret";

    const { loadAccounts: load } = require("../src/accounts.js");
    const accounts = load();

    expect(accounts.length).toBe(0);
  });

  it("falls back to env var for user when config has no user", () => {
    mock.module("../src/config.js", () => ({
      getConfigAccounts: () => [{ prefix: "TEST", name: "Test", host: "imap.test.com", port: 993 }],
    }));
    process.env.TEST_USER = "envuser@test.com";
    process.env.TEST_PASS = "secret";

    const { loadAccounts: load } = require("../src/accounts.js");
    const accounts = load();

    expect(accounts[0].user).toBe("envuser@test.com");
  });

  it("builds OAuth2 account from config + env secrets", () => {
    mock.module("../src/config.js", () => ({
      getConfigAccounts: () => [
        { prefix: "M365", name: "Microsoft 365", user: "user@company.com", host: "outlook.office365.com", port: 993 },
      ],
    }));
    process.env.M365_CLIENT_ID = "cid";
    process.env.M365_TENANT_ID = "tid";
    process.env.M365_CLIENT_SECRET = "csec";

    const { loadAccounts: load } = require("../src/accounts.js");
    const accounts = load();

    expect(accounts[0].oauth2).toEqual({ clientId: "cid", tenantId: "tid", clientSecret: "csec" });
  });
});
