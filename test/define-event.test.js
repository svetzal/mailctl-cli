import { describe, expect, it } from "bun:test";
import { defineEvent } from "../src/define-event.js";

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
