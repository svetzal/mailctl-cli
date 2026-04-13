import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { debug } from "./debug.js";

const TOKEN_PATH = join(homedir(), ".newt", "m365-tokens.json");
const SCOPE = "https://outlook.office365.com/IMAP.AccessAsUser.All offline_access";

/**
 * @typedef {{ access_token: string, refresh_token: string, expires_at: number }} TokenSet
 */

/**
 * @typedef {{
 *   loadTokens: () => TokenSet | null,
 *   saveTokens: (tokens: TokenSet) => void,
 *   fetch: (url: string, init?: RequestInit) => Promise<Response>,
 *   now: () => number,
 *   sleep: (ms: number) => Promise<void>,
 * }} M365AuthDeps
 */

/**
 * Refresh an expired access token using the refresh_token.
 * @param {string} clientId
 * @param {string} tenantId
 * @param {string} _clientSecret
 * @param {string} refreshToken
 * @param {function(object): void} onProgress - receives structured progress events
 * @param {M365AuthDeps} deps
 * @returns {Promise<TokenSet | null>}
 */
async function refreshAccessToken(clientId, tenantId, _clientSecret, refreshToken, onProgress, deps) {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: SCOPE,
  });

  const res = await deps.fetch(url, {
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
    expires_at: deps.now() + data.expires_in * 1000,
  };
  deps.saveTokens(tokens);
  return tokens;
}

/**
 * Run the OAuth2 device code flow interactively.
 * Prints a user code and verification URL, then polls until the user authenticates.
 * @param {string} clientId
 * @param {string} tenantId
 * @param {string} _clientSecret
 * @param {function(object): void} onProgress - receives structured progress events
 * @param {M365AuthDeps} deps
 * @returns {Promise<TokenSet>}
 */
async function deviceCodeFlow(clientId, tenantId, _clientSecret, onProgress, deps) {
  const deviceUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`;
  const deviceRes = await deps.fetch(deviceUrl, {
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

  const deviceData =
    /** @type {{ device_code: string, user_code: string, verification_uri: string, interval: number, expires_in: number }} */ (
      await deviceRes.json()
    );
  const { device_code, user_code, verification_uri, interval, expires_in } = deviceData;

  onProgress({ type: "device-code-prompt", verificationUri: verification_uri, userCode: user_code });
  onProgress({ type: "auth-waiting" });

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const pollInterval = (interval || 5) * 1000;
  const deadline = deps.now() + expires_in * 1000;

  while (deps.now() < deadline) {
    await deps.sleep(pollInterval);

    const tokenRes = await deps.fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code,
      }),
    });

    const tokenData =
      /** @type {{ error?: string, error_description?: string, access_token?: string, refresh_token?: string, expires_in?: number }} */ (
        await tokenRes.json()
      );

    if (tokenData.error === "authorization_pending") {
      continue;
    }

    if (tokenData.error === "slow_down") {
      await deps.sleep(5000);
      continue;
    }

    if (tokenData.error) {
      throw new Error(`Authentication failed: ${tokenData.error_description || tokenData.error}`);
    }

    // At this point tokenData.error was checked above, so tokens are present
    const tokens = {
      access_token: tokenData.access_token ?? "",
      refresh_token: tokenData.refresh_token ?? "",
      expires_at: deps.now() + (tokenData.expires_in ?? 3600) * 1000,
    };
    deps.saveTokens(tokens);
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
 * @param {M365AuthDeps} [deps] - injectable dependencies (defaults to real implementations)
 * @returns {Promise<string>} access token
 */
export async function getM365AccessToken(
  { clientId, tenantId, clientSecret },
  onProgress = () => {},
  deps = defaultDeps,
) {
  const cached = deps.loadTokens();

  if (cached) {
    // Token still valid (with 5-minute buffer)
    if (cached.access_token && cached.expires_at > deps.now() + 5 * 60 * 1000) {
      return cached.access_token;
    }

    // Try refresh
    if (cached.refresh_token) {
      const refreshed = await refreshAccessToken(
        clientId,
        tenantId,
        clientSecret,
        cached.refresh_token,
        onProgress,
        deps,
      );
      if (refreshed) {
        return refreshed.access_token;
      }
    }
  }

  // Fall back to interactive device code flow
  const tokens = await deviceCodeFlow(clientId, tenantId, clientSecret, onProgress, deps);
  return tokens.access_token;
}

/**
 * Real filesystem implementations for loading and saving tokens.
 */
function realLoadTokens() {
  try {
    return JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
  } catch (err) {
    // Token file missing or unreadable — treat as no cached token
    debug("m365-auth", "token file missing or unreadable, returning null", err);
    return null;
  }
}

/**
 * @param {TokenSet} tokens
 */
function realSaveTokens(tokens) {
  mkdirSync(join(homedir(), ".newt"), { recursive: true });
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

/**
 * Default (real) dependency implementations.
 * @type {M365AuthDeps}
 */
const defaultDeps = {
  loadTokens: realLoadTokens,
  saveTokens: realSaveTokens,
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
