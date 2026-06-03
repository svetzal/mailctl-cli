import { describe, expect, it } from "bun:test";
import {
  accountStart,
  folderCreated,
  folderError,
  folderExists,
  moveDryRun,
  moved,
  moveError,
  scanComplete,
} from "../src/sort-event-factories.js";

describe("accountStart", () => {
  it("builds the account-start event", () => {
    expect(accountStart("TestAccount", "user@example.com")).toEqual({
      type: "account-start",
      name: "TestAccount",
      user: "user@example.com",
    });
  });
});

describe("folderExists", () => {
  it("builds the folder-exists event", () => {
    expect(folderExists("INBOX")).toEqual({
      type: "folder-exists",
      folder: "INBOX",
    });
  });
});

describe("folderCreated", () => {
  it("builds the folder-created event", () => {
    expect(folderCreated("Business")).toEqual({
      type: "folder-created",
      folder: "Business",
    });
  });
});

describe("folderError", () => {
  it("builds the folder-error event", () => {
    const err = new Error("failed");
    expect(folderError(err, "Business")).toEqual({
      type: "folder-error",
      severity: "error",
      error: err,
      folder: "Business",
    });
  });
});

describe("scanComplete", () => {
  it("builds the scan-complete event", () => {
    expect(scanComplete(10)).toEqual({
      type: "scan-complete",
      count: 10,
    });
  });
});

describe("moveDryRun", () => {
  it("builds the move-dry-run event", () => {
    expect(moveDryRun("->", 5, "Business")).toEqual({
      type: "move-dry-run",
      icon: "->",
      count: 5,
      label: "Business",
    });
  });
});

describe("moveError", () => {
  it("builds the move-error event", () => {
    const err = new Error("failed");
    expect(moveError(err, "INBOX → Business")).toEqual({
      type: "move-error",
      severity: "error",
      error: err,
      label: "INBOX → Business",
    });
  });
});

describe("moved", () => {
  it("builds the moved event", () => {
    expect(moved("->", 3, "Personal")).toEqual({
      type: "moved",
      icon: "->",
      count: 3,
      label: "Personal",
    });
  });
});
