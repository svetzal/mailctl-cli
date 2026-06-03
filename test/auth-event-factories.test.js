import { describe, expect, it } from "bun:test";
import {
  authSuccess,
  authWaiting,
  connectError,
  deviceCodePrompt,
  tokenRefreshFailed,
} from "../src/auth-event-factories.js";

describe("deviceCodePrompt", () => {
  it("builds the device-code-prompt event", () => {
    expect(deviceCodePrompt("https://example.com/auth", "ABC123")).toEqual({
      type: "device-code-prompt",
      verificationUri: "https://example.com/auth",
      userCode: "ABC123",
    });
  });
});

describe("authWaiting", () => {
  it("builds the auth-waiting event", () => {
    expect(authWaiting()).toEqual({ type: "auth-waiting" });
  });
});

describe("authSuccess", () => {
  it("builds the auth-success event", () => {
    expect(authSuccess()).toEqual({ type: "auth-success" });
  });
});

describe("tokenRefreshFailed", () => {
  it("builds the token-refresh-failed event", () => {
    const err = new Error("refresh failed");
    expect(tokenRefreshFailed(err)).toEqual({
      type: "token-refresh-failed",
      severity: "error",
      error: err,
    });
  });
});

describe("connectError", () => {
  it("builds the connect-error event", () => {
    const err = new Error("connection refused");
    expect(connectError(err, "Work")).toEqual({
      type: "connect-error",
      severity: "error",
      error: err,
      account: "Work",
    });
  });
});
