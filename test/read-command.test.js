import { describe, expect, it, mock } from "bun:test";
import { readCommand } from "../src/read-command.js";
import { makeAccount, makeForEachAccount, makeListMailboxes, makeLock } from "./helpers.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeParsedEmail(overrides = {}) {
  return {
    from: { text: "Alice <alice@example.com>" },
    subject: "Hello",
    text: "Email body",
    date: new Date("2025-01-15"),
    ...overrides,
  };
}

function makeClient({ downloadContent = Buffer.from("raw email"), searchResult = [42] } = {}) {
  return {
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    search: mock(() => Promise.resolve(searchResult)),
    download: mock(() => ({
      content: (async function* () {
        yield downloadContent;
      })(),
    })),
  };
}

function makeDeps(overrides = {}) {
  const account = makeAccount();
  const parsed = makeParsedEmail();
  const client = makeClient();

  const forEachAccount = makeForEachAccount(client, account);
  const listMailboxes = makeListMailboxes();
  const simpleParser = mock(() => Promise.resolve(parsed));

  return {
    targetAccounts: [account],
    forEachAccount,
    listMailboxes,
    simpleParser,
    _client: client,
    ...overrides,
  };
}

// ── readCommand ────────────────────────────────────────────────────────────────

describe("readCommand", () => {
  it("returns parsed email with account and mailbox context", async () => {
    const deps = makeDeps();
    const result = await readCommand("42", {}, deps);

    expect(result).toMatchObject({ account: { name: "Test Account" }, uid: "42", parsed: expect.anything() });
  });

  it("returns the detected mailbox in the result", async () => {
    // INBOX is tried first by detectMailbox — it finds the UID there
    const deps = makeDeps();
    const result = await readCommand("42", {}, deps);

    expect(result.mailbox).toBe("INBOX");
  });

  it("uses explicit --mailbox option without detection when provided", async () => {
    const deps = makeDeps();
    const result = await readCommand("42", { mailbox: "Archive" }, deps);

    expect(result.mailbox).toBe("Archive");
  });

  it("does not call search when explicit --mailbox is provided", async () => {
    const deps = makeDeps();
    await readCommand("42", { mailbox: "Archive" }, deps);

    expect(deps._client.search).not.toHaveBeenCalled();
  });

  it("calls simpleParser with the downloaded buffer", async () => {
    const deps = makeDeps();
    await readCommand("42", {}, deps);

    expect(deps.simpleParser).toHaveBeenCalledTimes(1);
  });

  it("throws when UID is not found in any account", async () => {
    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, _fn) => {
        // Never calls fn — simulates UID not found
      }),
    });
    await expect(readCommand("99", {}, deps)).rejects.toThrow("Could not find UID 99 in any account.");
  });

  it("propagates the raw error when download fails", async () => {
    const failClient = {
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      search: mock(() => Promise.resolve([42])),
      download: mock(() => {
        throw new Error("Network error");
      }),
    };
    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, fn) => {
        await fn(failClient, makeAccount());
      }),
      _client: failClient,
    });
    await expect(readCommand("42", { mailbox: "INBOX" }, deps)).rejects.toThrow("Network error");
  });

  it("skips account when mailbox lock fails", async () => {
    const lockFailClient = {
      getMailboxLock: mock(() => Promise.reject(new Error("Lock failed"))),
      search: mock(() => Promise.resolve([42])),
      download: mock(() => ({ content: (async function* () {})() })),
    };
    const successAccount = makeAccount({ name: "Second Account" });

    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, fn) => {
        await fn(lockFailClient, makeAccount({ name: "First Account" }));
        await fn(makeClient(), successAccount);
      }),
      simpleParser: mock(async () => makeParsedEmail()),
    });

    const result = await readCommand("42", { mailbox: "INBOX" }, deps);

    expect(result.account.name).toBe("Second Account");
  });

  it("parses only once when skipping account on lock failure", async () => {
    const lockFailClient = {
      getMailboxLock: mock(() => Promise.reject(new Error("Lock failed"))),
      search: mock(() => Promise.resolve([42])),
      download: mock(() => ({ content: (async function* () {})() })),
    };
    let callCount = 0;

    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, fn) => {
        await fn(lockFailClient, makeAccount({ name: "First Account" }));
        await fn(makeClient(), makeAccount({ name: "Second Account" }));
      }),
      simpleParser: mock(async () => {
        callCount++;
        return makeParsedEmail();
      }),
    });

    await readCommand("42", { mailbox: "INBOX" }, deps);

    expect(callCount).toBe(1);
  });

  it("stops iterating after UID is found in first account", async () => {
    let parseCount = 0;
    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, fn) => {
        await fn(makeClient(), makeAccount({ name: "First" }));
        await fn(makeClient(), makeAccount({ name: "Second" }));
      }),
      simpleParser: mock(async () => {
        parseCount++;
        return makeParsedEmail();
      }),
    });

    await readCommand("42", { mailbox: "INBOX" }, deps);

    expect(parseCount).toBe(1);
  });
});
