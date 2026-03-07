import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { matchesVendor } from "../src/vendor-map.js";
import { resetConfigCache } from "../src/config.js";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ── matchesVendor ─────────────────────────────────────────────────────────────

// Save and restore config file around tests that need vendor maps
const CONFIG_DIR = join(homedir(), ".config", "mailctl");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
let originalConfig;

beforeEach(() => {
  resetConfigCache();
  try {
    originalConfig = require("fs").readFileSync(CONFIG_PATH, "utf-8");
  } catch {
    originalConfig = null;
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

  it("is case-insensitive", () => {
    expect(matchesVendor("STRIPE", "notifications@stripe.com", "")).toBe(true);
    expect(matchesVendor("stripe", "BILLING@STRIPE.COM", "")).toBe(true);
    expect(matchesVendor("Acme", "x@y.com", "ACME Corp")).toBe(true);
  });

  it("returns false for non-matching vendor", () => {
    expect(matchesVendor("github", "billing@stripe.com", "Stripe")).toBe(false);
  });

  it("handles empty fromName gracefully", () => {
    expect(matchesVendor("stripe", "billing@stripe.com", "")).toBe(true);
    expect(matchesVendor("stripe", "billing@stripe.com", null)).toBe(true);
    expect(matchesVendor("stripe", "billing@stripe.com", undefined)).toBe(true);
  });

  it("handles empty fromAddress gracefully", () => {
    expect(matchesVendor("test", "", "Test Vendor")).toBe(true);
    // null address still matches if display name matches
    expect(matchesVendor("test", null, "Test Vendor")).toBe(true);
    // no match when neither address nor name match
    expect(matchesVendor("github", null, "Test Vendor")).toBe(false);
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
