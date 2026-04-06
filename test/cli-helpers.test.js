import { describe, expect, it } from "bun:test";
import {
  collectValues,
  filterAccountsByName,
  headerValueToString,
  resolveAccounts,
  resolveCommandContext,
  sanitizeString,
} from "../src/cli-helpers.js";

// ── sanitizeString ────────────────────────────────────────────────────────────

describe("sanitizeString", () => {
  it("returns the string unchanged when it contains no control chars", () => {
    expect(sanitizeString("hello world")).toBe("hello world");
  });

  it("strips control characters (0x00–0x08)", () => {
    expect(sanitizeString("a\x01b\x07c")).toBe("abc");
  });

  it("preserves newlines (\\n)", () => {
    expect(sanitizeString("line1\nline2")).toBe("line1\nline2");
  });

  it("preserves horizontal tabs (\\t)", () => {
    expect(sanitizeString("col1\tcol2")).toBe("col1\tcol2");
  });

  it("strips vertical tab (0x0b) and form feed (0x0c)", () => {
    expect(sanitizeString("a\x0bb\x0cc")).toBe("abc");
  });

  describe("passes through non-string values unchanged", () => {
    it("passes through number 42", () => {
      expect(sanitizeString(42)).toBe(42);
    });

    it("passes through null", () => {
      expect(sanitizeString(null)).toBe(null);
    });
  });
});

// ── headerValueToString ───────────────────────────────────────────────────────

describe("headerValueToString", () => {
  it("returns a string value unchanged", () => {
    expect(headerValueToString("Subject: Hello")).toBe("Subject: Hello");
  });

  it("converts a Date to ISO 8601 string", () => {
    const d = new Date("2025-03-07T12:00:00.000Z");
    expect(headerValueToString(d)).toBe("2025-03-07T12:00:00.000Z");
  });

  it("returns value.text when present", () => {
    expect(headerValueToString({ text: "From display" })).toBe("From display");
  });

  it("returns value.value when .text not present", () => {
    expect(headerValueToString({ value: "header-value" })).toBe("header-value");
  });

  it("recursively maps array elements and flattens", () => {
    const arr = ["one", "two", "three"];
    expect(headerValueToString(arr)).toEqual(["one", "two", "three"]);
  });

  it("falls back to String() for plain objects with no recognised shape", () => {
    expect(typeof headerValueToString({ foo: "bar" })).toBe("string");
  });
});

// ── collectValues ─────────────────────────────────────────────────────────────

describe("collectValues", () => {
  it("splits a single comma-separated value into multiple items", () => {
    expect(collectValues("a,b,c", [])).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace around each item", () => {
    expect(collectValues("foo , bar , baz", [])).toEqual(["foo", "bar", "baz"]);
  });

  it("appends to the previous accumulator", () => {
    expect(collectValues("c,d", ["a", "b"])).toEqual(["a", "b", "c", "d"]);
  });

  it("ignores empty items from trailing commas", () => {
    expect(collectValues("a,,b,", [])).toEqual(["a", "b"]);
  });

  it("handles a single non-comma value", () => {
    expect(collectValues("INBOX", [])).toEqual(["INBOX"]);
  });
});

// ── filterAccountsByName ───────────────────────────────────────────────────────

describe("filterAccountsByName", () => {
  const accounts = [{ name: "iCloud" }, { name: "Gmail" }, { name: "Work" }];

  it("returns all accounts when name is null", () => {
    expect(filterAccountsByName(accounts, null)).toEqual(accounts);
  });

  it("returns all accounts when name is undefined", () => {
    expect(filterAccountsByName(accounts, undefined)).toEqual(accounts);
  });

  describe("filters case-insensitively", () => {
    const result = filterAccountsByName(accounts, "icloud");

    it("returns one result", () => {
      expect(result).toHaveLength(1);
    });

    it("returns the correctly-cased account name", () => {
      expect(result[0].name).toBe("iCloud");
    });
  });

  describe("matches mixed-case input to mixed-case stored name", () => {
    const result = filterAccountsByName(accounts, "GMAIL");

    it("returns one result", () => {
      expect(result).toHaveLength(1);
    });

    it("returns the correctly-cased account name", () => {
      expect(result[0].name).toBe("Gmail");
    });
  });

  it("returns an empty array when no account matches", () => {
    expect(filterAccountsByName(accounts, "nonexistent")).toEqual([]);
  });
});

// ── resolveAccounts ────────────────────────────────────────────────────────────

describe("resolveAccounts", () => {
  const allAccounts = [{ name: "iCloud" }, { name: "Gmail" }];
  const loadAll = () => allAccounts;
  const loadNone = () => [];

  it("returns all accounts when accountFilter is null", () => {
    expect(resolveAccounts(null, loadAll)).toEqual(allAccounts);
  });

  describe("filters to the matching account when a name is given", () => {
    const result = resolveAccounts("iCloud", loadAll);

    it("returns one result", () => {
      expect(result).toHaveLength(1);
    });

    it("returns the matching account", () => {
      expect(result[0].name).toBe("iCloud");
    });
  });

  it("throws when no accounts are configured", () => {
    expect(() => resolveAccounts(null, loadNone)).toThrow(
      "No accounts configured. Check keychain credentials and bin/run wrapper.",
    );
  });

  it("throws when the account filter matches no configured account", () => {
    expect(() => resolveAccounts("NoSuchAccount", loadAll)).toThrow('Account "NoSuchAccount" not found.');
  });
});

// ── resolveCommandContext ──────────────────────────────────────────────────────

describe("resolveCommandContext", () => {
  const allAccounts = [{ name: "iCloud" }, { name: "Gmail" }];

  const deps = {
    resolveJson: (/** @type {any} */ opts) => !!opts.json,
    resolveAccount: (/** @type {any} */ opts) => opts.account,
    requireAccounts: () => allAccounts,
    filterAccountsByName,
  };

  it("returns all accounts when no account filter is specified", () => {
    const ctx = resolveCommandContext({ json: false, account: undefined }, deps);

    expect(ctx.targetAccounts).toEqual(allAccounts);
  });

  describe("filters to the matching account when account name is given", () => {
    const ctx = resolveCommandContext({ json: false, account: "iCloud" }, deps);

    it("returns one account", () => {
      expect(ctx.targetAccounts).toHaveLength(1);
    });

    it("returns the matching account", () => {
      expect(ctx.targetAccounts[0].name).toBe("iCloud");
    });
  });

  it("throws when the account name matches no configured account", () => {
    expect(() => resolveCommandContext({ json: false, account: "NoSuchAccount" }, deps)).toThrow(
      'Account "NoSuchAccount" not found.',
    );
  });

  it("resolves the json flag from opts", () => {
    const ctx = resolveCommandContext({ json: true, account: undefined }, deps);

    expect(ctx.json).toBe(true);
  });

  it("returns json false when --json is not set", () => {
    const ctx = resolveCommandContext({ json: false, account: undefined }, deps);

    expect(ctx.json).toBe(false);
  });
});
