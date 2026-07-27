import { describe, expect, it } from "bun:test";
import { truncateAtTokenBoundary } from "../src/truncate-name.js";

describe("truncateAtTokenBoundary", () => {
  it("returns the value unchanged when it is within the limit", () => {
    expect(truncateAtTokenBoundary("short", 30)).toBe("short");
  });

  it("backs off to the last hyphen boundary past the midpoint", () => {
    const value = "Aaaaaaaaaaaaaa-Bbbbbbbbbbbbbbb-Ccccccccccccccc";
    const result = truncateAtTokenBoundary(value, 30);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toBe("Aaaaaaaaaaaaaa-Bbbbbbbbbbbbbbb");
  });

  it("backs off to the last underscore boundary past the midpoint", () => {
    const value = "Aaaaaaaaaaaaaa_Bbbbbbbbbbbbbbb_Ccccccccccccccc";
    const result = truncateAtTokenBoundary(value, 30);
    expect(result).toBe("Aaaaaaaaaaaaaa_Bbbbbbbbbbbbbbb");
  });

  it("backs off to the last space boundary past the midpoint", () => {
    const value = "A Very Long Company Name For Testing";
    const result = truncateAtTokenBoundary(value, 30);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toBe("A Very Long Company Name For");
  });

  it("hard-cuts a single token longer than maxLength instead of emptying it", () => {
    const value = "A".repeat(70);
    const result = truncateAtTokenBoundary(value, 60);
    expect(result.length).toBe(60);
  });

  it("strips trailing separators after truncation", () => {
    const value = `${"A".repeat(29)}-${"B".repeat(29)}`;
    const result = truncateAtTokenBoundary(value, 29);
    expect(result.endsWith("-")).toBe(false);
  });
});
