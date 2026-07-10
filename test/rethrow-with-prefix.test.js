import { describe, expect, it } from "bun:test";
import { rethrowWithPrefix } from "../src/rethrow-with-prefix.js";

describe("rethrowWithPrefix", () => {
  it("throws an Error with the prefixed message", () => {
    const original = new Error("boom");
    expect(() => rethrowWithPrefix(original, "Scan failed")).toThrow("Scan failed: boom");
  });

  it("sets cause to the original error", () => {
    const original = new Error("boom");
    let caught;
    try {
      rethrowWithPrefix(original, "Scan failed");
    } catch (e) {
      caught = e;
    }
    expect(caught.cause).toBe(original);
  });

  it("forwards code when the original has one", () => {
    const original = new Error("timed out");
    /** @type {any} */ (original).code = "ETIMEDOUT";
    let caught;
    try {
      rethrowWithPrefix(original, "Scan failed");
    } catch (e) {
      caught = e;
    }
    expect(/** @type {any} */ (caught).code).toBe("ETIMEDOUT");
  });

  it("omits code when the original has none", () => {
    const original = new Error("boom");
    let caught;
    try {
      rethrowWithPrefix(original, "Scan failed");
    } catch (e) {
      caught = e;
    }
    expect("code" in caught).toBe(false);
  });

  it("wraps a thrown string without crashing", () => {
    let caught;
    try {
      rethrowWithPrefix("something went wrong", "Scan failed");
    } catch (e) {
      caught = e;
    }
    expect(caught.message).toBe("Scan failed: something went wrong");
  });

  it("preserves the original error on the cause chain", () => {
    const original = new Error("boom");
    let caught;
    try {
      rethrowWithPrefix(original, "Scan failed");
    } catch (e) {
      caught = e;
    }
    expect(caught.cause).toBeInstanceOf(Error);
    expect(caught.cause.stack).toBeDefined();
  });
});
