import { describe, it, expect } from "bun:test";
import { computeFlagChanges, applyFlagChanges } from "../src/flag-messages.js";

describe("computeFlagChanges", () => {
  it("returns add \\Seen for --read", () => {
    const result = computeFlagChanges({ read: true });

    expect(result).toEqual({ add: ["\\Seen"], remove: [] });
  });

  it("returns remove \\Seen for --unread", () => {
    const result = computeFlagChanges({ unread: true });

    expect(result).toEqual({ add: [], remove: ["\\Seen"] });
  });

  it("returns add \\Flagged for --star", () => {
    const result = computeFlagChanges({ star: true });

    expect(result).toEqual({ add: ["\\Flagged"], remove: [] });
  });

  it("returns remove \\Flagged for --unstar", () => {
    const result = computeFlagChanges({ unstar: true });

    expect(result).toEqual({ add: [], remove: ["\\Flagged"] });
  });

  it("returns both adds for --read --star", () => {
    const result = computeFlagChanges({ read: true, star: true });

    expect(result).toEqual({ add: ["\\Seen", "\\Flagged"], remove: [] });
  });

  it("returns mixed add and remove for --read --unstar", () => {
    const result = computeFlagChanges({ read: true, unstar: true });

    expect(result).toEqual({ add: ["\\Seen"], remove: ["\\Flagged"] });
  });

  it("throws when --read and --unread are both set", () => {
    expect(() => computeFlagChanges({ read: true, unread: true })).toThrow(
      "--read and --unread are mutually exclusive"
    );
  });

  it("throws when --star and --unstar are both set", () => {
    expect(() => computeFlagChanges({ star: true, unstar: true })).toThrow(
      "--star and --unstar are mutually exclusive"
    );
  });

  it("throws when no flag options are provided", () => {
    expect(() => computeFlagChanges({})).toThrow(
      "No flag options specified"
    );
  });
});

describe("applyFlagChanges", () => {
  it("calls messageFlagsAdd when there are flags to add", async () => {
    const calls = [];
    const client = {
      messageFlagsAdd: async (range, flags, opts) => calls.push({ method: "add", range, flags, opts }),
      messageFlagsRemove: async (range, flags, opts) => calls.push({ method: "remove", range, flags, opts }),
    };

    await applyFlagChanges(client, "123", { add: ["\\Seen"], remove: [] });

    expect(calls).toEqual([
      { method: "add", range: "123", flags: ["\\Seen"], opts: { uid: true } },
    ]);
  });

  it("calls messageFlagsRemove when there are flags to remove", async () => {
    const calls = [];
    const client = {
      messageFlagsAdd: async (range, flags, opts) => calls.push({ method: "add", range, flags, opts }),
      messageFlagsRemove: async (range, flags, opts) => calls.push({ method: "remove", range, flags, opts }),
    };

    await applyFlagChanges(client, "456", { add: [], remove: ["\\Seen"] });

    expect(calls).toEqual([
      { method: "remove", range: "456", flags: ["\\Seen"], opts: { uid: true } },
    ]);
  });

  it("calls both add and remove when both are specified", async () => {
    const calls = [];
    const client = {
      messageFlagsAdd: async (range, flags, opts) => calls.push({ method: "add", range, flags, opts }),
      messageFlagsRemove: async (range, flags, opts) => calls.push({ method: "remove", range, flags, opts }),
    };

    await applyFlagChanges(client, "789", { add: ["\\Seen"], remove: ["\\Flagged"] });

    expect(calls).toEqual([
      { method: "add", range: "789", flags: ["\\Seen"], opts: { uid: true } },
      { method: "remove", range: "789", flags: ["\\Flagged"], opts: { uid: true } },
    ]);
  });

  it("returns the added and removed flags", async () => {
    const client = {
      messageFlagsAdd: async () => {},
      messageFlagsRemove: async () => {},
    };

    const result = await applyFlagChanges(client, "123", { add: ["\\Seen"], remove: ["\\Flagged"] });

    expect(result).toEqual({ added: ["\\Seen"], removed: ["\\Flagged"] });
  });
});
