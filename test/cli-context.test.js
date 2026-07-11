import { describe, expect, it, mock } from "bun:test";
import { Command } from "commander";
import { createCliContext } from "../src/cli-context.js";

const FAKE_ACCOUNTS = [{ name: "Test", host: "imap.example.com" }];

function makeCtx(overrides = {}) {
  const program = new Command();
  const requireAccounts = mock(() => FAKE_ACCOUNTS);
  return {
    ctx: createCliContext({ getGlobalOpts: () => program.opts(), requireAccounts }),
    program,
    requireAccounts,
    ...overrides,
  };
}

describe("createCliContext", () => {
  describe("mutating()", () => {
    it("adds a visible --apply option", () => {
      const { ctx } = makeCtx();
      const cmd = ctx.mutating(new Command("test"));
      const applyOpt = cmd.options.find((o) => o.long === "--apply");
      expect(applyOpt).toBeDefined();
    });

    it("sets --apply default to false", () => {
      const { ctx } = makeCtx();
      const cmd = ctx.mutating(new Command("test"));
      const applyOpt = cmd.options.find((o) => o.long === "--apply");
      expect(applyOpt?.defaultValue).toBe(false);
    });

    it("adds a hidden --dry-run option", () => {
      const { ctx } = makeCtx();
      const cmd = ctx.mutating(new Command("test"));
      const dryRunOpt = cmd.options.find((o) => o.long === "--dry-run");
      expect(dryRunOpt).toBeDefined();
      expect(dryRunOpt?.hidden).toBe(true);
    });
  });

  describe("progress()", () => {
    it("returns a function", () => {
      const { ctx } = makeCtx();
      const renderer = ctx.progress(mock(() => null));
      expect(typeof renderer).toBe("function");
    });
  });

  describe("contextDeps", () => {
    it("exposes requireAccounts on contextDeps", () => {
      const { ctx, requireAccounts } = makeCtx();
      expect(ctx.contextDeps.requireAccounts).toBe(requireAccounts);
    });
  });
});
