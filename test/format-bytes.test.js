import { describe, expect, it } from "bun:test";
import { formatKB } from "../src/format-bytes.js";

describe("formatKB", () => {
  it("formats 0 bytes as 0 KB", () => {
    expect(formatKB(0)).toBe("0 KB");
  });

  it("formats 1024 bytes as 1 KB", () => {
    expect(formatKB(1024)).toBe("1 KB");
  });

  it("formats 51200 bytes as 50 KB", () => {
    expect(formatKB(51200)).toBe("50 KB");
  });

  it("rounds 1536 bytes to 2 KB", () => {
    expect(formatKB(1536)).toBe("2 KB");
  });
});
