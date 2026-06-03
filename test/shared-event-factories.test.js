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
  it("builds the mailbox-start event", () => {
    expect(mailboxStart("INBOX", 50)).toEqual({
      type: "mailbox-start",
      mailbox: "INBOX",
      count: 50,
    });
  });
});

describe("mailboxEmpty", () => {
  it("builds the mailbox-empty event", () => {
    expect(mailboxEmpty("Sent")).toEqual({
      type: "mailbox-empty",
      mailbox: "Sent",
    });
  });
});

describe("mailboxMatches", () => {
  it("builds the mailbox-matches event", () => {
    expect(mailboxMatches("INBOX", 3)).toEqual({
      type: "mailbox-matches",
      mailbox: "INBOX",
      count: 3,
    });
  });
});

describe("mailboxLockFailed", () => {
  it("builds the mailbox-lock-failed event", () => {
    const err = new Error("lock timeout");
    expect(mailboxLockFailed(err, "INBOX")).toEqual({
      type: "mailbox-lock-failed",
      severity: "error",
      error: err,
      mailbox: "INBOX",
    });
  });
});

describe("searchFailed", () => {
  it("builds the search-failed event", () => {
    const err = new Error("connection reset");
    expect(searchFailed(err, "Sent")).toEqual({
      type: "search-failed",
      severity: "warning",
      error: err,
      mailbox: "Sent",
    });
  });
});

describe("searchError", () => {
  it("builds the search-error event", () => {
    const err = new Error("bad search term");
    expect(searchError(err, "invoice")).toEqual({
      type: "search-error",
      severity: "warning",
      error: err,
      term: "invoice",
    });
  });
});

describe("fetchError", () => {
  it("builds the fetch-error event", () => {
    const err = new Error("fetch timeout");
    expect(fetchError(err)).toEqual({
      type: "fetch-error",
      severity: "warning",
      error: err,
    });
  });
});
