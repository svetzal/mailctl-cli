import { describe, expect, it } from "bun:test";
import { buildInitJson, formatInitText } from "../src/format-init.js";

/** @type {import("../src/format-init.js").InitFormatInput} */
const baseResult = {
  version: "1.2.3",
  global: false,
  files: [{ path: ".claude/skills/mailctl/SKILL.md", action: "created" }],
};

// ── formatInitText ──────────────────────────────────────────────────────

describe("formatInitText", () => {
  it("shows the version in the header", () => {
    const text = formatInitText(baseResult);

    expect(text).toContain("mailctl v1.2.3");
  });

  it("shows 'global (~/.claude)' scope when global is true", () => {
    const text = formatInitText({ ...baseResult, global: true });

    expect(text).toContain("global (~/.claude)");
  });

  it("shows 'local' scope when global is false", () => {
    const text = formatInitText(baseResult);

    expect(text).toContain("local");
  });

  it("shows '+' icon and 'Created' label for created files", () => {
    const text = formatInitText(baseResult);

    expect(text).toContain("+ .claude/skills/mailctl/SKILL.md (Created)");
  });

  it("shows '~' icon and 'Updated' label for updated files", () => {
    /** @type {import("../src/format-init.js").InitFormatInput} */
    const result = { ...baseResult, files: [{ path: "SKILL.md", action: "updated" }] };
    const text = formatInitText(result);

    expect(text).toContain("~ SKILL.md (Updated)");
  });

  it("shows '!' icon and 'Skipped' label for skipped files", () => {
    /** @type {import("../src/format-init.js").InitFormatInput} */
    const result = { ...baseResult, files: [{ path: "SKILL.md", action: "skipped" }] };
    const text = formatInitText(result);

    expect(text).toContain("! SKILL.md (Skipped)");
  });

  it("shows '=' icon and 'Up to date' label for unknown action", () => {
    /** @type {import("../src/format-init.js").InitFormatInput} */
    const result = { ...baseResult, files: [{ path: "SKILL.md", action: "up-to-date" }] };
    const text = formatInitText(result);

    expect(text).toContain("= SKILL.md (Up to date)");
  });

  it("shows the file path in each line", () => {
    const text = formatInitText(baseResult);

    expect(text).toContain(".claude/skills/mailctl/SKILL.md");
  });

  it("shows a warning indented below the file when warning is present", () => {
    /** @type {import("../src/format-init.js").InitFormatInput} */
    const result = { ...baseResult, files: [{ path: "SKILL.md", action: "skipped", warning: "Version mismatch" }] };
    const text = formatInitText(result);

    expect(text).toContain("    Version mismatch");
  });

  it("does not show a warning line when warning is absent", () => {
    const text = formatInitText(baseResult);

    expect(text).not.toContain("    ");
  });
});

// ── buildInitJson ───────────────────────────────────────────────────────

describe("buildInitJson", () => {
  it("returns success: true when no files are skipped", () => {
    const output = buildInitJson(baseResult);

    expect(output.success).toBe(true);
  });

  it("returns success: false when files are skipped", () => {
    /** @type {import("../src/format-init.js").InitFormatInput} */
    const skippedResult = { ...baseResult, files: [{ path: "SKILL.md", action: "skipped" }] };
    const output = buildInitJson(skippedResult);

    expect(output.success).toBe(false);
  });

  it("returns 'Skill install skipped' message when files are skipped", () => {
    /** @type {import("../src/format-init.js").InitFormatInput} */
    const skippedResult = { ...baseResult, files: [{ path: "SKILL.md", action: "skipped" }] };
    const output = buildInitJson(skippedResult);

    expect(output.message).toBe("Skill install skipped");
  });

  it("returns the version in the output", () => {
    const output = buildInitJson(baseResult);

    expect(output.version).toBe("1.2.3");
  });

  it("returns the files array in the output", () => {
    const output = buildInitJson(baseResult);

    expect(output.files).toBe(baseResult.files);
  });
});
