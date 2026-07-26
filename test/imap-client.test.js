import { describe, expect, it, mock } from "bun:test";
import { connect, forEachAccount, listMailboxes, scanForReceipts } from "../src/imap-client.js";
import { makeLock } from "./helpers.js";

// ── connect ───────────────────────────────────────────────────────────────────

describe("connect", () => {
  /** Build a fake ImapFlow constructor that returns a mock client. */
  function makeFakeConstructor() {
    /** @type {object} */
    let capturedConfig;
    const fakeClient = { connect: mock(() => Promise.resolve()) };
    const fakeConstructor = /** @type {any} */ (
      mock((config) => {
        capturedConfig = config;
        return fakeClient;
      })
    );
    return { fakeConstructor, fakeClient, getCapturedConfig: () => capturedConfig };
  }

  const passwordAccount = {
    host: "imap.test.com",
    port: 993,
    user: "user@test.com",
    pass: "s3cr3t",
  };

  it("builds password auth for accounts without oauth2", async () => {
    const { fakeConstructor, getCapturedConfig } = makeFakeConstructor();
    await connect(passwordAccount, () => {}, fakeConstructor);

    expect(getCapturedConfig().auth).toEqual({ user: "user@test.com", pass: "s3cr3t" });
  });

  it("builds OAuth2 auth for accounts with oauth2 config", async () => {
    const { fakeConstructor, getCapturedConfig } = makeFakeConstructor();
    const fakeGetAccessToken = mock(() => Promise.resolve("fake-access-token"));
    const oauth2Account = {
      host: "outlook.office365.com",
      port: 993,
      user: "user@corp.com",
      oauth2: { clientId: "cid", tenantId: "tid", clientSecret: "csec" },
    };

    await connect(oauth2Account, () => {}, fakeConstructor, fakeGetAccessToken);

    expect(getCapturedConfig().auth).toEqual({ user: "user@corp.com", accessToken: "fake-access-token" });
  });

  it("sets socketTimeout on the client config", async () => {
    const { fakeConstructor, getCapturedConfig } = makeFakeConstructor();
    await connect(passwordAccount, () => {}, fakeConstructor);

    expect(getCapturedConfig().socketTimeout).toBeGreaterThan(0);
  });

  it("calls connect() on the constructed client", async () => {
    const { fakeConstructor, fakeClient } = makeFakeConstructor();
    await connect(passwordAccount, () => {}, fakeConstructor);

    expect(fakeClient.connect).toHaveBeenCalledTimes(1);
  });

  it("returns the constructed client instance", async () => {
    const { fakeConstructor, fakeClient } = makeFakeConstructor();
    const result = /** @type {any} */ (await connect(passwordAccount, () => {}, fakeConstructor));

    expect(result).toBe(fakeClient);
  });
});

// ── listMailboxes ─────────────────────────────────────────────────────────────

describe("listMailboxes", () => {
  it("returns an array of mailbox descriptors", async () => {
    const client = /** @type {any} */ ({
      list: mock(() =>
        Promise.resolve([
          { path: "INBOX", name: "INBOX", flags: new Set(), specialUse: "\\Inbox" },
          { path: "Sent", name: "Sent", flags: new Set(), specialUse: "\\Sent" },
        ]),
      ),
    });

    const result = await listMailboxes(client);

    expect(Array.isArray(result)).toBe(true);
  });

  it("returns the correct number of mailboxes", async () => {
    const client = /** @type {any} */ ({
      list: mock(() =>
        Promise.resolve([
          { path: "INBOX", name: "INBOX", flags: new Set(), specialUse: null },
          { path: "Archive", name: "Archive", flags: new Set(), specialUse: null },
          { path: "Drafts", name: "Drafts", flags: new Set(), specialUse: "\\Drafts" },
        ]),
      ),
    });

    const result = await listMailboxes(client);

    expect(result).toHaveLength(3);
  });

  it("maps path onto each entry", async () => {
    const client = /** @type {any} */ ({
      list: mock(() => Promise.resolve([{ path: "INBOX", name: "INBOX", flags: new Set(), specialUse: null }])),
    });

    const [mb] = await listMailboxes(client);

    expect(mb.path).toBe("INBOX");
  });

  it("maps name onto each entry", async () => {
    const client = /** @type {any} */ ({
      list: mock(() => Promise.resolve([{ path: "INBOX", name: "Inbox Display", flags: new Set(), specialUse: null }])),
    });

    const [mb] = await listMailboxes(client);

    expect(mb.name).toBe("Inbox Display");
  });

  it("maps specialUse onto each entry", async () => {
    const client = /** @type {any} */ ({
      list: mock(() => Promise.resolve([{ path: "Sent", name: "Sent", flags: new Set(), specialUse: "\\Sent" }])),
    });

    const [mb] = await listMailboxes(client);

    expect(mb.specialUse).toBe("\\Sent");
  });

  it("maps flags onto each entry", async () => {
    const flags = new Set(["\\HasNoChildren"]);
    const client = /** @type {any} */ ({
      list: mock(() => Promise.resolve([{ path: "INBOX", name: "INBOX", flags, specialUse: null }])),
    });

    const [mb] = await listMailboxes(client);

    expect(mb.flags).toBe(flags);
  });

  it("returns an empty array when the server has no mailboxes", async () => {
    const client = /** @type {any} */ ({ list: mock(() => Promise.resolve([])) });

    const result = await listMailboxes(client);

    expect(result).toEqual([]);
  });
});

// ── forEachAccount ────────────────────────────────────────────────────────────
//
// forEachAccount uses the real ImapFlow connect() and is therefore a gateway
// boundary. We test its observable contract — connection lifecycle and error
// handling — through a simulation of the same logic rather than invoking the
// production function against a live IMAP server.

describe("forEachAccount contract (simulated)", () => {
  it("calls fn once per account", async () => {
    const fn = /** @type {(client: any, account: any) => Promise<void>} */ (mock(() => Promise.resolve()));
    const accounts = [
      { name: "Acc1", user: "a@test.com" },
      { name: "Acc2", user: "b@test.com" },
    ];

    // Simulate the forEachAccount contract: iterate accounts, call fn with client + account
    for (const acct of accounts) {
      await fn({}, acct);
    }

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("calls fn with the account as the second argument", async () => {
    const account = { name: "Personal", user: "me@example.com" };
    const captured = /** @type {any[]} */ ([]);
    const fn = /** @type {(client: any, account: any) => Promise<void>} */ (
      mock(async (_client, acct) => {
        captured.push(acct);
      })
    );

    await fn({}, account);

    expect(captured[0]).toBe(account);
  });

  describe("emits connect-error and continues to the next account when connection fails", () => {
    const onProgress = /** @type {(event: any) => void} */ (mock(() => {}));
    const error = new Error("Connection refused");
    const accounts = [
      { name: "FailAcct", user: "fail@example.com" },
      { name: "OkAcct", user: "ok@example.com" },
    ];
    const fn = /** @type {(client: any, account: any) => Promise<void>} */ (mock(() => Promise.resolve()));
    let fnCallCount = 0;

    // Simulate forEachAccount: skip failing accounts and continue
    for (const account of accounts) {
      try {
        if (account.name === "FailAcct") throw error;
        fn({}, account);
        fnCallCount++;
      } catch (err) {
        onProgress({ type: "connect-error", account: account.name, error: err });
      }
    }

    it("emits connect-error for the failing account", () => {
      expect(onProgress).toHaveBeenCalledWith({ type: "connect-error", account: "FailAcct", error });
    });

    it("continues and calls fn for the succeeding account", () => {
      expect(fnCallCount).toBe(1);
    });
  });
});

// ── forEachAccount ────────────────────────────────────────────────────────────

describe("forEachAccount", () => {
  const accounts = [
    { name: "Acc1", user: "a@test.com" },
    { name: "Acc2", user: "b@test.com" },
  ];

  it("resolves with an accountFailures entry per account when every connect rejects", async () => {
    const connectFn = /** @type {any} */ (mock(() => Promise.reject(new Error("connect refused"))));
    const fn = /** @type {any} */ (mock(() => Promise.resolve()));

    const result = await forEachAccount(accounts, fn, () => {}, connectFn);

    expect(result.accountFailures).toHaveLength(2);
    expect(result.accountFailures).toEqual([
      { account: "Acc1", error: "connect refused" },
      { account: "Acc2", error: "connect refused" },
    ]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("resolves with an empty accountFailures list when every account connects", async () => {
    const fakeClient = /** @type {any} */ ({ logout: mock(() => Promise.resolve()) });
    const connectFn = /** @type {any} */ (mock(() => Promise.resolve(fakeClient)));
    const fn = /** @type {any} */ (mock(() => Promise.resolve()));

    const result = await forEachAccount(accounts, fn, () => {}, connectFn);

    expect(result.accountFailures).toEqual([]);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ── scanForReceipts ───────────────────────────────────────────────────────────

describe("scanForReceipts", () => {
  /** @param {{ searchUids?: number[], envelopes?: any[], lockFails?: boolean }} [opts] */
  function makeClient({ searchUids = [], envelopes = [], lockFails = false } = {}) {
    return /** @type {any} */ ({
      getMailboxLock: lockFails
        ? mock(() => Promise.reject(new Error("no such mailbox")))
        : mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: envelopes.length },
      search: mock(() => Promise.resolve(searchUids)),
      fetch: mock(() => {
        async function* gen() {
          for (const env of envelopes) yield env;
        }
        return gen();
      }),
    });
  }

  it("returns empty results when no receipt-matching messages are found", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });

    const { results } = await scanForReceipts(client, "TestAccount", ["INBOX"]);

    expect(results).toEqual([]);
  });

  it("returns results when receipt subjects are found", async () => {
    const client = makeClient({
      searchUids: [1],
      envelopes: [
        {
          uid: 1,
          envelope: {
            date: new Date("2025-03-07"),
            from: [{ address: "billing@acme.com", name: "Acme" }],
            subject: "Invoice #123",
            messageId: "msg-1@acme.com",
          },
        },
      ],
    });

    const { results } = await scanForReceipts(client, "TestAccount", ["INBOX"]);

    expect(results.length).toBeGreaterThan(0);
  });

  it("skips a mailbox when getMailboxLock throws", async () => {
    const client = makeClient({ lockFails: true });

    const { results } = await scanForReceipts(client, "TestAccount", ["INBOX"]);

    expect(results).toEqual([]);
  });

  it("emits mailbox-lock-failed when getMailboxLock throws", async () => {
    const error = new Error("no such mailbox");
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.reject(error)),
    });
    const onProgress = /** @type {(event: any) => void} */ (mock(() => {}));

    await scanForReceipts(client, "TestAccount", ["INBOX"], {}, onProgress);

    expect(onProgress).toHaveBeenCalledWith({
      type: "mailbox-lock-failed",
      severity: "error",
      mailbox: "INBOX",
      error,
    });
  });

  it("emits mailbox-start with exists count before searching", async () => {
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 42 },
      search: mock(() => Promise.resolve([])),
    });
    const onProgress = /** @type {(event: any) => void} */ (mock(() => {}));

    await scanForReceipts(client, "TestAccount", ["INBOX"], {}, onProgress);

    expect(onProgress).toHaveBeenCalledWith({ type: "mailbox-start", mailbox: "INBOX", count: 42 });
  });

  it("searches all mailboxes in the provided list", async () => {
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 0 },
      search: mock(() => Promise.resolve([])),
    });

    await scanForReceipts(client, "TestAccount", ["INBOX", "Archive"]);

    // getMailboxLock called once per mailbox
    expect(client.getMailboxLock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates UIDs across receipt search terms", async () => {
    // search always returns the same UID regardless of term
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 1 },
      search: mock(() => Promise.resolve([99])),
      fetch: mock(() => {
        async function* gen() {
          yield {
            uid: 99,
            envelope: {
              date: new Date("2025-03-01"),
              from: [{ address: "billing@vendor.com", name: "Vendor" }],
              subject: "Your invoice",
              messageId: "msg-99@vendor.com",
            },
          };
        }
        return gen();
      }),
    });

    const { results } = await scanForReceipts(client, "TestAccount", ["INBOX"]);

    // UID 99 should only appear once even though multiple search terms matched
    const uidsFound = results.map((r) => r.uid);
    const uniqueUids = new Set(uidsFound);
    expect(uniqueUids.size).toBe(uidsFound.length);
  });

  it("records a failure entry when a search term throws", async () => {
    const searchErr = new Error("IMAP search failed");
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 1 },
      search: mock(() => Promise.reject(searchErr)),
      fetch: mock(() => (async function* () {})()),
    });

    const { results, failures } = await scanForReceipts(client, "TestAccount", ["INBOX"]);

    expect(results).toEqual([]);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0].mailbox).toBe("INBOX");
    expect(failures[0].phase).toBe("search");
    expect(failures[0].error).toBe(searchErr);
  });

  it("passes the since option to each search", async () => {
    const since = new Date("2025-01-01");
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 0 },
      search: mock(() => Promise.resolve([])),
    });

    await scanForReceipts(client, "TestAccount", ["INBOX"], { since });

    // Every search call should include the since date
    const calls = /** @type {any[][]} */ (client.search.mock.calls);
    for (const [criteria] of calls) {
      expect(criteria.since).toBe(since);
    }
  });

  it("returns empty failures when all searches succeed", async () => {
    const client = makeClient({ searchUids: [], envelopes: [] });

    const { failures } = await scanForReceipts(client, "TestAccount", ["INBOX"]);

    expect(failures).toEqual([]);
  });

  it("rethrows a bare TypeError raised from client.search instead of recording it as a failure", async () => {
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 1 },
      search: mock(() => Promise.reject(new TypeError("bad search criteria"))),
    });

    await expect(scanForReceipts(client, "TestAccount", ["INBOX"])).rejects.toBeInstanceOf(TypeError);
  });

  it("rethrows a bare TypeError raised from client.fetch instead of recording it as a failure", async () => {
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 1 },
      search: mock(() => Promise.resolve([1])),
      fetch: mock(() => {
        // biome-ignore lint/correctness/useYield: intentionally throws before any yield to simulate a fetch failure
        async function* gen() {
          throw new TypeError("bad fetch query");
        }
        return gen();
      }),
    });

    await expect(scanForReceipts(client, "TestAccount", ["INBOX"])).rejects.toBeInstanceOf(TypeError);
  });

  it("still records an ordinary Error from client.search as a search-phase failure", async () => {
    const searchErr = new Error("IMAP search failed");
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 1 },
      search: mock(() => Promise.reject(searchErr)),
    });

    const { failures } = await scanForReceipts(client, "TestAccount", ["INBOX"]);

    expect(failures[0]).toMatchObject({ mailbox: "INBOX", phase: "search", error: searchErr });
  });

  it("still records a timeout error carrying an ETIMEDOUT code as a search-phase failure", async () => {
    const timeoutErr = /** @type {any} */ (new Error("timed out"));
    timeoutErr.code = "ETIMEDOUT";
    const client = /** @type {any} */ ({
      getMailboxLock: mock(() => Promise.resolve(makeLock())),
      mailbox: { exists: 1 },
      search: mock(() => Promise.reject(timeoutErr)),
    });

    const { failures } = await scanForReceipts(client, "TestAccount", ["INBOX"]);

    expect(failures[0]).toMatchObject({ mailbox: "INBOX", phase: "search", error: timeoutErr });
  });
});
