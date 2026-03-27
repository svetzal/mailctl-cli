import { describe, expect, it } from "bun:test";
import { renderAuthEvent } from "../src/render-auth-events.js";

describe("renderAuthEvent", () => {
  it("renders token-refresh-failed with the error message", () => {
    const event = { type: "token-refresh-failed", error: { message: "expired" } };
    expect(renderAuthEvent(event)).toBe("   Token refresh failed: expired");
  });

  it("renders device-code-prompt with verification URI and user code", () => {
    const event = {
      type: "device-code-prompt",
      verificationUri: "https://microsoft.com/devicelogin",
      userCode: "ABC123",
    };
    const result = renderAuthEvent(event);
    expect(result).toContain("https://microsoft.com/devicelogin");
    expect(result).toContain("ABC123");
  });

  it("starts device-code-prompt with a newline", () => {
    const event = {
      type: "device-code-prompt",
      verificationUri: "https://microsoft.com/devicelogin",
      userCode: "ABC123",
    };
    expect(renderAuthEvent(event)).toMatch(/^\n/);
  });

  it("renders auth-waiting message", () => {
    expect(renderAuthEvent({ type: "auth-waiting" })).toBe("Waiting for authentication...");
  });

  it("renders auth-success message", () => {
    expect(renderAuthEvent({ type: "auth-success" })).toBe("Authentication successful. Tokens cached.");
  });

  it("renders connect-error with account and error message", () => {
    const event = { type: "connect-error", account: "Work", error: { message: "connection refused" } };
    const result = renderAuthEvent(event);
    expect(result).toContain("Work");
    expect(result).toContain("connection refused");
  });

  it("returns null for unknown event types", () => {
    expect(renderAuthEvent({ type: "some-unknown-event" })).toBeNull();
  });
});
