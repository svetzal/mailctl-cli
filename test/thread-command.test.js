import { describe, it, expect, mock } from "bun:test";
import { threadCommand } from "../src/thread-command.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeLock() {
  return { release: mock(() => {}) };
}

function makeAccount(overrides = {}) {
  return { name: "Test Account", user: "user@test.com", ...overrides };
}

function makeThreadResult() {
  return {
    messages: [
      { uid: 42, subject: "Hello", from: "alice@example.com" },
      { uid: 43, subject: "Re: Hello", from: "bob@example.com" },
    ],
    fallback: false,
  };
}

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
  const threadResult = makeThreadResult();

  const forEachAccount = mock(async (accounts, fn) => {
    await fn(client, account);
  });

  const listMailboxes = mock(() =>
    Promise.resolve([{ path: "INBOX" }, { path: "Sent" }])
  );

  // Mock findThread — it's an internal module call, but we control it by
  // mocking findThread via the dep pattern would require injection.
  // Since threadCommand imports findThread directly, we test behavior
  // at the integration level using a real (but deterministic) mock client.

  return {
    targetAccounts: [account],
    forEachAccount,
    listMailboxes,
    _client: client,
    _threadResult: threadResult,
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
      forEachAccount: mock(async (accounts, fn) => {
        await fn(notFoundClient, makeAccount());
      }),
      _client: notFoundClient,
    });

    await expect(threadCommand("99", {}, deps)).rejects.toThrow(
      "UID 99 not found in any mailbox"
    );
  });

  it("uses explicit --mailbox option without detection", async () => {
    const deps = makeDeps({
      forEachAccount: mock(async (accounts, fn) => {
        // We need a client that supports findThread operations
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
    // The thread lookup still needs listMailboxes for searchPaths.
    const result = await threadCommand("42", { mailbox: "INBOX" }, deps);

    expect(result).toBeDefined();
    expect(result[0].account).toBe("Test Account");
  });

  it("returns thread result with account name", async () => {
    const deps = makeDeps({
      forEachAccount: mock(async (accounts, fn) => {
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

    expect(result[0].account).toBe("My Account");
    expect(typeof result[0].threadSize).toBe("number");
    expect(typeof result[0].fallback).toBe("boolean");
  });
});
