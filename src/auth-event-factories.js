/**
 * Event factories for auth progress events emitted by src/m365-auth.js.
 *
 * Adding a new event = one descriptor entry here. No separate renderer edit needed.
 */

/**
 * @typedef {object} DeviceCodePromptEvent
 * @property {'device-code-prompt'} type
 * @property {string} verificationUri
 * @property {string} userCode
 */
/**
 * @typedef {object} AuthWaitingEvent
 * @property {'auth-waiting'} type
 */
/**
 * @typedef {object} AuthSuccessEvent
 * @property {'auth-success'} type
 */
/**
 * @typedef {object} TokenRefreshFailedEvent
 * @property {'token-refresh-failed'} type
 * @property {'error'} severity
 * @property {Error} error
 */
/**
 * @typedef {object} ConnectErrorEvent
 * @property {'connect-error'} type
 * @property {'error'} severity
 * @property {Error} error
 * @property {string} account
 */
/**
 * @typedef {DeviceCodePromptEvent | AuthWaitingEvent | AuthSuccessEvent | TokenRefreshFailedEvent | ConnectErrorEvent} AuthEvent
 */

import { defineEventTable } from "./event-table.js";

const TABLE = {
  deviceCodePrompt: {
    params: ["verificationUri", "userCode"],
    render: (e) => `\nTo authenticate Microsoft 365, visit: ${e.verificationUri}\nEnter code: ${e.userCode}`,
  },
  authWaiting: {
    render: () => `Waiting for authentication...`,
  },
  authSuccess: {
    render: () => `Authentication successful. Tokens cached.`,
  },
  tokenRefreshFailed: {
    severity: "error",
    render: (e) => `   Token refresh failed: ${e.error?.message ?? "unknown error"}`,
  },
  connectError: {
    severity: "error",
    params: ["account"],
    render: (e) => `   ❌ Failed to connect to ${e.account}: ${e.error?.message ?? "unknown error"}`,
  },
};

const { factories, renderEvent } = defineEventTable(TABLE);

export const { deviceCodePrompt, authWaiting, authSuccess, tokenRefreshFailed, connectError } = factories;
export const renderAuthEvent = renderEvent;
