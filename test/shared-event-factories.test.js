import { describe, expect, it } from "bun:test";
import { mailboxEmpty, mailboxMatches, mailboxStart } from "../src/shared-event-factories.js";

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
