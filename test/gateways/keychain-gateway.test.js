import { afterEach, describe, expect, it, mock } from "bun:test";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeKeychain(execFileSyncFn) {
  // Include execSync as a no-op alongside execFileSync.
  // bun v1.3.9 mock.restore() leaves the module namespace in the mocked state across files;
  // omitting execSync here would break editor-gateway tests that run in the same process.
  mock.module("node:child_process", () => ({
    execFileSync: execFileSyncFn,
    execSync: () => {},
  }));
  const { KeychainGateway } = require("../../src/gateways/keychain-gateway.js");
  return new KeychainGateway();
}

afterEach(() => {
  mock.restore();
});

// ── readSecret ────────────────────────────────────────────────────────────────

describe("KeychainGateway readSecret", () => {
  it("returns null when execFileSync throws", () => {
    const gateway = makeKeychain(() => {
      throw new Error("secret not found");
    });

    expect(gateway.readSecret("test-service")).toBeNull();
  });

  it("returns the trimmed secret value when execFileSync succeeds", () => {
    const gateway = makeKeychain(() => "  my-secret  \n");

    expect(gateway.readSecret("test-service")).toBe("my-secret");
  });
});

// ── unlockNewtKeychain ────────────────────────────────────────────────────────

describe("KeychainGateway unlockNewtKeychain", () => {
  it("passes the trimmed password from the first call as the -p argument to the second call", () => {
    const calls = [];
    const gateway = makeKeychain((...args) => {
      calls.push(args);
      return calls.length === 1 ? "  keychain-password  \n" : "";
    });

    gateway.unlockNewtKeychain();

    const secondCallArgs = calls[1][1];
    const passwordIdx = secondCallArgs.indexOf("-p") + 1;
    expect(secondCallArgs[passwordIdx]).toBe("keychain-password");
  });
});
