import { describe, expect, it } from "bun:test";
import {
  buildFlagJson,
  buildReplyDryRunJson,
  buildReplySentJson,
  formatFlagText,
  formatMoveText,
  formatReplyDryRunText,
  formatReplyOutput,
  formatReplySentText,
} from "../src/format-mutation.js";

// ── format-move ───────────────────────────────────────────────────────────────

describe("formatMoveText", () => {
  describe("formats a single account move summary", () => {
    const text = formatMoveText({ moved: 3, failed: 0, skipped: 0 });

    it("shows moved count", () => {
      expect(text).toContain("3 moved");
    });

    it("shows failed count", () => {
      expect(text).toContain("0 failed");
    });

    it("shows skipped count", () => {
      expect(text).toContain("0 skipped");
    });
  });

  describe("formats a multi-account move summary with failures", () => {
    const text = formatMoveText({ moved: 5, failed: 2, skipped: 0 });

    it("shows moved count", () => {
      expect(text).toContain("5 moved");
    });

    it("shows failed count", () => {
      expect(text).toContain("2 failed");
    });
  });

  describe("formats a result with all messages skipped", () => {
    const text = formatMoveText({ moved: 0, failed: 0, skipped: 4 });

    it("shows moved count", () => {
      expect(text).toContain("0 moved");
    });

    it("shows skipped count", () => {
      expect(text).toContain("4 skipped");
    });
  });
});

// ── format-flag ───────────────────────────────────────────────────────────────

function makeStats(overrides = {}) {
  return { flagged: 1, failed: 0, skipped: 0, ...overrides };
}

describe("formatFlagText", () => {
  it("uses singular 'UID' label for a single UID", () => {
    const result = formatFlagText(makeStats(), [
      {
        status: "flagged",
        dryRun: false,
        uids: [42],
        added: ["\\Seen"],
        removed: [],
        account: "iCloud",
        mailbox: "INBOX",
      },
    ]);

    expect(result).toContain("UID 42");
  });

  it("uses plural 'UIDs' label for multiple UIDs", () => {
    const result = formatFlagText(makeStats(), [
      {
        status: "flagged",
        dryRun: false,
        uids: [42, 43],
        added: ["\\Seen"],
        removed: [],
        account: "iCloud",
        mailbox: "INBOX",
      },
    ]);

    expect(result).toContain("UIDs 42,43");
  });

  it("shows [DRY RUN] prefix when dryRun is true", () => {
    const result = formatFlagText(makeStats({ flagged: 0, skipped: 1 }), [
      {
        status: "skipped",
        dryRun: true,
        uids: [42],
        added: ["\\Seen"],
        removed: [],
        account: "iCloud",
        mailbox: "INBOX",
      },
    ]);

    expect(result).toContain("[DRY RUN]");
  });

  it("shows 'Flagged' prefix when not a dry run", () => {
    const result = formatFlagText(makeStats(), [
      {
        status: "flagged",
        dryRun: false,
        uids: [42],
        added: ["\\Seen"],
        removed: [],
        account: "iCloud",
        mailbox: "INBOX",
      },
    ]);

    expect(result).toContain("Flagged");
  });

  it("shows added flags with + prefix", () => {
    const result = formatFlagText(makeStats(), [
      {
        status: "flagged",
        dryRun: false,
        uids: [42],
        added: ["\\Seen"],
        removed: [],
        account: "iCloud",
        mailbox: "INBOX",
      },
    ]);

    expect(result).toContain("+\\Seen");
  });

  it("shows removed flags with - prefix", () => {
    const result = formatFlagText(makeStats(), [
      {
        status: "flagged",
        dryRun: false,
        uids: [42],
        added: [],
        removed: ["\\Seen"],
        account: "iCloud",
        mailbox: "INBOX",
      },
    ]);

    expect(result).toContain("-\\Seen");
  });

  it("produces multiple lines for multiple results", () => {
    const result = formatFlagText(makeStats({ flagged: 2 }), [
      {
        status: "flagged",
        dryRun: false,
        uids: [42],
        added: ["\\Seen"],
        removed: [],
        account: "iCloud",
        mailbox: "INBOX",
      },
      {
        status: "flagged",
        dryRun: false,
        uids: [99],
        added: ["\\Flagged"],
        removed: [],
        account: "Gmail",
        mailbox: "INBOX",
      },
    ]);

    expect(result).toContain("\n");
  });

  it("shows error line for failed results", () => {
    const result = formatFlagText(makeStats({ flagged: 0, failed: 1 }), [
      { status: "failed", account: "test", uids: [42], error: 'Account "test" not found.' },
    ]);

    expect(result).toContain("Error (test):");
  });

  it("includes summary line with counts", () => {
    const result = formatFlagText(makeStats({ flagged: 2, failed: 1 }), [
      {
        status: "flagged",
        dryRun: false,
        uids: [42],
        added: ["\\Seen"],
        removed: [],
        account: "iCloud",
        mailbox: "INBOX",
      },
      { status: "failed", account: "test", uids: [99], error: "Not found" },
    ]);

    expect(result).toContain("Summary:");
  });
});

describe("buildFlagJson", () => {
  it("includes flagged count in output", () => {
    const result = buildFlagJson(makeStats({ flagged: 2 }), [
      {
        status: "flagged",
        dryRun: false,
        uids: [42],
        added: ["\\Seen"],
        removed: [],
        account: "iCloud",
        mailbox: "INBOX",
      },
    ]);

    expect(result.flagged).toBe(2);
  });

  it("includes failed count in output", () => {
    const result = buildFlagJson(makeStats({ failed: 1 }), []);

    expect(result.failed).toBe(1);
  });

  it("includes results array", () => {
    const result = buildFlagJson(makeStats(), [
      {
        status: "flagged",
        dryRun: false,
        uids: [42],
        added: ["\\Seen"],
        removed: [],
        account: "iCloud",
        mailbox: "INBOX",
      },
    ]);

    expect(result.results).toHaveLength(1);
  });

  it("preserves per-item fields in results", () => {
    const result = buildFlagJson(makeStats(), [
      {
        status: "flagged",
        dryRun: false,
        uids: [42],
        added: ["\\Seen"],
        removed: [],
        account: "iCloud",
        mailbox: "INBOX",
      },
    ]);

    expect(result.results[0].uids).toEqual([42]);
  });

  it("includes failed result in results array", () => {
    const result = buildFlagJson(makeStats({ flagged: 0, failed: 1 }), [
      { status: "failed", account: "test", uids: [42], error: "Account not found" },
    ]);

    expect(result.results[0].status).toBe("failed");
  });

  it("returns one results entry per account group", () => {
    const result = buildFlagJson(makeStats({ flagged: 2 }), [
      { status: "flagged", dryRun: false, uids: [42], added: [], removed: [], account: "iCloud", mailbox: "INBOX" },
      { status: "flagged", dryRun: false, uids: [99], added: [], removed: [], account: "Gmail", mailbox: "INBOX" },
    ]);

    expect(result.results).toHaveLength(2);
  });
});

// ── format-reply ──────────────────────────────────────────────────────────────

const baseMessage = {
  from: "me@example.com",
  to: "them@example.com",
  subject: "Re: Hello",
  text: "Thank you for your message.",
  inReplyTo: "<original-id@example.com>",
  references: "<original-id@example.com>",
};

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

describe("buildReplyDryRunJson", () => {
  it("sets dryRun: true", () => {
    const result = buildReplyDryRunJson(baseMessage);

    expect(result.dryRun).toBe(true);
  });

  it("includes the message object", () => {
    const result = buildReplyDryRunJson(baseMessage);

    expect(result.message).toBe(baseMessage);
  });
});

describe("buildReplySentJson", () => {
  const sentResult = {
    sent: true,
    messageId: "<sent-id@example.com>",
    accepted: ["them@example.com"],
    message: baseMessage,
  };

  it("includes sent flag", () => {
    const result = buildReplySentJson(sentResult);

    expect(result.sent).toBe(true);
  });

  it("includes messageId", () => {
    const result = buildReplySentJson(sentResult);

    expect(result.messageId).toBe("<sent-id@example.com>");
  });

  it("includes accepted addresses", () => {
    const result = buildReplySentJson(sentResult);

    expect(result.accepted).toEqual(["them@example.com"]);
  });
});

describe("formatReplyOutput", () => {
  const dryRunResult = { dryRun: true, message: baseMessage };
  const sentResult = {
    sent: true,
    messageId: "<sent-id@example.com>",
    accepted: ["them@example.com"],
    message: baseMessage,
  };

  it("returns JSON for dry-run result in JSON mode", () => {
    const output = JSON.parse(formatReplyOutput(true, dryRunResult));
    expect(output.dryRun).toBe(true);
  });

  it("returns dry-run text in text mode", () => {
    const output = formatReplyOutput(false, dryRunResult);
    expect(output).toContain("--- Dry Run: Composed Reply ---");
  });

  it("returns JSON for sent result in JSON mode", () => {
    const output = JSON.parse(formatReplyOutput(true, sentResult));
    expect(output.sent).toBe(true);
  });

  it("returns sent text in text mode", () => {
    const output = formatReplyOutput(false, sentResult);
    expect(output).toContain("them@example.com");
  });
});
