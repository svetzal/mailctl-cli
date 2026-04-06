import { beforeAll, describe, expect, it, mock } from "bun:test";
import { forEachMailboxGroup, groupByMailbox } from "../src/imap-orchestration.js";
import { makeLock } from "./helpers.js";

// ── groupByMailbox ────────────────────────────────────────────────────────────

describe("groupByMailbox", () => {
  it("returns an empty Map when given an empty array", () => {
    expect(groupByMailbox([]).size).toBe(0);
  });

  describe("groups a single item into its mailbox", () => {
    const results = [{ mailbox: "INBOX", uid: 1 }];
    const map = groupByMailbox(results);

    it("map has one entry", () => {
      expect(map.size).toBe(1);
    });

    it("INBOX entry contains the item", () => {
      expect(map.get("INBOX")).toEqual([{ mailbox: "INBOX", uid: 1 }]);
    });
  });

  it("groups multiple items with the same mailbox together", () => {
    const results = [
      { mailbox: "INBOX", uid: 1 },
      { mailbox: "INBOX", uid: 2 },
    ];
    expect(groupByMailbox(results).get("INBOX")).toHaveLength(2);
  });

  describe("separates items from different mailboxes into distinct groups", () => {
    const results = [
      { mailbox: "INBOX", uid: 1 },
      { mailbox: "Archive", uid: 2 },
    ];
    const map = groupByMailbox(results);

    it("map has two entries", () => {
      expect(map.size).toBe(2);
    });

    it("INBOX has one item", () => {
      expect(map.get("INBOX")).toHaveLength(1);
    });

    it("Archive has one item", () => {
      expect(map.get("Archive")).toHaveLength(1);
    });
  });

  describe("preserves insertion order within each group", () => {
    const results = [
      { mailbox: "INBOX", uid: 10 },
      { mailbox: "INBOX", uid: 20 },
    ];
    const group = groupByMailbox(results).get("INBOX");

    it("first item uid is 10", () => {
      expect(group[0].uid).toBe(10);
    });

    it("second item uid is 20", () => {
      expect(group[1].uid).toBe(20);
    });
  });
});

// ── forEachMailboxGroup ───────────────────────────────────────────────────────

describe("forEachMailboxGroup", () => {
  describe("calls fn once per mailbox with correct arguments", () => {
    const lock = makeLock();
    const client = { getMailboxLock: mock(() => Promise.resolve(lock)) };
    const fn = mock(() => Promise.resolve());
    const byMailbox = new Map([["INBOX", [{ uid: 1 }]]]);
    beforeAll(async () => {
      await forEachMailboxGroup(client, byMailbox, fn);
    });

    it("fn is called once", async () => {
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("fn is called with INBOX and items", async () => {
      expect(fn).toHaveBeenCalledWith("INBOX", [{ uid: 1 }]);
    });
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

    await forEachMailboxGroup(client, new Map([["INBOX", []]]), async () => {
      throw new Error("boom");
    }).catch(() => {}); // swallow so test can assert

    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it("skips a mailbox when getMailboxLock throws", async () => {
    const client = { getMailboxLock: mock(() => Promise.reject(new Error("no such mailbox"))) };
    const fn = mock(() => Promise.resolve());

    await forEachMailboxGroup(client, new Map([["INBOX", []]]), fn);

    expect(fn).not.toHaveBeenCalled();
  });

  describe("processes all mailboxes when there are multiple", () => {
    const locks = [makeLock(), makeLock()];
    let callIdx = 0;
    const client = { getMailboxLock: mock(() => Promise.resolve(locks[callIdx++])) };
    const visited = [];
    const byMailbox = new Map([
      ["INBOX", [{ uid: 1 }]],
      ["Archive", [{ uid: 2 }]],
    ]);

    beforeAll(async () => {
      await forEachMailboxGroup(client, byMailbox, async (mailbox) => {
        visited.push(mailbox);
      });
    });

    it("visited all mailboxes in order", async () => {
      expect(visited).toEqual(["INBOX", "Archive"]);
    });

    it("first lock is released", async () => {
      expect(locks[0].release).toHaveBeenCalledTimes(1);
    });

    it("second lock is released", async () => {
      expect(locks[1].release).toHaveBeenCalledTimes(1);
    });
  });
});
