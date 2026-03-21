import { describe, it, expect, mock } from "bun:test";
import { readCommand } from "../src/read-command.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeLock() {
  return { release: mock(() => {}) };
}

function makeAccount(overrides = {}) {
  return { name: "Test Account", user: "user@test.com", ...overrides };
}

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
      content: (async function* () { yield downloadContent; })(),
    })),
  };
}

function makeDeps(overrides = {}) {
  const account = makeAccount();
  const parsed = makeParsedEmail();
  const client = makeClient();

  const forEachAccount = mock(async (accounts, fn) => {
    await fn(client, account);
  });

  const listMailboxes = mock(() =>
    Promise.resolve([{ path: "INBOX" }, { path: "Sent" }])
  );

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

    expect(result.account.name).toBe("Test Account");
    expect(result.uid).toBe("42");
    expect(result.parsed).toBeDefined();
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

    // detectMailbox was not called, mailbox used directly
    expect(result.mailbox).toBe("Archive");
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
    await expect(readCommand("99", {}, deps)).rejects.toThrow(
      "UID 99 not found in any mailbox."
    );
  });

  it("throws with context when download fails", async () => {
    const failClient = {
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      search: mock(() => Promise.resolve([42])),
      download: mock(() => { throw new Error("Network error"); }),
    };
    const deps = makeDeps({
      forEachAccount: mock(async (accounts, fn) => { await fn(failClient, makeAccount()); }),
      _client: failClient,
    });
    await expect(readCommand("42", { mailbox: "INBOX" }, deps)).rejects.toThrow(
      "Could not fetch UID 42"
    );
  });

  it("skips account when mailbox lock fails", async () => {
    const lockFailClient = {
      getMailboxLock: mock(() => Promise.reject(new Error("Lock failed"))),
      search: mock(() => Promise.resolve([42])),
      download: mock(() => ({ content: (async function* () {})() })),
    };
    const successAccount = makeAccount({ name: "Second Account" });
    let callCount = 0;

    const deps = makeDeps({
      forEachAccount: mock(async (accounts, fn) => {
        await fn(lockFailClient, makeAccount({ name: "First Account" }));
        await fn(makeClient(), successAccount);
      }),
      simpleParser: mock(async () => {
        callCount++;
        return makeParsedEmail();
      }),
    });

    const result = await readCommand("42", { mailbox: "INBOX" }, deps);

    expect(result.account.name).toBe("Second Account");
    expect(callCount).toBe(1); // only parsed once (second account)
  });

  it("stops iterating after UID is found in first account", async () => {
    let parseCount = 0;
    const deps = makeDeps({
      forEachAccount: mock(async (accounts, fn) => {
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
