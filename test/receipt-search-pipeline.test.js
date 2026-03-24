import { describe, it, expect, mock } from "bun:test";
import { searchAccountForReceipts } from "../src/receipt-search-pipeline.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMailbox(path) {
  return { path, specialUse: null, flags: new Set() };
}

function makeMsg(uid, messageId, fromAddress = "billing@acme.com", fromName = "Acme") {
  return {
    uid,
    messageId,
    account: "TestAccount",
    mailbox: "INBOX",
    date: new Date("2025-03-01"),
    fromAddress,
    fromName,
    subject: "Invoice",
  };
}

function makeFns({ mailboxes = [], messages = {} } = {}) {
  return {
    listMailboxes: mock(() => Promise.resolve(mailboxes)),
    searchMailboxForReceipts: mock((client, accountName, mbPath) =>
      Promise.resolve(messages[mbPath] ?? [])
    ),
  };
}

// ── searchAccountForReceipts ──────────────────────────────────────────────────

describe("searchAccountForReceipts", () => {
  it("returns empty array when no mailboxes match", async () => {
    const client = {};
    const account = { name: "TestAccount" };
    const since = new Date();
    const fns = makeFns({ mailboxes: [] });

    const result = await searchAccountForReceipts(client, account, since, fns);

    expect(result).toHaveLength(0);
  });

  it("returns empty array when mailboxes exist but no emails found", async () => {
    const client = {};
    const account = { name: "TestAccount" };
    const since = new Date();
    const fns = makeFns({
      mailboxes: [makeMailbox("INBOX")],
      messages: { INBOX: [] },
    });

    const result = await searchAccountForReceipts(client, account, since, fns);

    expect(result).toHaveLength(0);
  });

  it("returns results from a single mailbox", async () => {
    const client = {};
    const account = { name: "TestAccount" };
    const since = new Date();
    const msg = makeMsg(1, "msg-1@acme.com");
    const fns = makeFns({
      mailboxes: [makeMailbox("INBOX")],
      messages: { INBOX: [msg] },
    });

    const result = await searchAccountForReceipts(client, account, since, fns);

    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe(1);
  });

  it("deduplicates results with the same message-id across mailboxes", async () => {
    const client = {};
    const account = { name: "TestAccount" };
    const since = new Date();
    const msg1 = makeMsg(1, "same-id@acme.com");
    const msg2 = makeMsg(2, "same-id@acme.com");  // same message-id, different mailbox
    const fns = makeFns({
      mailboxes: [makeMailbox("INBOX"), makeMailbox("Archive")],
      messages: {
        INBOX: [msg1],
        Archive: [msg2],
      },
    });

    const result = await searchAccountForReceipts(client, account, since, fns);

    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe(1);  // first occurrence kept
  });

  it("returns results from multiple mailboxes when message-ids are unique", async () => {
    const client = {};
    const account = { name: "TestAccount" };
    const since = new Date();
    const msg1 = makeMsg(1, "msg-1@acme.com");
    const msg2 = makeMsg(2, "msg-2@acme.com");
    const fns = makeFns({
      mailboxes: [makeMailbox("INBOX"), makeMailbox("Sent")],
      messages: {
        INBOX: [msg1],
        Sent: [msg2],
      },
    });

    const result = await searchAccountForReceipts(client, account, since, fns);

    expect(result).toHaveLength(2);
  });

  it("passes the since date to searchMailboxForReceipts", async () => {
    const client = {};
    const account = { name: "TestAccount" };
    const since = new Date("2025-01-01");
    const capturedSince = [];
    const fns = {
      listMailboxes: mock(() => Promise.resolve([makeMailbox("INBOX")])),
      searchMailboxForReceipts: mock((c, name, mbPath, s) => {
        capturedSince.push(s);
        return Promise.resolve([]);
      }),
    };

    await searchAccountForReceipts(client, account, since, fns);

    expect(capturedSince[0]).toBe(since);
  });

  it("passes the account name to searchMailboxForReceipts", async () => {
    const client = {};
    const account = { name: "MyAccount" };
    const since = new Date();
    const capturedNames = [];
    const fns = {
      listMailboxes: mock(() => Promise.resolve([makeMailbox("INBOX")])),
      searchMailboxForReceipts: mock((c, name) => {
        capturedNames.push(name);
        return Promise.resolve([]);
      }),
    };

    await searchAccountForReceipts(client, account, since, fns);

    expect(capturedNames[0]).toBe("MyAccount");
  });
});
