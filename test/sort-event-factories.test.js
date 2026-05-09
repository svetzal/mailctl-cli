import { describe, expect, it } from "bun:test";
import {
  accountStart,
  folderCreated,
  folderExists,
  moveDryRun,
  moved,
  scanComplete,
} from "../src/sort-event-factories.js";

describe("accountStart", () => {
  it("has type account-start", () => {
    expect(accountStart("TestAccount", "user@example.com").type).toBe("account-start");
  });

  it("has name field", () => {
    expect(accountStart("TestAccount", "user@example.com").name).toBe("TestAccount");
  });

  it("has user field", () => {
    expect(accountStart("TestAccount", "user@example.com").user).toBe("user@example.com");
  });
});

describe("folderExists", () => {
  it("has type folder-exists", () => {
    expect(folderExists("INBOX").type).toBe("folder-exists");
  });

  it("has folder field", () => {
    expect(folderExists("INBOX").folder).toBe("INBOX");
  });
});

describe("folderCreated", () => {
  it("has type folder-created", () => {
    expect(folderCreated("Business").type).toBe("folder-created");
  });

  it("has folder field", () => {
    expect(folderCreated("Business").folder).toBe("Business");
  });
});

describe("scanComplete", () => {
  it("has type scan-complete", () => {
    expect(scanComplete(10).type).toBe("scan-complete");
  });

  it("has count field", () => {
    expect(scanComplete(10).count).toBe(10);
  });
});

describe("moveDryRun", () => {
  it("has type move-dry-run", () => {
    expect(moveDryRun("->", 5, "Business").type).toBe("move-dry-run");
  });

  it("has icon field", () => {
    expect(moveDryRun("->", 5, "Business").icon).toBe("->");
  });

  it("has count field", () => {
    expect(moveDryRun("->", 5, "Business").count).toBe(5);
  });

  it("has label field", () => {
    expect(moveDryRun("->", 5, "Business").label).toBe("Business");
  });
});

describe("moved", () => {
  it("has type moved", () => {
    expect(moved("->", 3, "Personal").type).toBe("moved");
  });

  it("has icon field", () => {
    expect(moved("->", 3, "Personal").icon).toBe("->");
  });

  it("has count field", () => {
    expect(moved("->", 3, "Personal").count).toBe(3);
  });

  it("has label field", () => {
    expect(moved("->", 3, "Personal").label).toBe("Personal");
  });
});
