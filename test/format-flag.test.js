import { describe, expect, it } from "bun:test";
import { buildFlagResultJson, formatFlagResultText } from "../src/format-flag.js";

// ── formatFlagResultText ──────────────────────────────────────────────────────

describe("formatFlagResultText", () => {
  it("uses singular 'UID' label for a single UID", () => {
    const result = formatFlagResultText([
      { dryRun: false, uids: [42], added: ["\\Seen"], removed: [], account: "iCloud", mailbox: "INBOX" },
    ]);

    expect(result).toContain("UID 42");
  });

  it("uses plural 'UIDs' label for multiple UIDs", () => {
    const result = formatFlagResultText([
      { dryRun: false, uids: [42, 43], added: ["\\Seen"], removed: [], account: "iCloud", mailbox: "INBOX" },
    ]);

    expect(result).toContain("UIDs 42,43");
  });

  it("shows [DRY RUN] prefix when dryRun is true", () => {
    const result = formatFlagResultText([
      { dryRun: true, uids: [42], added: ["\\Seen"], removed: [], account: "iCloud", mailbox: "INBOX" },
    ]);

    expect(result).toContain("[DRY RUN]");
  });

  it("shows 'Flagged' prefix when not a dry run", () => {
    const result = formatFlagResultText([
      { dryRun: false, uids: [42], added: ["\\Seen"], removed: [], account: "iCloud", mailbox: "INBOX" },
    ]);

    expect(result).toContain("Flagged");
  });

  it("shows added flags with + prefix", () => {
    const result = formatFlagResultText([
      { dryRun: false, uids: [42], added: ["\\Seen"], removed: [], account: "iCloud", mailbox: "INBOX" },
    ]);

    expect(result).toContain("+\\Seen");
  });

  it("shows removed flags with - prefix", () => {
    const result = formatFlagResultText([
      { dryRun: false, uids: [42], added: [], removed: ["\\Seen"], account: "iCloud", mailbox: "INBOX" },
    ]);

    expect(result).toContain("-\\Seen");
  });

  it("produces multiple lines for multiple results", () => {
    const result = formatFlagResultText([
      { dryRun: false, uids: [42], added: ["\\Seen"], removed: [], account: "iCloud", mailbox: "INBOX" },
      { dryRun: false, uids: [99], added: ["\\Flagged"], removed: [], account: "Gmail", mailbox: "INBOX" },
    ]);

    expect(result).toContain("\n");
  });
});

// ── buildFlagResultJson ────────────────────────────────────────────────────────

describe("buildFlagResultJson", () => {
  it("omits dryRun field for live results", () => {
    const result = buildFlagResultJson([
      { dryRun: false, uids: [42], added: ["\\Seen"], removed: [], account: "iCloud", mailbox: "INBOX" },
    ]);

    expect(result[0]).not.toHaveProperty("dryRun");
  });

  it("includes dryRun: true for dry-run results", () => {
    const result = buildFlagResultJson([
      { dryRun: true, uids: [42], added: ["\\Seen"], removed: [], account: "iCloud", mailbox: "INBOX" },
    ]);

    expect(result[0].dryRun).toBe(true);
  });

  it("preserves other fields", () => {
    const result = buildFlagResultJson([
      { dryRun: false, uids: [42], added: ["\\Seen"], removed: [], account: "iCloud", mailbox: "INBOX" },
    ]);

    expect(result[0].uids).toEqual([42]);
  });

  it("returns one object per result", () => {
    const result = buildFlagResultJson([
      { dryRun: false, uids: [42], added: [], removed: [], account: "iCloud", mailbox: "INBOX" },
      { dryRun: false, uids: [99], added: [], removed: [], account: "Gmail", mailbox: "INBOX" },
    ]);

    expect(result).toHaveLength(2);
  });
});
