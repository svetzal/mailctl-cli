import { describe, it, expect, mock } from "bun:test";
import { groupByMailbox, forEachMailboxGroup } from "../src/imap-orchestration.js";
import { makeLock } from "./helpers.js";

// ── groupByMailbox ────────────────────────────────────────────────────────────

describe("groupByMailbox", () => {
  it("returns an empty Map when given an empty array", () => {
    expect(groupByMailbox([]).size).toBe(0);
  });

  it("groups a single item into its mailbox", () => {
    const results = [{ mailbox: "INBOX", uid: 1 }];
    const map = groupByMailbox(results);
    expect(map.size).toBe(1);
    expect(map.get("INBOX")).toEqual([{ mailbox: "INBOX", uid: 1 }]);
  });

  it("groups multiple items with the same mailbox together", () => {
    const results = [
      { mailbox: "INBOX", uid: 1 },
      { mailbox: "INBOX", uid: 2 },
    ];
    expect(groupByMailbox(results).get("INBOX")).toHaveLength(2);
  });

  it("separates items from different mailboxes into distinct groups", () => {
    const results = [
      { mailbox: "INBOX",   uid: 1 },
      { mailbox: "Archive", uid: 2 },
    ];
    const map = groupByMailbox(results);
    expect(map.size).toBe(2);
    expect(map.get("INBOX")).toHaveLength(1);
    expect(map.get("Archive")).toHaveLength(1);
  });

  it("preserves insertion order within each group", () => {
    const results = [
      { mailbox: "INBOX", uid: 10 },
      { mailbox: "INBOX", uid: 20 },
    ];
    const group = groupByMailbox(results).get("INBOX");
    expect(group[0].uid).toBe(10);
    expect(group[1].uid).toBe(20);
  });
});

// ── forEachMailboxGroup ───────────────────────────────────────────────────────

describe("forEachMailboxGroup", () => {
  it("calls fn once per mailbox with correct arguments", async () => {
    const lock = makeLock();
    const client = { getMailboxLock: mock(() => Promise.resolve(lock)) };
    const fn = mock(() => Promise.resolve());

    const byMailbox = new Map([["INBOX", [{ uid: 1 }]]]);
    await forEachMailboxGroup(client, byMailbox, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("INBOX", [{ uid: 1 }]);
  });

  it("releases the lock after fn resolves", async () => {
    const lock = makeLock();
    const client = { getMailboxLock: mock(() => Promise.resolve(lock)) };

    await forEachMailboxGroup(client, new Map([["INBOX", []]]), async () => {});

    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it("releases the lock even when fn throws", async () => {
    const lock = makeLock();
    const client = { getMailboxLock: mock(() => Promise.resolve(lock)) };

    await forEachMailboxGroup(
      client,
      new Map([["INBOX", []]]),
      async () => { throw new Error("boom"); }
    ).catch(() => {}); // swallow so test can assert

    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it("skips a mailbox when getMailboxLock throws", async () => {
    const client = { getMailboxLock: mock(() => Promise.reject(new Error("no such mailbox"))) };
    const fn = mock(() => Promise.resolve());

    await forEachMailboxGroup(client, new Map([["INBOX", []]]), fn);

    expect(fn).not.toHaveBeenCalled();
  });

  it("processes all mailboxes when there are multiple", async () => {
    const locks = [makeLock(), makeLock()];
    let callIdx = 0;
    const client = { getMailboxLock: mock(() => Promise.resolve(locks[callIdx++])) };
    const visited = [];

    const byMailbox = new Map([
      ["INBOX",   [{ uid: 1 }]],
      ["Archive", [{ uid: 2 }]],
    ]);
    await forEachMailboxGroup(client, byMailbox, async (mailbox) => {
      visited.push(mailbox);
    });

    expect(visited).toEqual(["INBOX", "Archive"]);
    expect(locks[0].release).toHaveBeenCalledTimes(1);
    expect(locks[1].release).toHaveBeenCalledTimes(1);
  });
});
