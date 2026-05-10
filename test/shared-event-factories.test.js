import { describe, expect, it } from "bun:test";
import {
  fetchError,
  mailboxEmpty,
  mailboxLockFailed,
  mailboxMatches,
  mailboxStart,
  searchError,
  searchFailed,
} from "../src/shared-event-factories.js";

describe("mailboxStart", () => {
  it("has type mailbox-start", () => {
    expect(mailboxStart("INBOX", 50).type).toBe("mailbox-start");
  });

  it("has mailbox field", () => {
    expect(mailboxStart("INBOX", 50).mailbox).toBe("INBOX");
  });

  it("has count field", () => {
    expect(mailboxStart("INBOX", 50).count).toBe(50);
  });
});

describe("mailboxEmpty", () => {
  it("has type mailbox-empty", () => {
    expect(mailboxEmpty("Sent").type).toBe("mailbox-empty");
  });

  it("has mailbox field", () => {
    expect(mailboxEmpty("Sent").mailbox).toBe("Sent");
  });
});

describe("mailboxMatches", () => {
  it("has type mailbox-matches", () => {
    expect(mailboxMatches("INBOX", 3).type).toBe("mailbox-matches");
  });

  it("has mailbox field", () => {
    expect(mailboxMatches("INBOX", 3).mailbox).toBe("INBOX");
  });

  it("has count field", () => {
    expect(mailboxMatches("INBOX", 3).count).toBe(3);
  });
});

describe("mailboxLockFailed", () => {
  const err = new Error("lock timeout");

  it("has type mailbox-lock-failed", () => {
    expect(mailboxLockFailed(err, "INBOX").type).toBe("mailbox-lock-failed");
  });

  it("has error severity", () => {
    expect(mailboxLockFailed(err, "INBOX").severity).toBe("error");
  });

  it("has error field", () => {
    expect(mailboxLockFailed(err, "INBOX").error).toBe(err);
  });

  it("has mailbox field", () => {
    expect(mailboxLockFailed(err, "INBOX").mailbox).toBe("INBOX");
  });
});

describe("searchFailed", () => {
  const err = new Error("connection reset");

  it("has type search-failed", () => {
    expect(searchFailed(err, "Sent").type).toBe("search-failed");
  });

  it("has warning severity", () => {
    expect(searchFailed(err, "Sent").severity).toBe("warning");
  });

  it("has error field", () => {
    expect(searchFailed(err, "Sent").error).toBe(err);
  });

  it("has mailbox field", () => {
    expect(searchFailed(err, "Sent").mailbox).toBe("Sent");
  });
});

describe("searchError", () => {
  const err = new Error("bad search term");

  it("has type search-error", () => {
    expect(searchError(err, "invoice").type).toBe("search-error");
  });

  it("has warning severity", () => {
    expect(searchError(err, "invoice").severity).toBe("warning");
  });

  it("has error field", () => {
    expect(searchError(err, "invoice").error).toBe(err);
  });

  it("has term field", () => {
    expect(searchError(err, "invoice").term).toBe("invoice");
  });
});

describe("fetchError", () => {
  const err = new Error("fetch timeout");

  it("has type fetch-error", () => {
    expect(fetchError(err).type).toBe("fetch-error");
  });

  it("has warning severity", () => {
    expect(fetchError(err).severity).toBe("warning");
  });

  it("has error field", () => {
    expect(fetchError(err).error).toBe(err);
  });
});
