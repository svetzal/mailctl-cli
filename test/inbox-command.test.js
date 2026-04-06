import { beforeAll, describe, expect, it, mock } from "bun:test";
import { inboxCommand } from "../src/inbox-command.js";
import { makeAccount } from "./helpers.js";

function makeMessage(uid = 1) {
  return {
    uid,
    subject: `Email ${uid}`,
    from: "alice@example.com",
    date: new Date(),
    read: false,
  };
}

function makeDeps(overrides = {}) {
  const account = makeAccount();
  const messages = [makeMessage(1), makeMessage(2)];

  const forEachAccount = mock(async (_accounts, fn) => {
    const client = {
      getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
      search: mock(() => Promise.resolve([1, 2])),
      fetch: mock(async function* () {
        for (const msg of messages) {
          yield {
            uid: msg.uid,
            flags: new Set(),
            envelope: {
              subject: msg.subject,
              from: [{ address: msg.from }],
              date: msg.date,
            },
          };
        }
      }),
    };
    await fn(client, account);
  });

  return {
    targetAccounts: [account],
    forEachAccount,
    ...overrides,
  };
}

// ── inboxCommand ───────────────────────────────────────────────────────────────

describe("inboxCommand", () => {
  describe("returns allResults and resultsByAccount", () => {
    let result;
    beforeAll(async () => {
      result = await inboxCommand({}, makeDeps());
    });

    it("allResults is defined", async () => {
      expect(result.allResults).toBeDefined();
    });

    it("resultsByAccount is defined", async () => {
      expect(result.resultsByAccount).toBeDefined();
    });
  });

  it("groups results by account name in resultsByAccount", async () => {
    const deps = makeDeps();
    const result = await inboxCommand({}, deps);

    expect(result.resultsByAccount.has("Test Account")).toBe(true);
  });

  describe("aggregates messages into allResults across accounts", () => {
    const account1 = makeAccount({ name: "Account 1" });
    const account2 = makeAccount({ name: "Account 2" });

    const deps = makeDeps({
      targetAccounts: [account1, account2],
      forEachAccount: mock(async (_accounts, fn) => {
        const makeClientFn = () => ({
          getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
          search: mock(() => Promise.resolve([1])),
          fetch: mock(async function* () {
            yield {
              uid: 1,
              flags: new Set(),
              envelope: { subject: "Msg", from: [], date: new Date() },
            };
          }),
        });
        await fn(makeClientFn(), account1);
        await fn(makeClientFn(), account2);
      }),
    });

    let result;
    beforeAll(async () => {
      result = await inboxCommand({}, deps);
    });

    it("resultsByAccount has 2 accounts", async () => {
      expect(result.resultsByAccount.size).toBe(2);
    });

    it("allResults has at least 2 messages", async () => {
      expect(result.allResults.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("passes unreadOnly: true when --unread option is set", () => {
    let capturedCriteria;
    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, fn) => {
        const client = {
          getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
          search: mock((criteria) => {
            capturedCriteria = criteria;
            return Promise.resolve([]);
          }),
          fetch: mock(async function* () {}),
        };
        await fn(client, makeAccount());
      }),
    });

    beforeAll(async () => {
      await inboxCommand({ unread: true }, deps);
    });

    it("capturedCriteria is defined", async () => {
      expect(capturedCriteria).toBeDefined();
    });

    it("criteria.seen is false", async () => {
      expect(/** @type {any} */ (capturedCriteria).seen).toBe(false);
    });
  });

  it("returns empty results when no messages in inbox", async () => {
    const deps = makeDeps({
      forEachAccount: mock(async (_accounts, fn) => {
        const client = {
          getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
          search: mock(() => Promise.resolve([])),
          fetch: mock(async function* () {}),
        };
        await fn(client, makeAccount());
      }),
    });

    const result = await inboxCommand({}, deps);

    expect(result.allResults).toHaveLength(0);
  });
});
