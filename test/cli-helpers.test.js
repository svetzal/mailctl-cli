import { describe, expect, it, mock, spyOn } from "bun:test";
import {
  accountNotFoundMessage,
  collectValues,
  createProgressRenderer,
  createResolveAccount,
  createResolveJson,
  emitPlanHint,
  filterAccountsByName,
  formatOutput,
  headerValueToString,
  NO_ACCOUNTS_CONFIGURED_MESSAGE,
  resolveAccounts,
  resolveCommandContext,
  resolvePlanApply,
  sanitizeString,
  withErrorHandling,
} from "../src/cli-helpers.js";

// ── accountNotFoundMessage / NO_ACCOUNTS_CONFIGURED_MESSAGE ─────────────────────

describe("accountNotFoundMessage", () => {
  it("formats the account name into the standard not-found message", () => {
    expect(accountNotFoundMessage("Icloud")).toBe('Account "Icloud" not found.');
  });
});

describe("NO_ACCOUNTS_CONFIGURED_MESSAGE", () => {
  it("is the standard no-accounts-configured message", () => {
    expect(NO_ACCOUNTS_CONFIGURED_MESSAGE).toBe(
      "No accounts configured. Check ~/.config/mailctl/config.json and macOS Keychain.",
    );
  });
});

// ── resolvePlanApply ──────────────────────────────────────────────────────────

describe("resolvePlanApply", () => {
  it("defaults to preview: no --apply → dryRun true, returns false", () => {
    const opts = {};
    const applied = resolvePlanApply(opts);
    expect(applied).toBe(false);
    expect(opts.dryRun).toBe(true);
  });

  it("--apply executes: dryRun false, returns true", () => {
    const opts = { apply: true };
    const applied = resolvePlanApply(opts);
    expect(applied).toBe(true);
    expect(opts.dryRun).toBe(false);
  });

  it("explicit --dry-run forces preview even alongside --apply", () => {
    const opts = { apply: true, dryRun: true };
    const applied = resolvePlanApply(opts);
    expect(applied).toBe(false);
    expect(opts.dryRun).toBe(true);
  });
});

// ── emitPlanHint ──────────────────────────────────────────────────────────────

describe("emitPlanHint", () => {
  it("writes the re-run hint when previewing in human mode", () => {
    /** @type {string[]} */
    const written = [];
    emitPlanHint(false, false, (m) => written.push(m));
    expect(written).toHaveLength(1);
    expect(written[0]).toContain("--apply");
  });

  it("stays silent when the command applied", () => {
    /** @type {string[]} */
    const written = [];
    emitPlanHint(true, false, (m) => written.push(m));
    expect(written).toHaveLength(0);
  });

  it("stays silent in JSON mode", () => {
    /** @type {string[]} */
    const written = [];
    emitPlanHint(false, true, (m) => written.push(m));
    expect(written).toHaveLength(0);
  });
});

// ── createResolveJson ─────────────────────────────────────────────────────────

describe("createResolveJson", () => {
  it("returns true when opts.json is true", () => {
    const resolveJson = createResolveJson(() => ({}));
    expect(resolveJson({ json: true })).toBe(true);
  });

  it("returns true when global opts.json is true", () => {
    const resolveJson = createResolveJson(() => ({ json: true }));
    expect(resolveJson({})).toBe(true);
  });

  it("returns false when neither opts.json nor global json is set", () => {
    const resolveJson = createResolveJson(() => ({}));
    expect(resolveJson({})).toBe(false);
  });

  it("local opts take precedence: true when opts.json is true even if global is false", () => {
    const resolveJson = createResolveJson(() => ({ json: false }));
    expect(resolveJson({ json: true })).toBe(true);
  });
});

// ── createResolveAccount ──────────────────────────────────────────────────────

describe("createResolveAccount", () => {
  it("returns opts.account when set", () => {
    const resolveAccount = createResolveAccount(() => ({}));
    expect(resolveAccount({ account: "iCloud" })).toBe("iCloud");
  });

  it("returns global opts.account when local opts.account is not set", () => {
    const resolveAccount = createResolveAccount(() => ({ account: "Gmail" }));
    expect(resolveAccount({})).toBe("Gmail");
  });

  it("returns undefined when neither is set", () => {
    const resolveAccount = createResolveAccount(() => ({}));
    expect(resolveAccount({})).toBeUndefined();
  });

  it("local opts take precedence over global", () => {
    const resolveAccount = createResolveAccount(() => ({ account: "Gmail" }));
    expect(resolveAccount({ account: "iCloud" })).toBe("iCloud");
  });
});

// ── withErrorHandling ─────────────────────────────────────────────────────────

describe("withErrorHandling", () => {
  it("returns a function", () => {
    const wrapped = withErrorHandling(
      async () => {},
      () => false,
    );
    expect(typeof wrapped).toBe("function");
  });

  it("calls the wrapped function with all arguments", async () => {
    const inner = mock(async () => {});
    const wrapped = withErrorHandling(inner, () => false);
    await wrapped("a", "b");
    expect(inner).toHaveBeenCalledWith("a", "b");
  });

  it("outputs JSON error when resolveJsonFn returns true", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    const wrapped = withErrorHandling(
      async () => {
        throw new Error("boom");
      },
      () => true,
      () => {},
    );
    await wrapped({});
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ error: "boom" }));
    logSpy.mockRestore();
  });

  it("outputs text error when resolveJsonFn returns false", async () => {
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    const wrapped = withErrorHandling(
      async () => {
        throw new Error("boom");
      },
      () => false,
      () => {},
    );
    await wrapped({});
    expect(errSpy).toHaveBeenCalledWith("Error: boom");
    errSpy.mockRestore();
  });

  it("sets the failure exit code via the injected setter on error", async () => {
    spyOn(console, "error").mockImplementation(() => {});
    const setExitCode = mock(() => {});
    const wrapped = withErrorHandling(
      async () => {
        throw new Error("boom");
      },
      () => false,
      setExitCode,
    );
    await wrapped({});
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it("includes error code in JSON output when err.code is set", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    const wrapped = withErrorHandling(
      async () => {
        const err = new Error("timed out");
        /** @type {any} */ (err).code = "ETIMEDOUT";
        throw err;
      },
      () => true,
      () => {},
    );
    await wrapped({});
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ error: "timed out", code: "ETIMEDOUT" }));
    logSpy.mockRestore();
  });

  it("omits code field from JSON output when err.code is absent", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    const wrapped = withErrorHandling(
      async () => {
        throw new Error("plain error");
      },
      () => true,
      () => {},
    );
    await wrapped({});
    const parsed = JSON.parse(/** @type {string} */ (logSpy.mock.calls[0][0]));
    expect(parsed).not.toHaveProperty("code");
    logSpy.mockRestore();
  });

  it("emits code in JSON when error has both cause and code (as from rethrowWithPrefix)", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    const original = new Error("connection refused");
    /** @type {any} */ (original).code = "ETIMEDOUT";
    const wrapped = withErrorHandling(
      async () => {
        const err = new Error(`Scan failed: ${original.message}`, { cause: original });
        /** @type {any} */ (err).code = /** @type {any} */ (original).code;
        throw err;
      },
      () => true,
      () => {},
    );
    await wrapped({});
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ error: "Scan failed: connection refused", code: "ETIMEDOUT" }),
    );
    logSpy.mockRestore();
  });

  it("calls debug logger with the error when DEBUG=mailctl is set", async () => {
    const originalDebug = process.env.DEBUG;
    process.env.DEBUG = "mailctl";
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    const thrownErr = new Error("debug me");
    const wrapped = withErrorHandling(
      async () => {
        throw thrownErr;
      },
      () => false,
      () => {},
    );
    await wrapped({});
    const calls = errSpy.mock.calls;
    const debugCall = calls.find((c) => typeof c[0] === "string" && c[0].includes("[mailctl:cli]"));
    expect(debugCall).toBeDefined();
    expect(debugCall?.[1]).toBe(thrownErr);
    process.env.DEBUG = originalDebug;
    errSpy.mockRestore();
  });

  it("calls the injected setter with the failure exit code when the action resolves a result with failures", async () => {
    const setExitCode = mock(() => {});
    const wrapped = withErrorHandling(
      async () => ({ stats: { failed: 1 } }),
      () => false,
      setExitCode,
    );
    await wrapped({});
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it("never calls the injected setter when the action resolves a result without failures", async () => {
    const setExitCode = mock(() => {});
    const wrapped = withErrorHandling(
      async () => ({ stats: { failed: 0 } }),
      () => false,
      setExitCode,
    );
    await wrapped({});
    expect(setExitCode).not.toHaveBeenCalled();
  });

  it("never calls the injected setter when the action resolves undefined", async () => {
    const setExitCode = mock(() => {});
    const wrapped = withErrorHandling(
      async () => undefined,
      () => false,
      setExitCode,
    );
    await wrapped({});
    expect(setExitCode).not.toHaveBeenCalled();
  });
});

// ── createProgressRenderer ────────────────────────────────────────────────────

describe("createProgressRenderer", () => {
  it("returns a function", () => {
    const renderer = createProgressRenderer(() => null);
    expect(typeof renderer).toBe("function");
  });

  it("calls the render function with the event", () => {
    const renderFn = mock(() => null);
    const renderer = createProgressRenderer(renderFn);
    const event = { type: "progress" };
    renderer(event);
    expect(renderFn).toHaveBeenCalledWith(event);
  });

  it("writes non-null render results to stderr", () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    const renderer = createProgressRenderer(() => "progress line");
    renderer({});
    expect(spy).toHaveBeenCalledWith("progress line");
    spy.mockRestore();
  });

  it("does not write to stderr when render function returns null", () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    const renderer = createProgressRenderer(() => null);
    renderer({});
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── formatOutput ─────────────────────────────────────────────────────────────

describe("formatOutput", () => {
  it("returns JSON.stringify(jsonData) when json is true", () => {
    const data = { count: 3, items: ["a", "b", "c"] };
    expect(formatOutput(true, data, "ignored text")).toBe(JSON.stringify(data));
  });

  it("returns textOutput when json is false", () => {
    expect(formatOutput(false, { count: 3 }, "3 items found")).toBe("3 items found");
  });

  it("handles complex nested objects in JSON mode", () => {
    const nested = { user: { id: 1, roles: ["admin", "user"] }, meta: { page: 1 } };
    expect(formatOutput(true, nested, "text")).toBe(JSON.stringify(nested));
  });
});

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
      "No accounts configured. Check ~/.config/mailctl/config.json and macOS Keychain.",
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
