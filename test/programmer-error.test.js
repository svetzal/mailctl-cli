import { describe, expect, it } from "bun:test";
import { isProgrammerError, rethrowIfProgrammerError } from "../src/programmer-error.js";

describe("isProgrammerError", () => {
  it("returns true for a plain TypeError", () => {
    expect(isProgrammerError(new TypeError("bad type"))).toBe(true);
  });

  it("returns true for a plain ReferenceError", () => {
    expect(isProgrammerError(new ReferenceError("x is not defined"))).toBe(true);
  });

  it("returns true for a plain RangeError", () => {
    expect(isProgrammerError(new RangeError("invalid array length"))).toBe(true);
  });

  it("returns true for a plain SyntaxError", () => {
    expect(isProgrammerError(new SyntaxError("unexpected token"))).toBe(true);
  });

  it("returns false for a TypeError that carries an ENOENT code", () => {
    const err = new TypeError("bad path");
    /** @type {any} */ (err).code = "ENOENT";
    expect(isProgrammerError(err)).toBe(false);
  });

  it("returns false for a plain Error with ETIMEDOUT code", () => {
    const err = new Error("IMAP timeout");
    /** @type {any} */ (err).code = "ETIMEDOUT";
    expect(isProgrammerError(err)).toBe(false);
  });

  it("returns false for a plain Error without a code", () => {
    expect(isProgrammerError(new Error("connection lost"))).toBe(false);
  });

  it("returns false for a non-Error value", () => {
    expect(isProgrammerError("oops")).toBe(false);
  });
});

describe("rethrowIfProgrammerError", () => {
  it("throws when the error is a TypeError", () => {
    expect(() => rethrowIfProgrammerError(new TypeError("bad"))).toThrow(TypeError);
  });

  it("returns undefined for an Error with ETIMEDOUT code", () => {
    const err = new Error("timeout");
    /** @type {any} */ (err).code = "ETIMEDOUT";
    expect(rethrowIfProgrammerError(err)).toBeUndefined();
  });

  it("returns undefined for a plain operational Error", () => {
    expect(rethrowIfProgrammerError(new Error("connection lost"))).toBeUndefined();
  });
});
