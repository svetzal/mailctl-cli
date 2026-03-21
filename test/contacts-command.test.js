import { describe, it, expect, mock } from "bun:test";
import { contactsCommand } from "../src/contacts-command.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeAccount(overrides = {}) {
  return { name: "Test Account", user: "self@test.com", ...overrides };
}

function makeContactEntry(address, name = "Unknown") {
  return {
    address,
    name,
    count: 3,
    lastSeen: new Date("2025-01-15"),
    direction: "received",
  };
}

function makeDeps(overrides = {}) {
  const account = makeAccount();
  const contactEntries = [
    makeContactEntry("alice@example.com", "Alice"),
    makeContactEntry("bob@example.com", "Bob"),
  ];

  const forEachAccount = mock(async (accounts, fn) => {
    // extractContacts calls listMailboxes(client) which calls client.list()
    const client = {
      list: mock(() => Promise.resolve([
        { path: "INBOX", specialUse: "\\Inbox", name: "INBOX" },
        { path: "Sent", specialUse: "\\Sent", name: "Sent" },
      ])),
      getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
      search: mock(() => Promise.resolve([1, 2])),
      fetch: mock(async function* () {
        for (const entry of contactEntries) {
          yield {
            uid: 1,
            envelope: {
              from: [{ name: entry.name, address: entry.address }],
              to: [{ address: "self@test.com" }],
              date: entry.lastSeen,
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

// ── contactsCommand ────────────────────────────────────────────────────────────

describe("contactsCommand", () => {
  it("returns contacts array and sinceLabel", async () => {
    const deps = makeDeps();
    const result = await contactsCommand({}, deps);

    expect(result.contacts).toBeDefined();
    expect(result.sinceLabel).toBeDefined();
  });

  it("returns sinceLabel 'last 6 months' by default", async () => {
    const deps = makeDeps();
    const { sinceLabel } = await contactsCommand({}, deps);

    expect(sinceLabel).toBe("last 6 months");
  });

  it("includes since date in sinceLabel when --since is provided", async () => {
    const deps = makeDeps();
    const { sinceLabel } = await contactsCommand({ since: "3m" }, deps);

    // Should not be "last 6 months" anymore
    expect(sinceLabel).not.toBe("last 6 months");
    expect(sinceLabel).toContain("since");
  });

  it("excludes self addresses from contacts", async () => {
    // Account user is "self@test.com"
    const deps = makeDeps({
      forEachAccount: mock(async (accounts, fn) => {
        const client = {
          list: mock(() => Promise.resolve([{ path: "INBOX", specialUse: "\\Inbox" }, { path: "Sent", specialUse: "\\Sent" }])),
          getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
          search: mock(() => Promise.resolve([1])),
          fetch: mock(async function* () {
            yield {
              uid: 1,
              envelope: {
                from: [{ address: "self@test.com" }],
                to: [{ address: "alice@example.com" }],
                date: new Date(),
              },
            };
          }),
        };
        await fn(client, makeAccount());
      }),
    });

    const { contacts } = await contactsCommand({}, deps);

    // self address should be excluded
    const selfContact = contacts.find((c) => c.address === "self@test.com");
    expect(selfContact).toBeUndefined();
  });

  it("aggregates across multiple accounts", async () => {
    const account1 = makeAccount({ name: "Account 1", user: "user1@test.com" });
    const account2 = makeAccount({ name: "Account 2", user: "user2@test.com" });

    const deps = makeDeps({
      targetAccounts: [account1, account2],
      forEachAccount: mock(async (accounts, fn) => {
        const makeClient = () => ({
          list: mock(() => Promise.resolve([{ path: "INBOX", specialUse: "\\Inbox" }, { path: "Sent", specialUse: "\\Sent" }])),
          getMailboxLock: mock(() => Promise.resolve({ release: mock(() => {}) })),
          search: mock(() => Promise.resolve([1])),
          fetch: mock(async function* () {
            yield {
              uid: 1,
              envelope: {
                from: [{ address: "alice@example.com" }],
                to: [{ address: "user1@test.com" }],
                date: new Date(),
              },
            };
          }),
        });
        await fn(makeClient(), account1);
        await fn(makeClient(), account2);
      }),
    });

    const { contacts } = await contactsCommand({}, deps);

    // alice should appear with a higher count from both accounts
    const alice = contacts.find((c) => c.address === "alice@example.com");
    expect(alice).toBeDefined();
  });
});
