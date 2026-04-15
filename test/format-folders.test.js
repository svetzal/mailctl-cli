import { describe, expect, it } from "bun:test";
import { buildFoldersJson, formatFoldersText } from "../src/format-folders.js";

// ── formatFoldersText ─────────────────────────────────────────────────────────

describe("formatFoldersText", () => {
  const singleAccount = [
    {
      account: "iCloud",
      folders: [
        { path: "INBOX", specialUse: null },
        { path: "Sent Messages", specialUse: "\\Sent" },
      ],
    },
  ];

  it("shows the account header", () => {
    const text = formatFoldersText(singleAccount);

    expect(text).toContain("=== iCloud ===");
  });

  it("shows the folder path with indentation", () => {
    const text = formatFoldersText(singleAccount);

    expect(text).toContain("  INBOX");
  });

  it("shows specialUse suffix when present", () => {
    const text = formatFoldersText(singleAccount);

    expect(text).toContain("Sent Messages (\\Sent)");
  });

  it("omits specialUse suffix when null", () => {
    const text = formatFoldersText(singleAccount);

    expect(text).toContain("  INBOX\n");
  });

  it("shows headers for multiple accounts", () => {
    const multiAccount = [
      { account: "iCloud", folders: [{ path: "INBOX", specialUse: null }] },
      { account: "Gmail", folders: [{ path: "INBOX", specialUse: null }] },
    ];
    const text = formatFoldersText(multiAccount);

    expect(text).toContain("=== Gmail ===");
  });

  it("returns empty string for empty input array", () => {
    const text = formatFoldersText([]);

    expect(text).toBe("");
  });
});

// ── buildFoldersJson ──────────────────────────────────────────────────────────

describe("buildFoldersJson", () => {
  const input = [
    {
      account: "iCloud",
      folders: [
        { path: "INBOX", specialUse: null },
        { path: "Sent Messages", specialUse: "\\Sent" },
      ],
    },
    {
      account: "Gmail",
      folders: [{ path: "INBOX", specialUse: null }],
    },
  ];

  it("flattens folders from all accounts", () => {
    const result = buildFoldersJson(input);

    expect(result).toHaveLength(3);
  });

  it("tags each folder with its account name", () => {
    const result = buildFoldersJson(input);

    expect(result[0].account).toBe("iCloud");
  });

  it("includes the folder path", () => {
    const result = buildFoldersJson(input);

    expect(result[0].path).toBe("INBOX");
  });

  it("includes specialUse attribute", () => {
    const result = buildFoldersJson(input);

    expect(result[1].specialUse).toBe("\\Sent");
  });

  it("returns an empty array for empty input", () => {
    const result = buildFoldersJson([]);

    expect(result).toEqual([]);
  });
});
