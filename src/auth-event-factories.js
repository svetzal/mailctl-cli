/**
 * Event factories for auth progress events emitted by src/m365-auth.js.
 *
 * Adding a new event = one descriptor entry here. No separate renderer edit needed.
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
