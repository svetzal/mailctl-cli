import { describe, expect, it } from "bun:test";
import { defineErrorEvent, defineEvent } from "../src/define-event.js";

describe("defineEvent", () => {
  it("creates an event with the correct type", () => {
    const factory = defineEvent("foo", "a", "b");
    expect(factory(1, 2).type).toBe("foo");
  });

  it("maps positional args to named params", () => {
    const factory = defineEvent("foo", "a", "b");
    expect(factory(1, 2)).toEqual({ type: "foo", a: 1, b: 2 });
  });

  it("creates a zero-param event with only type", () => {
    const factory = defineEvent("bar");
    expect(factory()).toEqual({ type: "bar" });
  });

  it("attaches .type to the factory function", () => {
    const factory = defineEvent("baz", "x");
    expect(factory.type).toBe("baz");
  });
});

describe("defineErrorEvent", () => {
  it("creates an event with the correct type", () => {
    const factory = defineErrorEvent("test-error", "error");
    expect(factory(new Error("boom")).type).toBe("test-error");
  });

  it("includes the severity field", () => {
    const factory = defineErrorEvent("test-error", "error");
    expect(factory(new Error("boom")).severity).toBe("error");
  });

  it("includes warning severity when specified", () => {
    const factory = defineErrorEvent("test-warn", "warning");
    expect(factory(new Error("oops")).severity).toBe("warning");
  });

  it("includes the error field", () => {
    const factory = defineErrorEvent("test-error", "error");
    const err = new Error("boom");
    expect(factory(err).error).toBe(err);
  });

  it("maps additional positional args to named params", () => {
    const factory = defineErrorEvent("test-error", "error", "uid", "filename");
    const err = new Error("boom");
    const event = factory(err, 42, "test.pdf");
    expect(event.uid).toBe(42);
    expect(event.filename).toBe("test.pdf");
  });

  it("attaches .type to the factory function", () => {
    const factory = defineErrorEvent("test-error", "error");
    expect(factory.type).toBe("test-error");
  });
});
