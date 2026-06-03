import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { existsSync } from "node:fs";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEditor(execSyncFn = () => {}) {
  mock.module("node:child_process", () => ({
    execSync: execSyncFn,
  }));
  const { EditorGateway } = require("../../src/gateways/editor-gateway.js");
  return new EditorGateway();
}

// Save and restore VISUAL/EDITOR around every test so they don't bleed across.
let savedVisual;
let savedEditor;

beforeEach(() => {
  savedVisual = process.env.VISUAL;
  savedEditor = process.env.EDITOR;
  delete process.env.VISUAL;
  delete process.env.EDITOR;
});

afterEach(() => {
  mock.restore();
  if (savedVisual !== undefined) {
    process.env.VISUAL = savedVisual;
  } else {
    delete process.env.VISUAL;
  }
  if (savedEditor !== undefined) {
    process.env.EDITOR = savedEditor;
  } else {
    delete process.env.EDITOR;
  }
});

// ── editTempFile ──────────────────────────────────────────────────────────────

describe("EditorGateway editTempFile", () => {
  it("uses VISUAL when VISUAL is set", () => {
    process.env.VISUAL = "myvisualeditor";
    const commands = [];
    const gateway = makeEditor((cmd) => commands.push(cmd));

    gateway.editTempFile("content");

    expect(commands[0]).toMatch(/^myvisualeditor /);
  });

  it("uses EDITOR when only EDITOR is set", () => {
    process.env.EDITOR = "myeditor";
    const commands = [];
    const gateway = makeEditor((cmd) => commands.push(cmd));

    gateway.editTempFile("content");

    expect(commands[0]).toMatch(/^myeditor /);
  });

  it("falls back to vi when neither VISUAL nor EDITOR is set", () => {
    const commands = [];
    const gateway = makeEditor((cmd) => commands.push(cmd));

    gateway.editTempFile("content");

    expect(commands[0]).toMatch(/^vi /);
  });

  it("captures exactly one temp file path", () => {
    const paths = /** @type {string[]} */ ([]);
    const gateway = makeEditor((cmd) => {
      const match = cmd.match(/"([^"]+)"/);
      if (match) paths.push(match[1]);
    });

    gateway.editTempFile("initial content");

    expect(paths).toHaveLength(1);
  });

  it("deletes the temp file after editing", () => {
    const paths = /** @type {string[]} */ ([]);
    const gateway = makeEditor((cmd) => {
      const match = cmd.match(/"([^"]+)"/);
      if (match) paths.push(match[1]);
    });

    gateway.editTempFile("initial content");

    expect(existsSync(paths[0])).toBe(false);
  });
});
