import { describe, expect, it, mock } from "bun:test";
import { threadCommand } from "../src/thread-command.js";
import { makeAccount, makeForEachAccount, makeListMailboxes, makeLock } from "./helpers.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeClient({ searchResult = [42] } = {}) {
  return {
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    search: mock(() => Promise.resolve(searchResult)),
    fetch: mock(async function* () {}),
  };
}

function makeDeps(overrides = {}) {
  const account = makeAccount();
  const client = makeClient();

  const forEachAccount = makeForEachAccount(client, account);
  const listMailboxes = makeListMailboxes();

  return {
    targetAccounts: [account],
    forEachAccount,
    listMailboxes,
    _client: client,
    ...overrides,
  };
}

// ── threadCommand ──────────────────────────────────────────────────────────────

describe("threadCommand", () => {
  it("throws when UID is not found in any mailbox", async () => {
    const notFoundClient = {
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      search: mock(() => Promise.resolve([])), // UID not found — detectMailbox returns null
    };
    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, fn) => {
        await fn(notFoundClient, makeAccount());
      }),
      _client: notFoundClient,
    });

    await expect(threadCommand("99", {}, deps)).rejects.toThrow("Could not find UID 99 in any account.");
  });

  it("uses explicit --mailbox option without detection", async () => {
    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, fn) => {
        const client = {
          getMailboxLock: mock(() => Promise.resolve(makeLock())),
          search: mock(() => Promise.resolve([42])),
          fetch: mock(async function* () {
            yield {
              uid: 42,
              envelope: { messageId: "<msg-42@test.com>", subject: "Hello" },
              bodyParts: new Map(),
            };
          }),
        };
        await fn(client, makeAccount());
      }),
    });

    // When mailbox is explicit, detectMailbox (which calls search) is skipped.
    const result = await threadCommand("42", { mailbox: "INBOX" }, deps);

    expect(result[0].account).toBe("Test Account");
  });

  it("returns thread result with account name, threadSize, and fallback flag", async () => {
    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, fn) => {
        const client = {
          getMailboxLock: mock(() => Promise.resolve(makeLock())),
          search: mock(() => Promise.resolve([42])),
          fetch: mock(async function* () {
            yield {
              uid: 42,
              envelope: { messageId: "<msg-42@test.com>", subject: "Hello", from: [] },
              bodyParts: new Map(),
            };
          }),
        };
        await fn(client, makeAccount({ name: "My Account" }));
      }),
    });
    const result = await threadCommand("42", { mailbox: "INBOX" }, deps);

    expect(result[0]).toMatchObject({
      account: "My Account",
      threadSize: expect.any(Number),
      fallback: expect.any(Boolean),
    });
  });

  it("checks other accounts when UID is not on the first account", async () => {
    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, fn) => {
        // First call: UID not found (search returns empty)
        const notFoundClient = {
          getMailboxLock: mock(() => Promise.resolve(makeLock())),
          search: mock(() => Promise.resolve([])),
          fetch: mock(async function* () {}),
        };
        await fn(notFoundClient, makeAccount({ name: "Account A" }));

        // Second call: UID found and thread retrieved
        const foundClient = {
          getMailboxLock: mock(() => Promise.resolve(makeLock())),
          search: mock(() => Promise.resolve([42])),
          fetch: mock(async function* () {
            yield {
              uid: 42,
              envelope: { messageId: "<msg-42@test.com>", subject: "Hello", from: [] },
              bodyParts: new Map(),
            };
          }),
        };
        await fn(foundClient, makeAccount({ name: "Account B" }));
      }),
    });

    const result = await threadCommand("42", {}, deps);
    expect(result[0].account).toBe("Account B");
  });
});
