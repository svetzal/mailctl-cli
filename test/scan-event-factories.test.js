import { describe, expect, it } from "bun:test";
import { scanAccountComplete, scanAccountStart } from "../src/scan-event-factories.js";

describe("scanAccountStart", () => {
  it("has type scan-account-start", () => {
    expect(scanAccountStart("TestAccount", "user@example.com").type).toBe("scan-account-start");
  });

  it("has name field", () => {
    expect(scanAccountStart("TestAccount", "user@example.com").name).toBe("TestAccount");
  });

  it("has user field", () => {
    expect(scanAccountStart("TestAccount", "user@example.com").user).toBe("user@example.com");
  });
});

describe("scanAccountComplete", () => {
  it("has type scan-account-complete", () => {
    expect(scanAccountComplete("TestAccount", 42).type).toBe("scan-account-complete");
  });

  it("has name field", () => {
    expect(scanAccountComplete("TestAccount", 42).name).toBe("TestAccount");
  });

  it("has count field", () => {
    expect(scanAccountComplete("TestAccount", 42).count).toBe(42);
  });
});
