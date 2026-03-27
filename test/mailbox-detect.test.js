import { describe, expect, it } from "bun:test";
import { detectMailbox } from "../src/mailbox-detect.js";

/**
 * Build a mock IMAP client with configurable UID contents per mailbox.
 * @param {Record<string, number[]>} mailboxUids - map of mailbox path to UIDs it contains
 * @param {object} [opts]
 * @param {string[]} [opts.failLock] - mailbox paths that should fail getMailboxLock
 * @param {string[]} [opts.failSearch] - mailbox paths that should fail search
 */
function buildClient(mailboxUids, opts = {}) {
  const failLock = new Set(opts.failLock || []);
  const failSearch = new Set(opts.failSearch || []);
  let currentMailbox = null;

  return {
    getMailboxLock(path) {
      if (failLock.has(path)) return Promise.reject(new Error("lock failed"));
      currentMailbox = path;
      return Promise.resolve({ release() {} });
    },
    search(criteria) {
      if (failSearch.has(currentMailbox)) return Promise.reject(new Error("search failed"));
      const uids = mailboxUids[currentMailbox] || [];
      const targetUid = parseInt(criteria.uid, 10);
      return Promise.resolve(uids.includes(targetUid) ? [targetUid] : []);
    },
  };
}

const ALL_PATHS = ["INBOX", "Sent", "Receipts/Business", "Archive"];

describe("detectMailbox", () => {
  it("finds UID in INBOX on first try (fast path)", async () => {
    const client = buildClient({ INBOX: [100] });

    const result = await detectMailbox(client, 100, ALL_PATHS);

    expect(result).toBe("INBOX");
  });

  it("finds UID in non-INBOX mailbox after INBOX miss", async () => {
    const client = buildClient({ INBOX: [], "Receipts/Business": [4523] });

    const result = await detectMailbox(client, 4523, ALL_PATHS);

    expect(result).toBe("Receipts/Business");
  });

  it("returns null when UID not found in any mailbox", async () => {
    const client = buildClient({ INBOX: [], Sent: [], "Receipts/Business": [], Archive: [] });

    const result = await detectMailbox(client, 9999, ALL_PATHS);

    expect(result).toBeNull();
  });

  it("skips INBOX duplicate when INBOX is in the path list", async () => {
    const client = buildClient({ INBOX: [], Sent: [200] });

    const result = await detectMailbox(client, 200, ["INBOX", "Sent"]);

    expect(result).toBe("Sent");
  });

  it("handles IMAP lock errors on individual mailboxes gracefully", async () => {
    const client = buildClient({ INBOX: [], Sent: [400], "Receipts/Business": [400] }, { failLock: ["Sent"] });

    const result = await detectMailbox(client, 400, ALL_PATHS);

    expect(result).toBe("Receipts/Business");
  });

  it("handles IMAP search errors on individual mailboxes gracefully", async () => {
    const client = buildClient({ INBOX: [], Sent: [500], Archive: [500] }, { failSearch: ["Sent"] });

    const result = await detectMailbox(client, 500, ALL_PATHS);

    expect(result).toBe("Archive");
  });

  it("accepts UID as a string", async () => {
    const client = buildClient({ INBOX: [42] });

    const result = await detectMailbox(client, "42", ALL_PATHS);

    expect(result).toBe("INBOX");
  });

  it("tries INBOX even when not in the provided paths list", async () => {
    const client = buildClient({ INBOX: [77] });

    const result = await detectMailbox(client, 77, ["Sent", "Archive"]);

    expect(result).toBe("INBOX");
  });
});
