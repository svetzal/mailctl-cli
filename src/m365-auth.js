import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const TOKEN_PATH = join(homedir(), ".newt", "m365-tokens.json");
const SCOPE = "https://outlook.office365.com/IMAP.AccessAsUser.All offline_access";

/**
 * Load cached tokens from disk.
 * @returns {{ access_token: string, refresh_token: string, expires_at: number } | null}
 */
function loadTokens() {
  try {
    return JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Save tokens to disk.
 */
function saveTokens(tokens) {
  mkdirSync(join(homedir(), ".newt"), { recursive: true });
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

/**
 * Refresh an expired access token using the refresh_token.
 * @param {string} clientId
 * @param {string} tenantId
 * @param {string} clientSecret
 * @param {string} refreshToken
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ access_token: string, refresh_token: string, expires_at: number } | null>}
 */
async function refreshAccessToken(clientId, tenantId, clientSecret, refreshToken, onProgress = () => {}) {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: SCOPE,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const errData = /** @type {{ error_description?: string }} */ (await res.json().catch(() => ({})));
    onProgress({ type: "token-refresh-failed", error: new Error(errData.error_description || res.statusText) });
    return null;
  }

  const data = /** @type {{ access_token: string, refresh_token?: string, expires_in: number }} */ (await res.json());
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  saveTokens(tokens);
  return tokens;
}

/**
 * Run the OAuth2 device code flow interactively.
 * Prints a user code and verification URL, then polls until the user authenticates.
 * @param {string} clientId
 * @param {string} tenantId
 * @param {string} clientSecret
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<{ access_token: string, refresh_token: string, expires_at: number }>}
 */
async function deviceCodeFlow(clientId, tenantId, clientSecret, onProgress = () => {}) {
  const deviceUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`;
  const deviceRes = await fetch(deviceUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      scope: SCOPE,
    }),
  });

  if (!deviceRes.ok) {
    const err = /** @type {{ error_description?: string }} */ (await deviceRes.json().catch(() => ({})));
    throw new Error(`Device code request failed: ${err.error_description || deviceRes.statusText}`);
  }

  const deviceData = /** @type {{ device_code: string, user_code: string, verification_uri: string, interval: number, expires_in: number }} */ (await deviceRes.json());
  const { device_code, user_code, verification_uri, interval, expires_in } = deviceData;

  onProgress({ type: "device-code-prompt", verificationUri: verification_uri, userCode: user_code });
  onProgress({ type: "auth-waiting" });

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const pollInterval = (interval || 5) * 1000;
  const deadline = Date.now() + expires_in * 1000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code,
      }),
    });

    const tokenData = /** @type {{ error?: string, error_description?: string, access_token?: string, refresh_token?: string, expires_in?: number }} */ (await tokenRes.json());

    if (tokenData.error === "authorization_pending") {
      continue;
    }

    if (tokenData.error === "slow_down") {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }

    if (tokenData.error) {
      throw new Error(`Authentication failed: ${tokenData.error_description || tokenData.error}`);
    }

    const tokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
    };
    saveTokens(tokens);
    onProgress({ type: "auth-success" });
    return tokens;
  }

  throw new Error("Device code flow timed out. Please try again.");
}

/**
 * Get a valid OAuth2 access token for Microsoft 365.
 * Tries cached token first, then refresh, then falls back to device code flow.
 *
 * @param {{ clientId: string, tenantId: string, clientSecret: string }} creds
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {Promise<string>} access token
 */
export async function getM365AccessToken({ clientId, tenantId, clientSecret }, onProgress = () => {}) {
  const cached = loadTokens();

  if (cached) {
    // Token still valid (with 5-minute buffer)
    if (cached.access_token && cached.expires_at > Date.now() + 5 * 60 * 1000) {
      return cached.access_token;
    }

    // Try refresh
    if (cached.refresh_token) {
      const refreshed = await refreshAccessToken(clientId, tenantId, clientSecret, cached.refresh_token, onProgress);
      if (refreshed) {
        return refreshed.access_token;
      }
    }
  }

  // Fall back to interactive device code flow
  const tokens = await deviceCodeFlow(clientId, tenantId, clientSecret, onProgress);
  return tokens.access_token;
}
