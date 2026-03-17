import { describe, it, expect } from "bun:test";
import { stampVersion, stripVersionInfo, parseInstalledVersion, compareSemver } from "../src/init.js";

describe("stampVersion", () => {
  it("inserts mailctl-version before closing frontmatter delimiter", () => {
    const content = "---\ndescription: test\n---\n\n# Body";
    const result = stampVersion(content, "0.7.0");

    expect(result).toBe("---\ndescription: test\nmailctl-version: 0.7.0\n---\n\n# Body");
  });

  it("returns content unchanged if no closing frontmatter delimiter", () => {
    const content = "No frontmatter here";
    const result = stampVersion(content, "0.7.0");

    expect(result).toBe("No frontmatter here");
  });
});

describe("stripVersionInfo", () => {
  it("removes the mailctl-version line from frontmatter", () => {
    const content = "---\ndescription: test\nmailctl-version: 0.7.0\n---\n\n# Body";
    const result = stripVersionInfo(content);

    expect(result).toBe("---\ndescription: test\n---\n\n# Body");
  });

  it("returns content unchanged if no version line present", () => {
    const content = "---\ndescription: test\n---\n\n# Body";
    const result = stripVersionInfo(content);

    expect(result).toBe(content);
  });
});

describe("parseInstalledVersion", () => {
  it("extracts the version string from frontmatter", () => {
    const content = "---\ndescription: test\nmailctl-version: 0.8.0\n---\n";
    const result = parseInstalledVersion(content);

    expect(result).toBe("0.8.0");
  });

  it("trims whitespace from the version", () => {
    const content = "---\nmailctl-version:  1.2.3  \n---\n";
    const result = parseInstalledVersion(content);

    expect(result).toBe("1.2.3");
  });

  it("returns null when no version field exists", () => {
    const content = "---\ndescription: test\n---\n";
    const result = parseInstalledVersion(content);

    expect(result).toBeNull();
  });
});

describe("compareSemver", () => {
  it("returns 0 for equal versions", () => {
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });

  it("returns -1 when first version is older (major)", () => {
    expect(compareSemver("0.7.0", "1.0.0")).toBe(-1);
  });

  it("returns 1 when first version is newer (major)", () => {
    expect(compareSemver("2.0.0", "1.0.0")).toBe(1);
  });

  it("returns -1 when first version is older (minor)", () => {
    expect(compareSemver("0.7.0", "0.8.0")).toBe(-1);
  });

  it("returns 1 when first version is newer (minor)", () => {
    expect(compareSemver("0.8.0", "0.7.0")).toBe(1);
  });

  it("returns -1 when first version is older (patch)", () => {
    expect(compareSemver("0.7.0", "0.7.1")).toBe(-1);
  });

  it("returns 1 when first version is newer (patch)", () => {
    expect(compareSemver("0.7.1", "0.7.0")).toBe(1);
  });
});
