import { describe, expect, it } from "bun:test";
import { scanAccountComplete, scanAccountStart } from "../src/scan-event-factories.js";

describe("scanAccountStart", () => {
  it("builds the scan-account-start event", () => {
    expect(scanAccountStart("TestAccount", "user@example.com")).toEqual({
      type: "scan-account-start",
      name: "TestAccount",
      user: "user@example.com",
    });
  });
});

describe("scanAccountComplete", () => {
  it("builds the scan-account-complete event", () => {
    expect(scanAccountComplete("TestAccount", 42)).toEqual({
      type: "scan-account-complete",
      name: "TestAccount",
      count: 42,
    });
  });
});
