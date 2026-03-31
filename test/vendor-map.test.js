import { afterEach, describe, expect, it, mock } from "bun:test";

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Register config.js mock and load vendor-map.js with the given maps.
 */
function makeVendorMap(addressMap = {}, domainMap = {}) {
  mock.module("../src/config.js", () => ({
    getConfigVendorAddressMap: () => addressMap,
    getConfigVendorDomainMap: () => domainMap,
  }));

  return require("../src/vendor-map.js");
}

afterEach(() => {
  mock.restore();
});

// ── getVendorFilenameNames ─────────────────────────────────────────────────────

describe("getVendorFilenameNames", () => {
  it("replaces spaces with hyphens in vendor name values", () => {
    const { getVendorFilenameNames } = makeVendorMap({ "billing@vendor.com": "Springer Nature" });

    expect(getVendorFilenameNames()).toEqual({ "billing@vendor.com": "Springer-Nature" });
  });

  it("preserves names that have no spaces", () => {
    const { getVendorFilenameNames } = makeVendorMap({ "pay@stripe.com": "Stripe" });

    expect(getVendorFilenameNames()).toEqual({ "pay@stripe.com": "Stripe" });
  });

  it("replaces multiple spaces in a single name", () => {
    const { getVendorFilenameNames } = makeVendorMap({ "x@y.com": "Acme Corp Ltd" });

    expect(getVendorFilenameNames()["x@y.com"]).toBe("Acme-Corp-Ltd");
  });

  it("returns an empty object when the address map is empty", () => {
    const { getVendorFilenameNames } = makeVendorMap({});

    expect(getVendorFilenameNames()).toEqual({});
  });

  it("preserves all address keys from the address map", () => {
    const { getVendorFilenameNames } = makeVendorMap({
      "a@a.com": "Alpha",
      "b@b.com": "Beta Corp",
    });
    const result = getVendorFilenameNames();

    expect(Object.keys(result)).toEqual(["a@a.com", "b@b.com"]);
  });
});

// ── getVendorDisplayNames ──────────────────────────────────────────────────────

describe("getVendorDisplayNames", () => {
  it("returns the raw address map with spaces intact", () => {
    const addressMap = { "billing@vendor.com": "Springer Nature" };
    const { getVendorDisplayNames } = makeVendorMap(addressMap);

    expect(getVendorDisplayNames()).toEqual({ "billing@vendor.com": "Springer Nature" });
  });

  it("returns an empty object when address map is empty", () => {
    const { getVendorDisplayNames } = makeVendorMap({});

    expect(getVendorDisplayNames()).toEqual({});
  });
});

// ── getVendorDomainMap ─────────────────────────────────────────────────────────

describe("getVendorDomainMap", () => {
  it("returns the domain map from config", () => {
    const domainMap = { "anthropic.com": "Anthropic", "stripe.com": "Stripe" };
    const { getVendorDomainMap } = makeVendorMap({}, domainMap);

    expect(getVendorDomainMap()).toEqual(domainMap);
  });

  it("returns an empty object when domain map is empty", () => {
    const { getVendorDomainMap } = makeVendorMap({}, {});

    expect(getVendorDomainMap()).toEqual({});
  });
});
