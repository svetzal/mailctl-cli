import { describe, expect, it } from "bun:test";
import { buildInitJson, formatInitText } from "../src/format-init.js";

/** @type {import("../src/format-init.js").InitFormatInput} */
const baseResult = {
  version: "1.3.0",
  scope: "global",
  targets: [
    { platform: "claude", action: "install" },
    { platform: "codex", action: "install" },
    { platform: "hermes", action: "install" },
  ],
};

// ── formatInitText ──────────────────────────────────────────────────────

describe("formatInitText", () => {
  it("shows the version in the header", () => {
    expect(formatInitText(baseResult)).toContain("mailctl v1.3.0");
  });

  it("shows global scope when scope is global", () => {
    expect(formatInitText(baseResult)).toContain("global");
  });

  it("shows local scope when scope is local", () => {
    expect(formatInitText({ ...baseResult, scope: "local" })).toContain("local");
  });

  it("lists every target platform", () => {
    const text = formatInitText(baseResult);

    expect(text).toContain("claude");
    expect(text).toContain("codex");
    expect(text).toContain("hermes");
  });

  it("shows '+' icon and 'Installed' label for install", () => {
    expect(formatInitText(baseResult)).toContain("+ claude (Installed)");
  });

  it("shows '~' icon and 'Updated' label for update", () => {
    /** @type {import("../src/format-init.js").InitFormatInput} */
    const result = { ...baseResult, targets: [{ platform: "codex", action: "update" }] };

    expect(formatInitText(result)).toContain("~ codex (Updated)");
  });

  it("shows '=' icon and 'Up to date' label for skip", () => {
    /** @type {import("../src/format-init.js").InitFormatInput} */
    const result = { ...baseResult, targets: [{ platform: "hermes", action: "skip" }] };

    expect(formatInitText(result)).toContain("= hermes (Up to date)");
  });

  it("shows '!' icon for a refused newer install", () => {
    /** @type {import("../src/format-init.js").InitFormatInput} */
    const result = { ...baseResult, targets: [{ platform: "claude", action: "refuse-newer" }] };

    expect(formatInitText(result)).toContain("! claude (Skipped (newer installed))");
  });

  it("shows a warning indented below the platform when present", () => {
    /** @type {import("../src/format-init.js").InitFormatInput} */
    const result = {
      ...baseResult,
      targets: [{ platform: "claude", action: "refuse-newer", warning: "Version mismatch" }],
    };

    expect(formatInitText(result)).toContain("    Version mismatch");
  });

  it("notes when no target platforms resolve", () => {
    expect(formatInitText({ ...baseResult, targets: [] })).toContain("No target platforms resolved");
  });
});

// ── buildInitJson ───────────────────────────────────────────────────────

describe("buildInitJson", () => {
  it("returns success: true when nothing is blocked", () => {
    expect(buildInitJson(baseResult).success).toBe(true);
  });

  it("returns success: false when a target is refused", () => {
    /** @type {import("../src/format-init.js").InitFormatInput} */
    const result = {
      ...baseResult,
      targets: [{ platform: "claude", action: "refuse-newer" }],
    };

    expect(buildInitJson(result).success).toBe(false);
  });

  it("reports the skipped-platform count when blocked", () => {
    /** @type {import("../src/format-init.js").InitFormatInput} */
    const result = {
      ...baseResult,
      targets: [
        { platform: "claude", action: "install" },
        { platform: "codex", action: "drifted-skip" },
      ],
    };

    expect(buildInitJson(result).message).toContain("skipped on 1");
  });

  it("returns the version, scope, and targets in the output", () => {
    const output = buildInitJson(baseResult);

    expect(output.version).toBe("1.3.0");
    expect(output.scope).toBe("global");
    expect(output.targets).toBe(baseResult.targets);
  });
});
