import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemGateway } from "../../src/gateways/fs-gateway.js";

const TEST_BASE = join(tmpdir(), `fs-gateway-test-${process.pid}`);

beforeAll(() => {
  mkdirSync(TEST_BASE, { recursive: true });
});

afterAll(() => {
  rmSync(TEST_BASE, { recursive: true, force: true });
});

// ── readJson / writeJson ──────────────────────────────────────────────────────

describe("FileSystemGateway readJson / writeJson", () => {
  it("round-trips a JSON object through the filesystem", () => {
    const gateway = new FileSystemGateway();
    const path = join(TEST_BASE, "roundtrip.json");
    const data = { name: "test", count: 42, nested: { ok: true } };

    gateway.writeJson(path, data);

    expect(gateway.readJson(path)).toEqual(data);
  });

  it("throws when reading malformed JSON", () => {
    const gateway = new FileSystemGateway();
    const path = join(TEST_BASE, "bad.json");
    writeFileSync(path, "{ not: valid json }");

    expect(() => gateway.readJson(path)).toThrow();
  });
});

// ── mkdir ─────────────────────────────────────────────────────────────────────

describe("FileSystemGateway mkdir", () => {
  it("creates all intermediate directories recursively", () => {
    const gateway = new FileSystemGateway();
    const path = join(TEST_BASE, "a", "b", "c");

    gateway.mkdir(path);

    expect(existsSync(path)).toBe(true);
  });
});
