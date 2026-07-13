import { describe, expect, it, mock } from "bun:test";
import { buildInitResult, initCommand, warningFor } from "../src/init.js";

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

// ── initCommand (imperative shell) ────────────────────────────────────────────

describe("initCommand", () => {
  /** @type {import("cmx-core").InstallerContext} */
  const fakeContext = /** @type {any} */ ({});

  function makeInstaller(targetList = []) {
    return {
      plan: mock(() => Promise.resolve({ targets: targetList })),
      apply: mock(() => Promise.resolve()),
    };
  }

  it("excludes refuse-newer targets from apply()", async () => {
    const installer = makeInstaller([
      { platform: "claude", action: { kind: "install" } },
      { platform: "codex", action: { kind: "refuse-newer", installed: "2.0.0" } },
    ]);

    await initCommand("1.0.0", { _installer: installer, _context: fakeContext });

    const applyCall = /** @type {any[]} */ (installer.apply.mock.calls)[0];
    const applyTargets = applyCall[1].targets;
    expect(applyTargets.map((/** @type {any} */ t) => t.platform)).toEqual(["claude"]);
  });

  it("still includes refuse-newer targets in the returned result", async () => {
    const installer = makeInstaller([
      { platform: "claude", action: { kind: "install" } },
      { platform: "codex", action: { kind: "refuse-newer", installed: "2.0.0" } },
    ]);

    const result = await initCommand("1.0.0", { _installer: installer, _context: fakeContext });

    expect(result.targets.map((t) => t.platform)).toEqual(["claude", "codex"]);
  });

  it("does not call apply() when all targets are refuse-newer", async () => {
    const installer = makeInstaller([{ platform: "claude", action: { kind: "refuse-newer", installed: "2.0.0" } }]);

    await initCommand("1.0.0", { _installer: installer, _context: fakeContext });

    expect(installer.apply).not.toHaveBeenCalled();
  });

  it("calls apply() once when there are writable targets", async () => {
    const installer = makeInstaller([{ platform: "claude", action: { kind: "install" } }]);

    await initCommand("1.0.0", { _installer: installer, _context: fakeContext });

    expect(installer.apply).toHaveBeenCalledTimes(1);
  });

  it("returns the version passed in", async () => {
    const installer = makeInstaller([]);

    const result = await initCommand("1.2.3", { _installer: installer, _context: fakeContext });

    expect(result.version).toBe("1.2.3");
  });

  it("returns global scope when local option is false", async () => {
    const installer = makeInstaller([]);

    const result = await initCommand("1.0.0", { local: false, _installer: installer, _context: fakeContext });

    expect(result.scope).toBe("global");
  });

  it("returns local scope when local option is true", async () => {
    const installer = makeInstaller([]);

    const result = await initCommand("1.0.0", { local: true, _installer: installer, _context: fakeContext });

    expect(result.scope).toBe("local");
  });
});
