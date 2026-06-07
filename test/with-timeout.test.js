import { describe, expect, it } from "bun:test";
import { withTimeout } from "../src/with-timeout.js";

describe("withTimeout", () => {
  it("resolves with the value when the promise wins the race", async () => {
    const result = await withTimeout(() => Promise.resolve("hello"), 1000);
    expect(result).toBe("hello");
  });

  it("rejects with ETIMEDOUT code when the timer fires first", async () => {
    const never = new Promise(() => {});
    let caught;
    try {
      await withTimeout(() => never, 10);
    } catch (err) {
      caught = err;
    }
    expect(caught?.code).toBe("ETIMEDOUT");
  });

  it("includes the timeout duration in the error message", async () => {
    const never = new Promise(() => {});
    let msg = "";
    try {
      await withTimeout(() => never, 20, "test-op");
    } catch (err) {
      msg = err.message;
    }
    expect(msg).toContain("20ms");
  });

  it("includes the label in the error message", async () => {
    const never = new Promise(() => {});
    let msg = "";
    try {
      await withTimeout(() => never, 20, "my-label");
    } catch (err) {
      msg = err.message;
    }
    expect(msg).toContain("my-label");
  });

  it("propagates rejection from the underlying promise", async () => {
    const cause = new Error("underlying failure");
    let caught;
    try {
      await withTimeout(() => Promise.reject(cause), 1000);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(cause);
  });
});
