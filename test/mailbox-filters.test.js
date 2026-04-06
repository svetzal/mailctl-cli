import { describe, expect, it } from "bun:test";
import { filterScanMailboxes, filterSearchMailboxes } from "../src/mailbox-filters.js";

/** Build a minimal mailbox descriptor. */
function mb(path, specialUse = null) {
  return { path, specialUse };
}

describe("filterScanMailboxes", () => {
  it("includes a plain inbox", () => {
    const result = filterScanMailboxes([mb("INBOX")]);
    expect(result).toContain("INBOX");
  });

  it("excludes Junk by special-use flag", () => {
    const result = filterScanMailboxes([mb("Junk", "\\Junk")]);
    expect(result).not.toContain("Junk");
  });

  it("excludes Trash by special-use flag", () => {
    const result = filterScanMailboxes([mb("Trash", "\\Trash")]);
    expect(result).not.toContain("Trash");
  });

  it("excludes Drafts by special-use flag", () => {
    const result = filterScanMailboxes([mb("Drafts", "\\Drafts")]);
    expect(result).not.toContain("Drafts");
  });

  it("includes Sent by default", () => {
    const result = filterScanMailboxes([mb("Sent", "\\Sent")]);
    expect(result).toContain("Sent");
  });

  it("excludes Sent when excludeSent option is true", () => {
    const result = filterScanMailboxes([mb("Sent", "\\Sent")], { excludeSent: true });
    expect(result).not.toContain("Sent");
  });

  it("excludes Apple Mail internal folders beginning with underscore", () => {
    const result = filterScanMailboxes([mb("_Hidden")]);
    expect(result).not.toContain("_Hidden");
  });

  it("excludes Notes mailbox", () => {
    const result = filterScanMailboxes([mb("Notes")]);
    expect(result).not.toContain("Notes");
  });

  describe("excludes paths starting with an excludePaths prefix", () => {
    const result = filterScanMailboxes([mb("Receipts/Business"), mb("INBOX")], { excludePaths: ["Receipts/"] });

    it("excludes Receipts/Business", () => {
      expect(result).not.toContain("Receipts/Business");
    });

    it("keeps INBOX", () => {
      expect(result).toContain("INBOX");
    });
  });

  it("returns only the path strings", () => {
    const result = filterScanMailboxes([mb("INBOX"), mb("Archive")]);
    expect(result).toEqual(["INBOX", "Archive"]);
  });
});

describe("filterSearchMailboxes", () => {
  it("includes a plain inbox", () => {
    const result = filterSearchMailboxes([mb("INBOX")]);
    expect(result).toContain("INBOX");
  });

  it("excludes Junk by special-use flag", () => {
    const result = filterSearchMailboxes([mb("Junk", "\\Junk")]);
    expect(result).not.toContain("Junk");
  });

  it("excludes Drafts by special-use flag", () => {
    const result = filterSearchMailboxes([mb("Drafts", "\\Drafts")]);
    expect(result).not.toContain("Drafts");
  });

  it("includes Trash (less restrictive than scan)", () => {
    const result = filterSearchMailboxes([mb("Trash", "\\Trash")]);
    expect(result).toContain("Trash");
  });

  it("includes Sent (less restrictive than scan)", () => {
    const result = filterSearchMailboxes([mb("Sent", "\\Sent")]);
    expect(result).toContain("Sent");
  });

  it("excludes Apple Mail internal folders beginning with underscore", () => {
    const result = filterSearchMailboxes([mb("_Hidden")]);
    expect(result).not.toContain("_Hidden");
  });

  it("excludes Notes mailbox", () => {
    const result = filterSearchMailboxes([mb("Notes")]);
    expect(result).not.toContain("Notes");
  });

  describe("excludes exact path match in excludePaths", () => {
    const result = filterSearchMailboxes([mb("Trash", "\\Trash"), mb("INBOX")], { excludePaths: ["Trash"] });

    it("excludes Trash", () => {
      expect(result).not.toContain("Trash");
    });

    it("keeps INBOX", () => {
      expect(result).toContain("INBOX");
    });
  });

  describe("excludes sub-paths of an excludePaths entry", () => {
    const result = filterSearchMailboxes([mb("Archive/2024"), mb("INBOX")], { excludePaths: ["Archive"] });

    it("excludes Archive/2024", () => {
      expect(result).not.toContain("Archive/2024");
    });

    it("keeps INBOX", () => {
      expect(result).toContain("INBOX");
    });
  });

  it("does not exclude a path that merely starts with an excludePaths entry without a slash separator", () => {
    // "Arch" should not exclude "Archive" — only exact match or slash-separated sub-path
    const result = filterSearchMailboxes([mb("Archive"), mb("INBOX")], { excludePaths: ["Arch"] });
    expect(result).toContain("Archive");
  });

  it("returns only the path strings", () => {
    const result = filterSearchMailboxes([mb("INBOX"), mb("Archive")]);
    expect(result).toEqual(["INBOX", "Archive"]);
  });
});
