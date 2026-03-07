import { describe, it, expect } from "bun:test";
import { parseUidArgs, groupUidsByAccount } from "../src/move-logic.js";

describe("parseUidArgs", () => {
  it("parses plain UIDs using the default account", () => {
    const result = parseUidArgs(["123", "456"], "icloud");

    expect(result).toEqual([
      { account: "icloud", uid: "123" },
      { account: "icloud", uid: "456" },
    ]);
  });

  it("parses account-prefixed UIDs", () => {
    const result = parseUidArgs(["icloud:123", "gmail:456"], null);

    expect(result).toEqual([
      { account: "icloud", uid: "123" },
      { account: "gmail", uid: "456" },
    ]);
  });

  it("expands comma-separated values within a single arg", () => {
    const result = parseUidArgs(["icloud:1,icloud:2,icloud:3"], null);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ account: "icloud", uid: "1" });
    expect(result[1]).toEqual({ account: "icloud", uid: "2" });
    expect(result[2]).toEqual({ account: "icloud", uid: "3" });
  });

  it("throws when a UID has no prefix and no default account", () => {
    expect(() => parseUidArgs(["123"], null)).toThrow(
      'UID "123" has no account prefix'
    );
  });

  it("handles mixed prefixed and unprefixed UIDs when default account is set", () => {
    const result = parseUidArgs(["icloud:100", "200"], "gmail");

    expect(result).toEqual([
      { account: "icloud", uid: "100" },
      { account: "gmail", uid: "200" },
    ]);
  });

  it("filters empty strings produced by splitting", () => {
    const result = parseUidArgs(["icloud:1,,icloud:2"], null);

    expect(result).toHaveLength(2);
  });

  it("does not treat an all-digit prefix as an account name", () => {
    // "12345:6789" — the part before : is all digits, so no account prefix
    expect(() => parseUidArgs(["12345:6789"], null)).toThrow(
      'UID "12345:6789" has no account prefix'
    );
  });

  it("returns an empty array for empty input", () => {
    expect(parseUidArgs([], "icloud")).toEqual([]);
  });
});

describe("groupUidsByAccount", () => {
  it("groups UIDs by lowercase account name", () => {
    const parsed = [
      { account: "iCloud", uid: "1" },
      { account: "iCloud", uid: "2" },
      { account: "Gmail", uid: "3" },
    ];

    const result = groupUidsByAccount(parsed);

    expect(result.get("icloud")).toEqual(["1", "2"]);
    expect(result.get("gmail")).toEqual(["3"]);
  });

  it("handles a single account", () => {
    const result = groupUidsByAccount([{ account: "icloud", uid: "42" }]);

    expect(result.size).toBe(1);
    expect(result.get("icloud")).toEqual(["42"]);
  });

  it("returns an empty Map for empty input", () => {
    const result = groupUidsByAccount([]);

    expect(result.size).toBe(0);
  });
});
