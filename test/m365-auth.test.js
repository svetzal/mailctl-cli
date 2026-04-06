import { beforeAll, describe, expect, it, mock } from "bun:test";
import { getM365AccessToken } from "../src/m365-auth.js";

const CREDS = { clientId: "cid", tenantId: "tid", clientSecret: "csec" };

/**
 * Create a mock Response object for fetch.
 * @param {object} body
 * @param {{ ok?: boolean, status?: number, statusText?: string }} [opts]
 * @returns {Response}
 */
function makeResponse(body, { ok = true, status = 200, statusText = "OK" } = {}) {
  const partial = { ok, status, statusText, json: mock(() => Promise.resolve(body)) };
  return /** @type {Response} */ (/** @type {unknown} */ (partial));
}

/**
 * Build a standard set of mock deps.
 * The returned object has mock functions so callers can inspect .mock.calls.
 * @param {object} [overrides]
 */
function makeDeps(overrides = {}) {
  return {
    loadTokens: mock(() => null),
    saveTokens: mock(/** @param {import("../src/m365-auth.js").TokenSet} _tokens */ (_tokens) => {}),
    fetch: mock(
      /** @param {string} _url @param {RequestInit} [_init] */ (_url, _init) => Promise.resolve(makeResponse({})),
    ),
    now: mock(() => 1_000_000),
    sleep: mock(/** @param {number} _ms */ (_ms) => Promise.resolve()),
    ...overrides,
  };
}

/**
 * Build a TokenSet that is still valid (expires far in the future).
 * @param {object} [overrides]
 */
function makeValidToken(overrides = {}) {
  return {
    access_token: "valid-access-token",
    refresh_token: "valid-refresh-token",
    expires_at: 1_000_000 + 60 * 60 * 1000, // 1 hour from now()
    ...overrides,
  };
}

/**
 * Build a TokenSet that has expired.
 */
function makeExpiredToken(overrides = {}) {
  return {
    access_token: "expired-access-token",
    refresh_token: "valid-refresh-token",
    expires_at: 1_000_000 - 1, // already expired relative to now()
    ...overrides,
  };
}

describe("getM365AccessToken", () => {
  describe("cached token still valid", () => {
    describe("returns the cached access_token without calling fetch", () => {
      const deps = makeDeps({ loadTokens: mock(() => makeValidToken()) });
      let result;
      beforeAll(async () => {
        result = await getM365AccessToken(CREDS, () => {}, deps);
      });

      it("returns valid-access-token", async () => {
        expect(result).toBe("valid-access-token");
      });

      it("does not call fetch", async () => {
        expect(deps.fetch).not.toHaveBeenCalled();
      });
    });

    describe("treats a token expiring in 6 minutes as still valid", () => {
      const deps = makeDeps({ loadTokens: mock(() => makeValidToken({ expires_at: 1_000_000 + 6 * 60 * 1000 })) });
      let result;
      beforeAll(async () => {
        result = await getM365AccessToken(CREDS, () => {}, deps);
      });

      it("returns valid-access-token", async () => {
        expect(result).toBe("valid-access-token");
      });

      it("does not call fetch", async () => {
        expect(deps.fetch).not.toHaveBeenCalled();
      });
    });
  });

  describe("5-minute buffer boundary", () => {
    it("treats a token expiring in exactly 4 minutes as expired", async () => {
      // expires_at is 4 minutes from now — within the 5-minute buffer
      const token = makeExpiredToken({ expires_at: 1_000_000 + 4 * 60 * 1000 });
      const refreshResponse = makeResponse({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 3600,
      });
      const deps = makeDeps({
        loadTokens: mock(() => token),
        fetch: mock(() => Promise.resolve(refreshResponse)),
      });

      await getM365AccessToken(CREDS, () => {}, deps);

      expect(deps.fetch).toHaveBeenCalled();
    });
  });

  describe("cached token expired — refresh succeeds", () => {
    it("returns the new access_token from the refresh response", async () => {
      const expired = makeExpiredToken();
      const refreshResponse = makeResponse({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 3600,
      });
      const deps = makeDeps({
        loadTokens: mock(() => expired),
        fetch: mock(() => Promise.resolve(refreshResponse)),
      });

      const result = await getM365AccessToken(CREDS, () => {}, deps);

      expect(result).toBe("new-access-token");
    });

    it("calls saveTokens with the refreshed token set", async () => {
      const expired = makeExpiredToken();
      const refreshResponse = makeResponse({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 3600,
      });
      const deps = makeDeps({
        loadTokens: mock(() => expired),
        fetch: mock(() => Promise.resolve(refreshResponse)),
      });

      await getM365AccessToken(CREDS, () => {}, deps);

      expect(deps.saveTokens).toHaveBeenCalledWith({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_at: 1_000_000 + 3600 * 1000,
      });
    });

    it("preserves the old refresh_token when the refresh response omits one", async () => {
      const expired = makeExpiredToken({ refresh_token: "old-refresh-token" });
      const refreshResponse = makeResponse({
        access_token: "new-access-token",
        // no refresh_token in response
        expires_in: 3600,
      });
      const deps = makeDeps({
        loadTokens: mock(() => expired),
        fetch: mock(() => Promise.resolve(refreshResponse)),
      });

      await getM365AccessToken(CREDS, () => {}, deps);

      const saved = deps.saveTokens.mock.calls[0][0];
      expect(saved.refresh_token).toBe("old-refresh-token");
    });
  });

  describe("cached token expired — refresh fails, falls back to device code flow", () => {
    it("falls back to device code flow when refresh returns a non-ok response", async () => {
      const expired = makeExpiredToken();
      const refreshFail = makeResponse(
        { error_description: "Token expired" },
        { ok: false, status: 400, statusText: "Bad Request" },
      );
      const deviceCodeResponse = makeResponse({
        device_code: "dev-code",
        user_code: "USER-CODE",
        verification_uri: "https://microsoft.com/devicelogin",
        interval: 5,
        expires_in: 900,
      });
      const tokenSuccessResponse = makeResponse({
        access_token: "device-access-token",
        refresh_token: "device-refresh-token",
        expires_in: 3600,
      });

      let fetchCallCount = 0;
      const deps = makeDeps({
        loadTokens: mock(() => expired),
        fetch: mock(() => {
          fetchCallCount++;
          if (fetchCallCount === 1) return Promise.resolve(refreshFail);
          if (fetchCallCount === 2) return Promise.resolve(deviceCodeResponse);
          return Promise.resolve(tokenSuccessResponse);
        }),
      });

      const result = await getM365AccessToken(CREDS, () => {}, deps);

      expect(result).toBe("device-access-token");
    });
  });

  describe("no cached token — device code flow", () => {
    it("starts device code flow when no cached token exists", async () => {
      const deviceCodeResponse = makeResponse({
        device_code: "dev-code",
        user_code: "USER-CODE",
        verification_uri: "https://microsoft.com/devicelogin",
        interval: 5,
        expires_in: 900,
      });
      const tokenSuccessResponse = makeResponse({
        access_token: "device-access-token",
        refresh_token: "device-refresh-token",
        expires_in: 3600,
      });

      let fetchCallCount = 0;
      const deps = makeDeps({
        loadTokens: mock(() => null),
        fetch: mock(() => {
          fetchCallCount++;
          if (fetchCallCount === 1) return Promise.resolve(deviceCodeResponse);
          return Promise.resolve(tokenSuccessResponse);
        }),
      });

      const result = await getM365AccessToken(CREDS, () => {}, deps);

      expect(result).toBe("device-access-token");
    });

    it("saves tokens after successful device code flow", async () => {
      const deviceCodeResponse = makeResponse({
        device_code: "dev-code",
        user_code: "USER-CODE",
        verification_uri: "https://microsoft.com/devicelogin",
        interval: 5,
        expires_in: 900,
      });
      const tokenSuccessResponse = makeResponse({
        access_token: "device-access-token",
        refresh_token: "device-refresh-token",
        expires_in: 3600,
      });

      let fetchCallCount = 0;
      const deps = makeDeps({
        loadTokens: mock(() => null),
        fetch: mock(() => {
          fetchCallCount++;
          if (fetchCallCount === 1) return Promise.resolve(deviceCodeResponse);
          return Promise.resolve(tokenSuccessResponse);
        }),
      });

      await getM365AccessToken(CREDS, () => {}, deps);

      expect(deps.saveTokens).toHaveBeenCalledWith({
        access_token: "device-access-token",
        refresh_token: "device-refresh-token",
        expires_at: 1_000_000 + 3600 * 1000,
      });
    });
  });

  describe("device code flow — authorization_pending continues polling", () => {
    const deviceCodeResponse = makeResponse({
      device_code: "dev-code",
      user_code: "USER-CODE",
      verification_uri: "https://microsoft.com/devicelogin",
      interval: 5,
      expires_in: 900,
    });
    const pendingResponse = makeResponse({ error: "authorization_pending" });
    const tokenSuccessResponse = makeResponse({
      access_token: "device-access-token",
      refresh_token: "device-refresh-token",
      expires_in: 3600,
    });

    let nowCallCount = 0;
    const baseTime = 1_000_000;
    const deps = makeDeps({
      loadTokens: mock(() => null),
      fetch: mock(async () => {
        const callIndex = deps.fetch.mock.calls.length;
        if (callIndex === 1) return deviceCodeResponse;
        if (callIndex === 2) return pendingResponse;
        return tokenSuccessResponse;
      }),
      now: mock(() => {
        nowCallCount++;
        return baseTime + nowCallCount * 1000;
      }),
    });

    let result;
    beforeAll(async () => {
      result = await getM365AccessToken(CREDS, () => {}, deps);
    });

    it("returns the device access token", async () => {
      expect(result).toBe("device-access-token");
    });

    it("fetch is called 3 times (device code, pending, success)", async () => {
      expect(deps.fetch.mock.calls.length).toBe(3);
    });
  });

  describe("device code flow — slow_down adds extra delay", () => {
    it("calls sleep an extra time when token endpoint returns slow_down", async () => {
      const deviceCodeResponse = makeResponse({
        device_code: "dev-code",
        user_code: "USER-CODE",
        verification_uri: "https://microsoft.com/devicelogin",
        interval: 5,
        expires_in: 900,
      });
      const slowDownResponse = makeResponse({ error: "slow_down" });
      const tokenSuccessResponse = makeResponse({
        access_token: "device-access-token",
        refresh_token: "device-refresh-token",
        expires_in: 3600,
      });

      let nowCallCount = 0;
      const baseTime = 1_000_000;
      const deps = makeDeps({
        loadTokens: mock(() => null),
        fetch: mock(async () => {
          const callIndex = deps.fetch.mock.calls.length;
          if (callIndex === 1) return deviceCodeResponse;
          if (callIndex === 2) return slowDownResponse;
          return tokenSuccessResponse;
        }),
        now: mock(() => {
          nowCallCount++;
          return baseTime + nowCallCount * 1000;
        }),
      });

      await getM365AccessToken(CREDS, () => {}, deps);

      // sleep should be called for: initial poll interval + slow_down extra + next poll interval
      // slow_down causes an extra deps.sleep(5000) call before continuing
      const sleepCalls = deps.sleep.mock.calls;
      const has5000 = sleepCalls.some((call) => call[0] === 5000);
      expect(has5000).toBe(true);
    });
  });

  describe("device code flow — error response throws", () => {
    it("throws with the error_description when token endpoint returns an error", async () => {
      const deviceCodeResponse = makeResponse({
        device_code: "dev-code",
        user_code: "USER-CODE",
        verification_uri: "https://microsoft.com/devicelogin",
        interval: 5,
        expires_in: 900,
      });
      const errorResponse = makeResponse({
        error: "access_denied",
        error_description: "The user denied consent.",
      });

      let fetchCallCount = 0;
      const deps = makeDeps({
        loadTokens: mock(() => null),
        fetch: mock(async () => {
          fetchCallCount++;
          if (fetchCallCount === 1) return deviceCodeResponse;
          return errorResponse;
        }),
      });

      await expect(getM365AccessToken(CREDS, () => {}, deps)).rejects.toThrow("The user denied consent.");
    });

    it("throws with the error code when error_description is absent", async () => {
      const deviceCodeResponse = makeResponse({
        device_code: "dev-code",
        user_code: "USER-CODE",
        verification_uri: "https://microsoft.com/devicelogin",
        interval: 5,
        expires_in: 900,
      });
      const errorResponse = makeResponse({ error: "some_error" });

      let fetchCallCount = 0;
      const deps = makeDeps({
        loadTokens: mock(() => null),
        fetch: mock(async () => {
          fetchCallCount++;
          if (fetchCallCount === 1) return deviceCodeResponse;
          return errorResponse;
        }),
      });

      await expect(getM365AccessToken(CREDS, () => {}, deps)).rejects.toThrow("some_error");
    });
  });

  describe("device code flow — timeout throws", () => {
    it("throws when the device code expires before the user authenticates", async () => {
      const baseTime = 1_000_000;
      // expires_in = 10 seconds, but now() will be past the deadline immediately
      const deviceCodeResponse = makeResponse({
        device_code: "dev-code",
        user_code: "USER-CODE",
        verification_uri: "https://microsoft.com/devicelogin",
        interval: 5,
        expires_in: 10, // very short
      });

      // now() starts at baseTime; deadline = baseTime + 10*1000
      // After first sleep, now() jumps past deadline
      let nowCallCount = 0;
      const deps = makeDeps({
        loadTokens: mock(() => null),
        fetch: mock(async () => {
          const callIndex = deps.fetch.mock.calls.length;
          if (callIndex === 1) return deviceCodeResponse;
          // Never reached — deadline is exceeded
          return makeResponse({ error: "authorization_pending" });
        }),
        now: mock(() => {
          nowCallCount++;
          // First call: compute deadline = baseTime + 10000
          // Second call: while condition check — return past deadline
          if (nowCallCount <= 1) return baseTime;
          return baseTime + 20_000; // past the 10s deadline
        }),
      });

      await expect(getM365AccessToken(CREDS, () => {}, deps)).rejects.toThrow(
        "Device code flow timed out. Please try again.",
      );
    });
  });

  describe("device code flow — device code request fails", () => {
    it("throws when the device code endpoint returns a non-ok response", async () => {
      const deps = makeDeps({
        loadTokens: mock(() => null),
        fetch: mock(() =>
          Promise.resolve(
            makeResponse(
              { error_description: "Invalid client" },
              { ok: false, status: 400, statusText: "Bad Request" },
            ),
          ),
        ),
      });

      await expect(getM365AccessToken(CREDS, () => {}, deps)).rejects.toThrow(
        "Device code request failed: Invalid client",
      );
    });
  });

  describe("progress events", () => {
    describe("fires device-code-prompt and auth-waiting events during device code flow", () => {
      const deviceCodeResponse = makeResponse({
        device_code: "dev-code",
        user_code: "ABC-123",
        verification_uri: "https://microsoft.com/devicelogin",
        interval: 5,
        expires_in: 900,
      });
      const tokenSuccessResponse = makeResponse({
        access_token: "device-access-token",
        refresh_token: "device-refresh-token",
        expires_in: 3600,
      });

      let fetchCallCount = 0;
      const events = [];
      const deps = makeDeps({
        loadTokens: mock(() => null),
        fetch: mock(() => {
          fetchCallCount++;
          if (fetchCallCount === 1) return Promise.resolve(deviceCodeResponse);
          return Promise.resolve(tokenSuccessResponse);
        }),
      });

      beforeAll(async () => {
        await getM365AccessToken(CREDS, (event) => events.push(event), deps);
      });

      it("fires device-code-prompt event", async () => {
        const types = events.map((e) => e.type);
        expect(types).toContain("device-code-prompt");
      });

      it("fires auth-waiting event", async () => {
        const types = events.map((e) => e.type);
        expect(types).toContain("auth-waiting");
      });
    });

    it("fires auth-success event on successful device code completion", async () => {
      const deviceCodeResponse = makeResponse({
        device_code: "dev-code",
        user_code: "ABC-123",
        verification_uri: "https://microsoft.com/devicelogin",
        interval: 5,
        expires_in: 900,
      });
      const tokenSuccessResponse = makeResponse({
        access_token: "device-access-token",
        refresh_token: "device-refresh-token",
        expires_in: 3600,
      });

      let fetchCallCount = 0;
      const events = [];
      const deps = makeDeps({
        loadTokens: mock(() => null),
        fetch: mock(() => {
          fetchCallCount++;
          if (fetchCallCount === 1) return Promise.resolve(deviceCodeResponse);
          return Promise.resolve(tokenSuccessResponse);
        }),
      });

      await getM365AccessToken(CREDS, (event) => events.push(event), deps);

      const types = events.map((e) => e.type);
      expect(types).toContain("auth-success");
    });

    describe("fires device-code-prompt with the correct verificationUri and userCode", () => {
      const deviceCodeResponse = makeResponse({
        device_code: "dev-code",
        user_code: "ABC-123",
        verification_uri: "https://microsoft.com/devicelogin",
        interval: 5,
        expires_in: 900,
      });
      const tokenSuccessResponse = makeResponse({
        access_token: "device-access-token",
        refresh_token: "device-refresh-token",
        expires_in: 3600,
      });

      let fetchCallCount = 0;
      const events = [];
      const deps = makeDeps({
        loadTokens: mock(() => null),
        fetch: mock(() => {
          fetchCallCount++;
          if (fetchCallCount === 1) return Promise.resolve(deviceCodeResponse);
          return Promise.resolve(tokenSuccessResponse);
        }),
      });

      beforeAll(async () => {
        await getM365AccessToken(CREDS, (event) => events.push(event), deps);
      });

      it("verificationUri matches", async () => {
        const promptEvent = events.find((e) => e.type === "device-code-prompt");
        expect(promptEvent?.verificationUri).toBe("https://microsoft.com/devicelogin");
      });

      it("userCode matches", async () => {
        const promptEvent = events.find((e) => e.type === "device-code-prompt");
        expect(promptEvent?.userCode).toBe("ABC-123");
      });
    });

    it("fires token-refresh-failed progress event when refresh fails", async () => {
      const expired = makeExpiredToken();
      const refreshFail = makeResponse(
        { error_description: "Token expired" },
        { ok: false, status: 400, statusText: "Bad Request" },
      );
      const deviceCodeResponse = makeResponse({
        device_code: "dev-code",
        user_code: "USER-CODE",
        verification_uri: "https://microsoft.com/devicelogin",
        interval: 5,
        expires_in: 900,
      });
      const tokenSuccessResponse = makeResponse({
        access_token: "device-access-token",
        refresh_token: "device-refresh-token",
        expires_in: 3600,
      });

      let fetchCallCount = 0;
      const events = [];
      const deps = makeDeps({
        loadTokens: mock(() => expired),
        fetch: mock(() => {
          fetchCallCount++;
          if (fetchCallCount === 1) return Promise.resolve(refreshFail);
          if (fetchCallCount === 2) return Promise.resolve(deviceCodeResponse);
          return Promise.resolve(tokenSuccessResponse);
        }),
      });

      await getM365AccessToken(CREDS, (event) => events.push(event), deps);

      const failEvent = events.find((e) => e.type === "token-refresh-failed");
      expect(failEvent).toBeDefined();
    });
  });
});
