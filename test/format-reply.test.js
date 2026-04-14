import { describe, expect, it } from "bun:test";
import { formatReplyDryRunText, formatReplySentText } from "../src/format-reply.js";

const baseMessage = {
  from: "me@example.com",
  to: "them@example.com",
  subject: "Re: Hello",
  text: "Thank you for your message.",
  inReplyTo: "<original-id@example.com>",
  references: "<original-id@example.com>",
};

// ── formatReplyDryRunText ─────────────────────────────────────────────────────

describe("formatReplyDryRunText", () => {
  it("shows the dry run header", () => {
    const text = formatReplyDryRunText(baseMessage);

    expect(text).toContain("--- Dry Run: Composed Reply ---");
  });

  it("shows the From address", () => {
    const text = formatReplyDryRunText(baseMessage);

    expect(text).toContain("From: me@example.com");
  });

  it("shows the To address", () => {
    const text = formatReplyDryRunText(baseMessage);

    expect(text).toContain("To: them@example.com");
  });

  it("shows the Subject", () => {
    const text = formatReplyDryRunText(baseMessage);

    expect(text).toContain("Subject: Re: Hello");
  });

  it("shows In-Reply-To header", () => {
    const text = formatReplyDryRunText(baseMessage);

    expect(text).toContain("In-Reply-To: <original-id@example.com>");
  });

  it("shows References header", () => {
    const text = formatReplyDryRunText(baseMessage);

    expect(text).toContain("References: <original-id@example.com>");
  });

  it("shows the message body text", () => {
    const text = formatReplyDryRunText(baseMessage);

    expect(text).toContain("Thank you for your message.");
  });

  it("shows CC when present", () => {
    const withCc = { ...baseMessage, cc: "cc@example.com" };
    const text = formatReplyDryRunText(withCc);

    expect(text).toContain("CC: cc@example.com");
  });

  it("omits CC line when cc is undefined", () => {
    const text = formatReplyDryRunText(baseMessage);

    expect(text).not.toContain("CC:");
  });
});

// ── formatReplySentText ───────────────────────────────────────────────────────

describe("formatReplySentText", () => {
  const sentResult = {
    sent: true,
    messageId: "<sent-id@example.com>",
    accepted: ["them@example.com"],
    message: baseMessage,
  };

  it("shows the recipient address", () => {
    const text = formatReplySentText(sentResult);

    expect(text).toContain("them@example.com");
  });

  it("shows the message ID", () => {
    const text = formatReplySentText(sentResult);

    expect(text).toContain("<sent-id@example.com>");
  });
});
