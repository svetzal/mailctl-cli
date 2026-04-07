import { beforeAll, describe, expect, it, mock } from "bun:test";
import { withMessage } from "../src/find-message.js";
import { makeAccount, makeForEachAccount, makeListMailboxes, makeLock } from "./helpers.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeClient({ searchResult = [42] } = {}) {
  return {
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    search: mock(() => Promise.resolve(searchResult)),
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

// ── withMessage ────────────────────────────────────────────────────────────────

describe("withMessage", () => {
  describe("calls fn with client, account, and detected mailbox", () => {
    const deps = makeDeps();
    const fnMock = mock(async (_client, _acct, _mailbox) => "result value");
    let resolved;
    beforeAll(async () => {
      resolved = await withMessage("42", {}, deps, fnMock);
    });

    it("result is the fn return value", async () => {
      expect(resolved.result).toBe("result value");
    });

    it("account is the test account", async () => {
      expect(resolved.account.name).toBe("Test Account");
    });

    it("mailbox is INBOX", async () => {
      expect(resolved.mailbox).toBe("INBOX");
    });
  });

  describe("uses explicit --mailbox option without detection when provided", () => {
    const deps = makeDeps();
    const fnMock = mock(async () => "ok");
    let resolved;
    beforeAll(async () => {
      resolved = await withMessage("42", { mailbox: "Archive" }, deps, fnMock);
    });

    it("mailbox is Archive", async () => {
      expect(resolved.mailbox).toBe("Archive");
    });

    it("detectMailbox is skipped (search not called)", async () => {
      expect(deps._client.search).not.toHaveBeenCalled();
    });
  });

  it("throws when UID is not found in any account", async () => {
    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, _fn) => {
        // Never calls fn — simulates UID not found
      }),
    });

    await expect(withMessage("99", {}, deps, async () => "never")).rejects.toThrow(
      "Could not find UID 99 in any account.",
    );
  });

  describe("tries next account when UID not found in current one (mailbox detection returns null)", () => {
    const account1 = makeAccount({ name: "First" });
    const account2 = makeAccount({ name: "Second" });
    const client1 = makeClient({ searchResult: [] }); // UID not found — detectMailbox returns null
    const client2 = makeClient({ searchResult: [42] });

    let foundAccount = null;
    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, fn) => {
        await fn(client1, account1);
        await fn(client2, account2);
      }),
      _client: client1,
    });
    let resolved;
    beforeAll(async () => {
      resolved = await withMessage("42", {}, deps, async (_c, acct) => {
        foundAccount = acct.name;
        return "ok";
      });
    });

    it("account is the second account", async () => {
      expect(resolved.account.name).toBe("Second");
    });

    it("fn was called with the second account", async () => {
      expect(foundAccount).toBe("Second");
    });
  });

  it("skips account when mailbox lock fails", async () => {
    const lockFailClient = {
      getMailboxLock: mock(() => Promise.reject(new Error("Lock failed"))),
      search: mock(() => Promise.resolve([42])),
    };
    const successClient = makeClient();
    const successAccount = makeAccount({ name: "Second Account" });

    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, fn) => {
        await fn(lockFailClient, makeAccount({ name: "First" }));
        await fn(successClient, successAccount);
      }),
      _client: lockFailClient,
    });

    const { account } = await withMessage("42", { mailbox: "INBOX" }, deps, async () => "ok");

    expect(account.name).toBe("Second Account");
  });

  it("emits mailbox-lock-failed when mailbox lock fails", async () => {
    const error = new Error("Lock failed");
    const lockFailClient = {
      getMailboxLock: mock(() => Promise.reject(error)),
      search: mock(() => Promise.resolve([42])),
    };
    const onProgress = mock(() => {});

    const successClient = makeClient();
    const successAccount = makeAccount({ name: "Second Account" });

    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, fn) => {
        await fn(lockFailClient, makeAccount({ name: "First" }));
        await fn(successClient, successAccount);
      }),
      _client: lockFailClient,
    });

    await withMessage("42", { mailbox: "INBOX" }, deps, async () => "ok", onProgress);

    expect(onProgress).toHaveBeenCalledWith({ type: "mailbox-lock-failed", mailbox: "INBOX", error });
  });

  it("rejects with fn error when fn throws", async () => {
    const lock = makeLock();
    const errorClient = {
      getMailboxLock: mock(() => Promise.resolve(lock)),
      search: mock(() => Promise.resolve([42])),
    };
    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, fn) => {
        await fn(errorClient, makeAccount());
      }),
      _client: errorClient,
    });

    await expect(
      withMessage("42", { mailbox: "INBOX" }, deps, async () => {
        throw new Error("fn error");
      }),
    ).rejects.toThrow("fn error");
  });

  it("releases lock even when fn throws", async () => {
    const lock = makeLock();
    const errorClient = {
      getMailboxLock: mock(() => Promise.resolve(lock)),
      search: mock(() => Promise.resolve([42])),
    };
    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, fn) => {
        await fn(errorClient, makeAccount());
      }),
      _client: errorClient,
    });

    try {
      await withMessage("42", { mailbox: "INBOX" }, deps, async () => {
        throw new Error("fn error");
      });
    } catch {
      // expected
    }

    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it("stops iterating after UID is found in first account", async () => {
    let fnCallCount = 0;
    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, fn) => {
        await fn(makeClient(), makeAccount({ name: "First" }));
        await fn(makeClient(), makeAccount({ name: "Second" }));
      }),
    });

    await withMessage("42", { mailbox: "INBOX" }, deps, async () => {
      fnCallCount++;
      return "done";
    });

    expect(fnCallCount).toBe(1);
  });
});
