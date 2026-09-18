import { beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { resetConfigCache } from "../src/config.js";
import { buildFilename, getVendorNames, vendorName } from "../src/downloader.js";

beforeEach(() => {
  resetConfigCache();
});

describe("vendorName", () => {
  it("returns cleaned sender name for unknown address with a display name", () => {
    const name = vendorName("billing@unknown-vendor.com", "Unknown Vendor Inc.");
    expect(name).toBe("Unknown Vendor");
  });

  it("strips LLC suffix from sender name", () => {
    const name = vendorName("hello@acme.com", "Acme LLC");
    expect(name).toBe("Acme");
  });

  it("strips Ltd. suffix from sender name", () => {
    const name = vendorName("billing@widgets.com", "Widgets Ltd.");
    expect(name).toBe("Widgets");
  });

  it("strips 'via Stripe' from sender name", () => {
    const name = vendorName("billing@stripe.com", "Acme Corp via Stripe");
    expect(name).toBe("Acme");
  });

  it("falls back to local part of email when no sender name and not in map", () => {
    const name = vendorName("orders@unknownshop.com", "");
    expect(name).toBe("orders");
  });

  it("truncates name at word boundary when longer than 30 chars", () => {
    const longName = "A Very Long Company Name That Exceeds Thirty Characters";
    const name = vendorName("billing@long.com", longName);
    expect(name.length).toBeLessThanOrEqual(30);
  });

  it("getVendorNames returns an object", () => {
    const names = getVendorNames();
    expect(typeof names).toBe("object");
  });
});

describe("buildFilename", () => {
  // buildFilename dates files by the local calendar date, so fixtures are built
  // with the local-time Date constructor (month is 0-based) to stay TZ-independent.
  it("formats as 'Vendor YYYY-MM-DD.pdf' for a Date object", () => {
    const date = new Date(2025, 2, 15);
    const filename = buildFilename("Acme", date, null, new Set());
    expect(filename).toBe("Acme 2025-03-15.pdf");
  });

  it("formats correctly from a local date-time string", () => {
    const filename = buildFilename("Zoom", "2024-11-01T12:00:00", null, new Set());
    expect(filename).toBe("Zoom 2024-11-01.pdf");
  });

  it("uses provided vendor name verbatim", () => {
    const filename = buildFilename("JetBrains", new Date(2025, 0, 20), null, new Set());
    expect(filename).toBe("JetBrains 2025-01-20.pdf");
  });

  it("appends _2 suffix when base filename is already in existingFiles", () => {
    const existing = new Set(["acme 2025-03-15.pdf"]);
    const filename = buildFilename("Acme", new Date(2025, 2, 15), null, existing);
    expect(filename).toBe("Acme 2025-03-15_2.pdf");
  });

  it("appends _3 suffix when both _2 are taken", () => {
    const existing = new Set(["acme 2025-03-15.pdf", "acme 2025-03-15_2.pdf"]);
    const filename = buildFilename("Acme", new Date(2025, 2, 15), null, existing);
    expect(filename).toBe("Acme 2025-03-15_3.pdf");
  });

  it("returns base filename when existingFiles is empty", () => {
    const filename = buildFilename("Vendor", new Date(2025, 5, 1), "invoice.pdf", new Set());
    expect(filename).toBe("Vendor 2025-06-01.pdf");
  });

  it("pads single-digit month and day with leading zero", () => {
    const filename = buildFilename("Test", new Date(2025, 0, 5), null, new Set());
    expect(filename).toBe("Test 2025-01-05.pdf");
  });

  describe("for an instant that falls on different calendar dates by time zone", () => {
    // 2025-03-15 02:00 UTC is still Mar 14 (22:00) in Toronto but already Mar 15 (11:00) in Tokyo.
    const instant = "2025-03-15T02:00:00Z";
    const modulePath = join(import.meta.dir, "../src/download-filename.js");

    /**
     * Runs buildFilename in a child process because a process only reliably
     * picks up its time zone from TZ at startup.
     * @param {string} timeZone
     * @returns {string}
     */
    function filenameIn(timeZone) {
      const script = `const { buildFilename } = await import(${JSON.stringify(modulePath)});
        process.stdout.write(buildFilename("Acme", new Date(${JSON.stringify(instant)}), null, new Set()));`;
      const child = Bun.spawnSync([process.execPath, "-e", script], { env: { ...process.env, TZ: timeZone } });
      return child.stdout.toString();
    }

    it("uses the Toronto local date when running in America/Toronto", () => {
      expect(filenameIn("America/Toronto")).toBe("Acme 2025-03-14.pdf");
    });

    it("uses the Tokyo local date when running in Asia/Tokyo", () => {
      expect(filenameIn("Asia/Tokyo")).toBe("Acme 2025-03-15.pdf");
    });
  });
});
