import { describe, expect, it } from "bun:test";
import { parseIntOption, parseSinceOption } from "../src/parse-options.js";

describe("parseIntOption", () => {
  it("parses a string value as an integer", () => {
    expect(parseIntOption("42", 10)).toBe(42);
  });

  it("returns the fallback when value is undefined", () => {
    expect(parseIntOption(undefined, 10)).toBe(10);
  });

  it("returns the fallback when value is null", () => {
    expect(parseIntOption(null, 25)).toBe(25);
  });
});

describe("parseSinceOption", () => {
  it("parses a string value with parseDate", () => {
    const result = parseSinceOption("2026-01-15", null);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2026);
  });

  it("parses the fallback string when value is absent", () => {
    const result = parseSinceOption(undefined, "7d");
    expect(result).toBeInstanceOf(Date);
  });

  it("returns null when value is absent and fallback is null", () => {
    expect(parseSinceOption(undefined, null)).toBeNull();
  });

  it("returns null when both value and fallback are null", () => {
    expect(parseSinceOption(null, null)).toBeNull();
  });
});
