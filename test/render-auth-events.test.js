import { describe, expect, it } from "bun:test";
import { renderAuthEvent } from "../src/render-auth-events.js";

describe("renderAuthEvent", () => {
  it("renders token-refresh-failed with the error message", () => {
    const event = { type: "token-refresh-failed", error: { message: "expired" } };
    expect(renderAuthEvent(event)).toBe("   Token refresh failed: expired");
  });

  describe("renders device-code-prompt", () => {
    const event = {
      type: "device-code-prompt",
      verificationUri: "https://microsoft.com/devicelogin",
      userCode: "ABC123",
    };
    const result = renderAuthEvent(event);
    it("includes the verification URI", () => expect(result).toContain("https://microsoft.com/devicelogin"));
    it("includes the user code", () => expect(result).toContain("ABC123"));
    it("starts with a newline", () => expect(result).toMatch(/^\n/));
  });

  it("renders auth-waiting message", () => {
    expect(renderAuthEvent({ type: "auth-waiting" })).toBe("Waiting for authentication...");
  });

  it("renders auth-success message", () => {
    expect(renderAuthEvent({ type: "auth-success" })).toBe("Authentication successful. Tokens cached.");
  });

  describe("renders connect-error with account and error message", () => {
    const event = { type: "connect-error", account: "Work", error: { message: "connection refused" } };
    const result = renderAuthEvent(event);
    it("includes the account name", () => expect(result).toContain("Work"));
    it("includes the error message", () => expect(result).toContain("connection refused"));
  });

  it("returns null for unknown event types", () => {
    expect(renderAuthEvent({ type: "some-unknown-event" })).toBeNull();
  });
});
