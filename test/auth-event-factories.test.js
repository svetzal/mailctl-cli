import { describe, expect, it } from "bun:test";
import { authSuccess, authWaiting, deviceCodePrompt, tokenRefreshFailed } from "../src/auth-event-factories.js";

describe("deviceCodePrompt", () => {
  it("has type device-code-prompt", () => {
    expect(deviceCodePrompt("https://example.com/auth", "ABC123").type).toBe("device-code-prompt");
  });

  it("has verificationUri field", () => {
    expect(deviceCodePrompt("https://example.com/auth", "ABC123").verificationUri).toBe("https://example.com/auth");
  });

  it("has userCode field", () => {
    expect(deviceCodePrompt("https://example.com/auth", "ABC123").userCode).toBe("ABC123");
  });
});

describe("authWaiting", () => {
  it("has type auth-waiting", () => {
    expect(authWaiting().type).toBe("auth-waiting");
  });
});

describe("authSuccess", () => {
  it("has type auth-success", () => {
    expect(authSuccess().type).toBe("auth-success");
  });
});

describe("tokenRefreshFailed", () => {
  it("has type token-refresh-failed", () => {
    expect(tokenRefreshFailed(new Error("refresh failed")).type).toBe("token-refresh-failed");
  });

  it("has severity error", () => {
    expect(tokenRefreshFailed(new Error("refresh failed")).severity).toBe("error");
  });

  it("has error field", () => {
    const err = new Error("refresh failed");
    expect(tokenRefreshFailed(err).error).toBe(err);
  });
});
