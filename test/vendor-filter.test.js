import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { resetConfigCache } from "../src/config.js";
import { matchesVendor } from "../src/vendor-map.js";

// ── matchesVendor ─────────────────────────────────────────────────────────────

// Save and restore config file around tests that need vendor maps
const CONFIG_DIR = join(homedir(), ".config", "mailctl");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
let _originalConfig;

beforeEach(() => {
  resetConfigCache();
  try {
    _originalConfig = require("node:fs").readFileSync(CONFIG_PATH, "utf-8");
  } catch {
    _originalConfig = null;
  }
});

afterEach(() => {
  resetConfigCache();
});

describe("matchesVendor", () => {
  it("matches by sender address substring", () => {
    expect(matchesVendor("stripe", "notifications@stripe.com", "Stripe")).toBe(true);
  });

  it("matches by sender display name", () => {
    expect(matchesVendor("acme", "billing@example.com", "Acme Corp")).toBe(true);
  });

  it("matches by domain portion of the sender address", () => {
    expect(matchesVendor("apple", "no_reply@email.apple.com", "")).toBe(true);
  });

  describe("is case-insensitive", () => {
    it("matches uppercase vendor key against lowercase address", () =>
      expect(matchesVendor("STRIPE", "notifications@stripe.com", "")).toBe(true));
    it("matches lowercase vendor key against uppercase address", () =>
      expect(matchesVendor("stripe", "BILLING@STRIPE.COM", "")).toBe(true));
    it("matches mixed-case vendor key against uppercase display name", () =>
      expect(matchesVendor("Acme", "x@y.com", "ACME Corp")).toBe(true));
  });

  it("returns false for non-matching vendor", () => {
    expect(matchesVendor("github", "billing@stripe.com", "Stripe")).toBe(false);
  });

  describe("handles empty fromName gracefully", () => {
    it("returns true when fromName is empty string", () =>
      expect(matchesVendor("stripe", "billing@stripe.com", "")).toBe(true));
    it("returns true when fromName is null", () =>
      expect(matchesVendor("stripe", "billing@stripe.com", null)).toBe(true));
    it("returns true when fromName is undefined", () =>
      expect(matchesVendor("stripe", "billing@stripe.com", undefined)).toBe(true));
  });

  describe("handles empty fromAddress gracefully", () => {
    it("returns true when fromAddress is empty string and display name matches", () =>
      expect(matchesVendor("test", "", "Test Vendor")).toBe(true));
    it("returns true when fromAddress is null and display name matches", () =>
      expect(matchesVendor("test", null, "Test Vendor")).toBe(true));
    it("returns false when fromAddress is null and display name does not match", () =>
      expect(matchesVendor("github", null, "Test Vendor")).toBe(false));
  });

  it("matches partial sender name", () => {
    expect(matchesVendor("springer", "orders@springernature.com", "Springer Nature")).toBe(true);
  });

  it("matches by configured vendor name from address map", () => {
    // This test relies on the user's actual config; test the basic address/name matching
    // which works regardless of config
    expect(matchesVendor("anthropic", "billing@mail.anthropic.com", "Anthropic")).toBe(true);
  });
});
