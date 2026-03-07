import { describe, it, expect } from "bun:test";
import { classifyMessage, planMoves, BIZ_FOLDER, PERSONAL_FOLDER } from "../src/sort-logic.js";

// ── constants ────────────────────────────────────────────────────────────────

describe("folder constants", () => {
  it("BIZ_FOLDER is Receipts/Business", () => {
    expect(BIZ_FOLDER).toBe("Receipts/Business");
  });

  it("PERSONAL_FOLDER is Receipts/Personal", () => {
    expect(PERSONAL_FOLDER).toBe("Receipts/Personal");
  });
});

// ── classifyMessage ───────────────────────────────────────────────────────────

describe("classifyMessage", () => {
  const classifications = {
    "billing@acme.com": "business",
    "family@home.com": "personal",
  };

  it("returns 'business' for a known business address", () => {
    expect(classifyMessage("billing@acme.com", classifications)).toBe("business");
  });

  it("returns 'personal' for a known personal address", () => {
    expect(classifyMessage("family@home.com", classifications)).toBe("personal");
  });

  it("returns 'unclassified' for an unknown address", () => {
    expect(classifyMessage("unknown@example.com", classifications)).toBe("unclassified");
  });

  it("returns 'unclassified' for an empty address", () => {
    expect(classifyMessage("", classifications)).toBe("unclassified");
  });
});

// ── planMoves ────────────────────────────────────────────────────────────────

describe("planMoves", () => {
  const classifications = {
    "billing@acme.com": "business",
    "family@home.com": "personal",
  };

  it("separates business and personal UIDs correctly", () => {
    const messages = [
      { uid: 1, address: "billing@acme.com" },
      { uid: 2, address: "family@home.com" },
    ];
    const { business, personal } = planMoves(messages, classifications);
    expect(business).toEqual([1]);
    expect(personal).toEqual([2]);
  });

  it("puts unclassified messages into personal", () => {
    const messages = [{ uid: 3, address: "unknown@example.com" }];
    const { business, personal } = planMoves(messages, classifications);
    expect(business).toEqual([]);
    expect(personal).toEqual([3]);
  });

  it("returns empty arrays for an empty message list", () => {
    const { business, personal } = planMoves([], classifications);
    expect(business).toEqual([]);
    expect(personal).toEqual([]);
  });

  it("handles all-business messages", () => {
    const messages = [
      { uid: 10, address: "billing@acme.com" },
      { uid: 11, address: "billing@acme.com" },
    ];
    const { business, personal } = planMoves(messages, classifications);
    expect(business).toEqual([10, 11]);
    expect(personal).toEqual([]);
  });

  it("handles all-personal messages", () => {
    const messages = [
      { uid: 20, address: "family@home.com" },
      { uid: 21, address: "another@unknown.com" },
    ];
    const { business, personal } = planMoves(messages, classifications);
    expect(business).toEqual([]);
    expect(personal).toEqual([20, 21]);
  });

  it("preserves uid ordering within each bucket", () => {
    const messages = [
      { uid: 5, address: "billing@acme.com" },
      { uid: 7, address: "billing@acme.com" },
      { uid: 9, address: "billing@acme.com" },
    ];
    const { business } = planMoves(messages, classifications);
    expect(business).toEqual([5, 7, 9]);
  });
});
