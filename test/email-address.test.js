import { describe, expect, it } from "bun:test";
import { getDomain, getLocalPart } from "../src/email-address.js";

describe("getLocalPart", () => {
  it("returns the part before @ for a normal address", () => {
    expect(getLocalPart("a@b.com")).toBe("a");
  });

  it("returns empty string for null input", () => {
    expect(getLocalPart(null)).toBe("");
  });

  it("returns empty string for undefined input", () => {
    expect(getLocalPart(undefined)).toBe("");
  });

  it("returns empty string for empty string input", () => {
    expect(getLocalPart("")).toBe("");
  });

  it("returns local part including plus addressing", () => {
    expect(getLocalPart("x+tag@b.com")).toBe("x+tag");
  });
});

describe("getDomain", () => {
  it("returns the part after @ for a normal address", () => {
    expect(getDomain("a@b.com")).toBe("b.com");
  });

  it("returns empty string for null input", () => {
    expect(getDomain(null)).toBe("");
  });

  it("returns empty string for undefined input", () => {
    expect(getDomain(undefined)).toBe("");
  });

  it("returns empty string for empty string input", () => {
    expect(getDomain("")).toBe("");
  });

  it("returns domain portion of plus-addressed input", () => {
    expect(getDomain("x+tag@b.com")).toBe("b.com");
  });
});
