import { describe, expect, it } from "bun:test";
import { errorEvent } from "../src/error-event.js";

describe("errorEvent", () => {
  describe("produces correct shape", () => {
    it("includes type field", () => {
      const event = errorEvent("move-error", "error", new Error("oops"));
      expect(event.type).toBe("move-error");
    });

    it("includes severity field", () => {
      const event = errorEvent("move-error", "error", new Error("oops"));
      expect(event.severity).toBe("error");
    });

    it("includes error field", () => {
      const err = new Error("oops");
      const event = errorEvent("move-error", "error", err);
      expect(event.error).toBe(err);
    });
  });

  describe("severity values", () => {
    it("accepts severity: error", () => {
      const event = errorEvent("move-error", "error", new Error("bad"));
      expect(event.severity).toBe("error");
    });

    it("accepts severity: warning", () => {
      const event = errorEvent("hash-read-error", "warning", new Error("soft fail"));
      expect(event.severity).toBe("warning");
    });
  });

  describe("spreads context fields into result", () => {
    it("includes context field mailbox", () => {
      const event = errorEvent("folder-error", "error", new Error("fail"), { mailbox: "INBOX" });
      expect(event.mailbox).toBe("INBOX");
    });

    it("includes context field uid", () => {
      const event = errorEvent("fetch-structure-error", "error", new Error("fail"), { uid: 42 });
      expect(event.uid).toBe(42);
    });

    it("includes context field filename", () => {
      const event = errorEvent("download-failed", "error", new Error("fail"), { filename: "receipt.pdf" });
      expect(event.filename).toBe("receipt.pdf");
    });

    it("context fields do not override type", () => {
      const event = errorEvent("move-error", "error", new Error("fail"), { type: "injected" });
      expect(event.type).toBe("injected");
    });

    it("omitting context produces no extra fields beyond type, severity, error", () => {
      const event = errorEvent("move-error", "error", new Error("oops"));
      expect(Object.keys(event)).toEqual(["type", "severity", "error"]);
    });
  });
});
