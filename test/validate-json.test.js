import { describe, expect, it } from "bun:test";
import {
  optionalString,
  requireArray,
  requireNumber,
  requireObject,
  requireString,
  ValidationError,
  validateClassifications,
  validateConfig,
  validateImportEntries,
  validateSenders,
  validateSidecar,
} from "../src/validate-json.js";

// ── ValidationError ───────────────────────────────────────────────────────────

describe("ValidationError", () => {
  it("has code INVALID_INPUT", () => {
    const err = new ValidationError("bad input");
    expect(err.code).toBe("INVALID_INPUT");
  });

  it("has name ValidationError", () => {
    const err = new ValidationError("bad input");
    expect(err.name).toBe("ValidationError");
  });

  it("preserves the message", () => {
    const err = new ValidationError("something is wrong");
    expect(err.message).toBe("something is wrong");
  });
});

// ── requireObject ─────────────────────────────────────────────────────────────

describe("requireObject", () => {
  it("returns the value when it is a plain object", () => {
    const obj = { a: 1 };
    expect(requireObject(obj, "test")).toBe(obj);
  });

  it("throws ValidationError for null", () => {
    expect(() => requireObject(null, "test")).toThrow(ValidationError);
  });

  it("throws ValidationError for an array", () => {
    expect(() => requireObject([], "test")).toThrow(ValidationError);
  });

  it("throws ValidationError for a string", () => {
    expect(() => requireObject("hello", "test")).toThrow(ValidationError);
  });

  it("throws ValidationError for a number", () => {
    expect(() => requireObject(42, "test")).toThrow(ValidationError);
  });

  it("includes the label in the error message", () => {
    expect(() => requireObject(null, "config.json")).toThrow(/config\.json/);
  });
});

// ── requireString ─────────────────────────────────────────────────────────────

describe("requireString", () => {
  it("returns the string value when the field is a string", () => {
    expect(requireString({ name: "Alice" }, "name", "test.name")).toBe("Alice");
  });

  it("throws ValidationError when the field is missing", () => {
    expect(() => requireString({}, "name", "test.name")).toThrow(ValidationError);
  });

  it("throws ValidationError when the field is a number", () => {
    expect(() => requireString({ port: 993 }, "port", "test.port")).toThrow(ValidationError);
  });

  it("includes the label in the error message", () => {
    expect(() => requireString({}, "host", "config.json: accounts[0].host")).toThrow(
      /config\.json: accounts\[0\]\.host/,
    );
  });
});

// ── requireNumber ─────────────────────────────────────────────────────────────

describe("requireNumber", () => {
  it("returns the numeric value when the field is a number", () => {
    expect(requireNumber({ port: 993 }, "port", "test.port")).toBe(993);
  });

  it("throws ValidationError when the field is missing", () => {
    expect(() => requireNumber({}, "port", "test.port")).toThrow(ValidationError);
  });

  it("throws ValidationError when the field is a string", () => {
    expect(() => requireNumber({ port: "993" }, "port", "test.port")).toThrow(ValidationError);
  });

  it("includes the label in the error message", () => {
    expect(() => requireNumber({ port: "bad" }, "port", "config.json: accounts[0].port")).toThrow(
      /config\.json: accounts\[0\]\.port/,
    );
  });
});

// ── requireArray ──────────────────────────────────────────────────────────────

describe("requireArray", () => {
  it("returns the array when value is an array", () => {
    const arr = [1, 2, 3];
    expect(requireArray(arr, "test")).toBe(arr);
  });

  it("throws ValidationError for a plain object", () => {
    expect(() => requireArray({}, "test")).toThrow(ValidationError);
  });

  it("throws ValidationError for null", () => {
    expect(() => requireArray(null, "test")).toThrow(ValidationError);
  });

  it("throws ValidationError for a string", () => {
    expect(() => requireArray("nope", "test")).toThrow(ValidationError);
  });

  it("includes the label in the error message", () => {
    expect(() => requireArray(null, "senders.json")).toThrow(/senders\.json/);
  });
});

// ── optionalString ────────────────────────────────────────────────────────────

describe("optionalString", () => {
  it("returns undefined when the key is absent", () => {
    expect(optionalString({}, "host", "test.host")).toBeUndefined();
  });

  it("returns undefined when the value is null", () => {
    expect(optionalString({ host: null }, "host", "test.host")).toBeUndefined();
  });

  it("returns the string when the value is a string", () => {
    expect(optionalString({ host: "imap.example.com" }, "host", "test.host")).toBe("imap.example.com");
  });

  it("throws ValidationError when the value is a number", () => {
    expect(() => optionalString({ host: 42 }, "host", "test.host")).toThrow(ValidationError);
  });
});

// ── validateConfig ────────────────────────────────────────────────────────────

describe("validateConfig", () => {
  it("returns the config when it is a valid object with no accounts", () => {
    const cfg = { downloadDir: "~/receipts" };
    expect(validateConfig(cfg)).toBe(cfg);
  });

  it("returns the config when accounts is a valid array", () => {
    const cfg = { accounts: [{ prefix: "A", name: "Acct", host: "imap.example.com", port: 993 }] };
    expect(validateConfig(cfg)).toBe(cfg);
  });

  it("throws ValidationError when raw is null", () => {
    expect(() => validateConfig(null)).toThrow(ValidationError);
  });

  it("throws ValidationError when raw is a string", () => {
    expect(() => validateConfig("not an object")).toThrow(ValidationError);
  });

  it("throws ValidationError when accounts is not an array", () => {
    expect(() => validateConfig({ accounts: "oops" })).toThrow(ValidationError);
  });

  it("throws ValidationError when an account is missing prefix", () => {
    expect(() => validateConfig({ accounts: [{ name: "Acct" }] })).toThrow(ValidationError);
  });

  it("throws ValidationError when an account is missing name", () => {
    expect(() => validateConfig({ accounts: [{ prefix: "A" }] })).toThrow(ValidationError);
  });

  it("throws ValidationError when an account port is not a number", () => {
    expect(() => validateConfig({ accounts: [{ prefix: "A", name: "Acct", port: "993" }] })).toThrow(ValidationError);
  });

  it("names the offending field in the error message for a bad account port", () => {
    expect(() => validateConfig({ accounts: [{ prefix: "A", name: "Acct", port: "993" }] })).toThrow(
      /accounts\[0\]\.port/,
    );
  });
});

// ── validateSenders ───────────────────────────────────────────────────────────

describe("validateSenders", () => {
  it("returns the array when it is a valid sender list", () => {
    const senders = [{ address: "vendor@example.com", name: "Vendor", count: 1, accounts: [] }];
    expect(validateSenders(senders)).toBe(senders);
  });

  it("throws ValidationError when raw is not an array", () => {
    expect(() => validateSenders({ address: "x@y.com" })).toThrow(ValidationError);
  });

  it("throws ValidationError when an entry is not an object", () => {
    expect(() => validateSenders(["not an object"])).toThrow(ValidationError);
  });

  it("throws ValidationError when an entry is missing address", () => {
    expect(() => validateSenders([{ name: "No Address" }])).toThrow(ValidationError);
  });

  it("names the field in the error message", () => {
    expect(() => validateSenders([{ name: "No Address" }])).toThrow(/senders\.json\[0\]\.address/);
  });
});

// ── validateClassifications ───────────────────────────────────────────────────

describe("validateClassifications", () => {
  it("returns the object when it is a valid classification map", () => {
    const cls = { "vendor@example.com": "business" };
    expect(validateClassifications(cls)).toBe(cls);
  });

  it("returns an empty object unchanged", () => {
    expect(validateClassifications({})).toEqual({});
  });

  it("throws ValidationError when raw is null", () => {
    expect(() => validateClassifications(null)).toThrow(ValidationError);
  });

  it("throws ValidationError when raw is an array", () => {
    expect(() => validateClassifications([])).toThrow(ValidationError);
  });

  it("throws ValidationError when a value is not a string", () => {
    expect(() => validateClassifications({ "a@b.com": 42 })).toThrow(ValidationError);
  });

  it("names the offending key in the error message", () => {
    expect(() => validateClassifications({ "a@b.com": 42 })).toThrow(/a@b\.com/);
  });
});

// ── validateImportEntries ─────────────────────────────────────────────────────

describe("validateImportEntries", () => {
  it("returns the array when it is a valid import list", () => {
    const entries = [{ address: "a@b.com", classification: "business" }];
    expect(validateImportEntries(entries)).toBe(entries);
  });

  it("returns an empty array unchanged", () => {
    expect(validateImportEntries([])).toEqual([]);
  });

  it("throws ValidationError when raw is not an array", () => {
    expect(() => validateImportEntries({ address: "a@b.com" })).toThrow(ValidationError);
  });

  it("throws ValidationError when an entry is not an object", () => {
    expect(() => validateImportEntries(["not an object"])).toThrow(ValidationError);
  });
});

// ── validateSidecar ───────────────────────────────────────────────────────────

describe("validateSidecar", () => {
  it("returns the sidecar when it is a valid object", () => {
    const sidecar = { vendor: "Acme", amount: 42, date: "2025-01-01" };
    expect(validateSidecar(sidecar)).toBe(sidecar);
  });

  it("returns an empty object unchanged", () => {
    expect(validateSidecar({})).toEqual({});
  });

  it("throws ValidationError when raw is null", () => {
    expect(() => validateSidecar(null)).toThrow(ValidationError);
  });

  it("throws ValidationError when raw is an array", () => {
    expect(() => validateSidecar([])).toThrow(ValidationError);
  });

  it("throws ValidationError when raw is a string", () => {
    expect(() => validateSidecar("not an object")).toThrow(ValidationError);
  });
});
