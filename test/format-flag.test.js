import { describe, expect, it } from "bun:test";
import { buildFlagResultJson, formatFlagResultText } from "../src/format-flag.js";

function makeStats(overrides = {}) {
  return { flagged: 1, failed: 0, skipped: 0, ...overrides };
}

// ── formatFlagResultText ──────────────────────────────────────────────────────

describe("formatFlagResultText", () => {
  it("uses singular 'UID' label for a single UID", () => {
    const result = formatFlagResultText(makeStats(), [
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
    const result = formatFlagResultText(makeStats(), [
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
    const result = formatFlagResultText(makeStats({ flagged: 0, skipped: 1 }), [
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
    const result = formatFlagResultText(makeStats(), [
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
    const result = formatFlagResultText(makeStats(), [
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
    const result = formatFlagResultText(makeStats(), [
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
    const result = formatFlagResultText(makeStats({ flagged: 2 }), [
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
    const result = formatFlagResultText(makeStats({ flagged: 0, failed: 1 }), [
      { status: "failed", account: "test", uids: [42], error: 'Account "test" not found.' },
    ]);

    expect(result).toContain("Error (test):");
  });

  it("includes summary line with counts", () => {
    const result = formatFlagResultText(makeStats({ flagged: 2, failed: 1 }), [
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

// ── buildFlagResultJson ────────────────────────────────────────────────────────

describe("buildFlagResultJson", () => {
  it("includes flagged count in output", () => {
    const result = buildFlagResultJson(makeStats({ flagged: 2 }), [
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
    const result = buildFlagResultJson(makeStats({ failed: 1 }), []);

    expect(result.failed).toBe(1);
  });

  it("includes results array", () => {
    const result = buildFlagResultJson(makeStats(), [
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
    const result = buildFlagResultJson(makeStats(), [
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
    const result = buildFlagResultJson(makeStats({ flagged: 0, failed: 1 }), [
      { status: "failed", account: "test", uids: [42], error: "Account not found" },
    ]);

    expect(result.results[0].status).toBe("failed");
  });

  it("returns one results entry per account group", () => {
    const result = buildFlagResultJson(makeStats({ flagged: 2 }), [
      { status: "flagged", dryRun: false, uids: [42], added: [], removed: [], account: "iCloud", mailbox: "INBOX" },
      { status: "flagged", dryRun: false, uids: [99], added: [], removed: [], account: "Gmail", mailbox: "INBOX" },
    ]);

    expect(result.results).toHaveLength(2);
  });
});
