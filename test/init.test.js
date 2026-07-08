import { describe, expect, it } from "bun:test";
import { buildInitResult, warningFor } from "../src/init.js";

// Version stamping and the newer-install guard now live in cmx-core (verified in
// that package's own suite). mailctl only owns the mapping from cmx-core's plan
// targets to its own result shape — that's what these tests cover.

describe("warningFor", () => {
  it("warns with the installed version for refuse-newer", () => {
    const warning = warningFor({ kind: "refuse-newer", installed: "2.0.0" });

    expect(warning).toContain("2.0.0");
    expect(warning).toContain("--force");
  });

  it("warns about local edits for drifted-skip", () => {
    const warning = warningFor({ kind: "drifted-skip", installed: "1.3.0" });

    expect(warning).toContain("1.3.0");
    expect(warning).toContain("--force");
  });

  it("returns undefined for writing actions", () => {
    expect(warningFor({ kind: "install" })).toBeUndefined();
    expect(warningFor({ kind: "update", from: "1.2.0" })).toBeUndefined();
    expect(warningFor({ kind: "skip" })).toBeUndefined();
  });
});

describe("buildInitResult", () => {
  it("preserves platform order and maps action kinds", () => {
    const result = buildInitResult("1.3.0", "global", [
      { platform: "claude", action: { kind: "update", from: "1.2.0" } },
      { platform: "codex", action: { kind: "install" } },
      { platform: "hermes", action: { kind: "install" } },
    ]);

    expect(result.version).toBe("1.3.0");
    expect(result.scope).toBe("global");
    expect(result.targets.map((t) => t.platform)).toEqual(["claude", "codex", "hermes"]);
    expect(result.targets.map((t) => t.action)).toEqual(["update", "install", "install"]);
  });

  it("attaches a warning for blocked targets and omits it otherwise", () => {
    const result = buildInitResult("1.3.0", "global", [
      { platform: "claude", action: { kind: "install" } },
      { platform: "codex", action: { kind: "refuse-newer", installed: "1.4.0" } },
    ]);

    expect(result.targets[0].warning).toBeUndefined();
    expect(result.targets[1].warning).toContain("1.4.0");
  });

  it("handles an empty target list", () => {
    const result = buildInitResult("1.3.0", "local", []);

    expect(result.targets).toEqual([]);
    expect(result.scope).toBe("local");
  });
});
