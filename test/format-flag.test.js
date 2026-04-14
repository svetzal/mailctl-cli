import { describe, expect, it } from "bun:test";
import { formatFlagResultText } from "../src/format-flag.js";

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
