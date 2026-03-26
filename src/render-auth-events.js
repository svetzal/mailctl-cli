/**
 * Pure renderer for M365 auth progress events.
 * No I/O — returns a string (or null for unknown event types).
 */

/**
 * @typedef {object} AuthEvent
 * @property {string} type
 * @property {{ message: string }} [error]
 * @property {string} [verificationUri]
 * @property {string} [userCode]
 * @property {string} [account]
 */

/**
 * Render an M365 auth progress event as a human-readable string.
 *
 * @param {AuthEvent} event
 * @returns {string | null}
 */
export function renderAuthEvent(event) {
  switch (event.type) {
    case "token-refresh-failed":
      return `   Token refresh failed: ${event.error.message}`;
    case "device-code-prompt":
      return `\nTo authenticate Microsoft 365, visit: ${event.verificationUri}\nEnter code: ${event.userCode}`;
    case "auth-waiting":
      return `Waiting for authentication...`;
    case "auth-success":
      return `Authentication successful. Tokens cached.`;
    case "connect-error":
      return `   ❌ Failed to connect to ${event.account}: ${event.error.message}`;
    default:
      return null;
  }
}
