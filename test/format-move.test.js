import { describe, it, expect } from "bun:test";
import { formatMoveResultText } from "../src/format-move.js";

describe("formatMoveResultText", () => {
  it("formats a single account move summary", () => {
    const text = formatMoveResultText({ moved: 3, failed: 0, skipped: 0 });

    expect(text).toContain("3 moved");
    expect(text).toContain("0 failed");
    expect(text).toContain("0 skipped");
  });

  it("formats a multi-account move summary with failures", () => {
    const text = formatMoveResultText({ moved: 5, failed: 2, skipped: 0 });

    expect(text).toContain("5 moved");
    expect(text).toContain("2 failed");
  });

  it("formats a dry-run result with all messages skipped", () => {
    const text = formatMoveResultText({ moved: 0, failed: 0, skipped: 4 });

    expect(text).toContain("0 moved");
    expect(text).toContain("4 skipped");
    expect(text).toContain("(dry-run)");
  });
});
