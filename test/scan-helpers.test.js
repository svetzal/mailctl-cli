import { describe, expect, it } from "bun:test";
import { buildScanResult } from "../src/scan-helpers.js";

/** Build a minimal imapflow-style message with envelope. */
function makeMsg({
  uid = 1,
  from = [{ name: "Vendor", address: "billing@vendor.com" }],
  subject = "Receipt",
  date = new Date("2025-03-07"),
} = {}) {
  return { uid, envelope: { from, subject, date } };
}

describe("buildScanResult", () => {
  it("returns the account name", () => {
    const result = buildScanResult("My Account", "INBOX", makeMsg());
    expect(result.account).toBe("My Account");
  });

  it("returns the mailbox path", () => {
    const result = buildScanResult("Account", "Archive/2025", makeMsg());
    expect(result.mailbox).toBe("Archive/2025");
  });

  it("returns the message uid", () => {
    const result = buildScanResult("Account", "INBOX", makeMsg({ uid: 42 }));
    expect(result.uid).toBe(42);
  });

  it("formats the from address as 'Name <address>'", () => {
    const result = buildScanResult(
      "Account",
      "INBOX",
      makeMsg({
        from: [{ name: "Vendor Inc", address: "billing@vendor.com" }],
      }),
    );
    expect(result.from).toBe("Vendor Inc <billing@vendor.com>");
  });

  it("formats the from address without name when name is empty", () => {
    const result = buildScanResult(
      "Account",
      "INBOX",
      makeMsg({
        from: [{ name: "", address: "noreply@vendor.com" }],
      }),
    );
    expect(result.from).toBe("<noreply@vendor.com>");
  });

  it("normalises the address to lowercase", () => {
    const result = buildScanResult(
      "Account",
      "INBOX",
      makeMsg({
        from: [{ name: "Vendor", address: "Billing@Vendor.COM" }],
      }),
    );
    expect(result.address).toBe("billing@vendor.com");
  });

  it("returns the sender name", () => {
    const result = buildScanResult(
      "Account",
      "INBOX",
      makeMsg({
        from: [{ name: "Vendor Inc", address: "billing@vendor.com" }],
      }),
    );
    expect(result.name).toBe("Vendor Inc");
  });

  it("returns the subject", () => {
    const result = buildScanResult("Account", "INBOX", makeMsg({ subject: "Your invoice #123" }));
    expect(result.subject).toBe("Your invoice #123");
  });

  it("returns the date from the envelope", () => {
    const date = new Date("2025-06-01");
    const result = buildScanResult("Account", "INBOX", makeMsg({ date }));
    expect(result.date).toBe(date);
  });

  it("falls back to 'unknown' from address when from array is empty", () => {
    const result = buildScanResult("Account", "INBOX", makeMsg({ from: [] }));
    expect(result.from).toBe("unknown");
    expect(result.address).toBe("unknown");
    expect(result.name).toBe("");
  });

  it("falls back to empty subject when subject is undefined", () => {
    const msg = {
      uid: 1,
      envelope: { from: [{ name: "V", address: "v@v.com" }], subject: undefined, date: new Date() },
    };
    const result = buildScanResult("Account", "INBOX", msg);
    expect(result.subject).toBe("");
  });
});
