import { afterEach, describe, expect, it, mock } from "bun:test";

function makeGateway(execFileSyncFn) {
  mock.module("node:child_process", () => ({
    execFileSync: execFileSyncFn,
    execSync: () => {},
  }));
  const { SubprocessGateway } = require("../../src/gateways/subprocess-gateway.js");
  return new SubprocessGateway();
}

afterEach(() => {
  mock.restore();
});

describe("SubprocessGateway execFileSync", () => {
  it("forwards cmd, args, and opts unchanged to execFileSync", () => {
    const calls = [];
    const gateway = makeGateway((cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      return "";
    });

    gateway.execFileSync("/usr/bin/foo", ["--bar"], { encoding: "utf8" });

    expect(calls[0]).toEqual({ cmd: "/usr/bin/foo", args: ["--bar"], opts: { encoding: "utf8" } });
  });

  it("returns the value produced by execFileSync", () => {
    const gateway = makeGateway(() => "expected-output");

    expect(gateway.execFileSync("/usr/bin/foo", [])).toBe("expected-output");
  });

  it("propagates a thrown error to the caller", () => {
    const gateway = makeGateway(() => {
      throw new Error("subprocess failed");
    });

    expect(() => gateway.execFileSync("/usr/bin/foo", [])).toThrow("subprocess failed");
  });
});
