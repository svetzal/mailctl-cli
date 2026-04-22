/**
 * Pure renderer for M365 auth progress events.
 * No I/O — returns a string (or null for unknown event types).
 */
import { createEventRenderer } from "./render-shared-events.js";

export const renderAuthEvent = createEventRenderer(
  {
    "token-refresh-failed": (e) => `   Token refresh failed: ${e.error?.message ?? "unknown error"}`,
    "device-code-prompt": (e) =>
      `\nTo authenticate Microsoft 365, visit: ${e.verificationUri}\nEnter code: ${e.userCode}`,
    "auth-waiting": () => `Waiting for authentication...`,
    "auth-success": () => `Authentication successful. Tokens cached.`,
    "connect-error": (e) => `   ❌ Failed to connect to ${e.account}: ${e.error?.message ?? "unknown error"}`,
  },
  { fallback: false },
);
