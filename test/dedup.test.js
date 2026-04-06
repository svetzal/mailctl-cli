import { describe, expect, it } from "bun:test";
import { deduplicateByMessageId } from "../src/dedup.js";

/** @param {Partial<{messageId: string, account: string, mailbox: string, uid: string}>} fields */
function makeResult(fields = {}) {
  return {
    account: "icloud",
    mailbox: "INBOX",
    uid: "100",
    messageId: "",
    ...fields,
  };
}

describe("deduplicateByMessageId", () => {
  it("returns all items when there are no duplicates", () => {
    const results = [makeResult({ messageId: "a@example.com" }), makeResult({ messageId: "b@example.com" })];

    expect(deduplicateByMessageId(results)).toEqual(results);
  });

  describe("removes items with duplicate messageId", () => {
    const first = makeResult({ messageId: "same@example.com", uid: "1" });
    const duplicate = makeResult({ messageId: "same@example.com", uid: "2", mailbox: "All Mail" });
    const other = makeResult({ messageId: "other@example.com", uid: "3" });
    const result = deduplicateByMessageId([first, duplicate, other]);

    it("returns two items", () => {
      expect(result).toHaveLength(2);
    });

    it("first item is the original first result", () => {
      expect(result[0]).toBe(first);
    });

    it("second item is the non-duplicate other result", () => {
      expect(result[1]).toBe(other);
    });
  });

  it("keeps items with different messageIds", () => {
    const results = [
      makeResult({ messageId: "a@example.com" }),
      makeResult({ messageId: "b@example.com" }),
      makeResult({ messageId: "c@example.com" }),
    ];

    expect(deduplicateByMessageId(results)).toHaveLength(3);
  });

  describe("falls back to account:mailbox:uid key when messageId is falsy", () => {
    const first = makeResult({ messageId: "", account: "icloud", mailbox: "INBOX", uid: "42" });
    const duplicate = makeResult({ messageId: "", account: "icloud", mailbox: "INBOX", uid: "42" });
    const different = makeResult({ messageId: "", account: "gmail", mailbox: "INBOX", uid: "42" });
    const result = deduplicateByMessageId([first, duplicate, different]);

    it("returns two items", () => {
      expect(result).toHaveLength(2);
    });

    it("first item is the original first result", () => {
      expect(result[0]).toBe(first);
    });

    it("second item is the item with a different account", () => {
      expect(result[1]).toBe(different);
    });
  });

  it("preserves order — first occurrence wins", () => {
    const a = makeResult({ messageId: "x@example.com", uid: "1" });
    const b = makeResult({ messageId: "x@example.com", uid: "2" });

    const result = deduplicateByMessageId([a, b]);

    expect(result[0]).toBe(a);
  });

  it("handles an empty array", () => {
    expect(deduplicateByMessageId([])).toEqual([]);
  });

  it("treats undefined messageId as falsy and uses uid fallback", () => {
    // Build a result where messageId is explicitly undefined at runtime
    const r = /** @type {any} */ (makeResult({ uid: "55" }));
    r.messageId = undefined;

    const result = deduplicateByMessageId([r]);

    expect(result).toHaveLength(1);
  });
});
