import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Command } from "commander";
import { registerMutationCommands } from "../../src/cli/mutation-cli.js";
import { createCliContext } from "../../src/cli-context.js";

const FAKE_ACCOUNTS = [{ name: "Test", host: "imap.example.com" }];

function makeCtx() {
  const program = new Command();
  program.option("--account <name>").option("--json");
  const ctx = createCliContext({
    getGlobalOpts: () => program.opts(),
    requireAccounts: mock(() => FAKE_ACCOUNTS),
  });
  return { program, ctx };
}

function makeDeps(overrides = {}) {
  return {
    moveCommand: mock(async () => ({ stats: {}, results: [] })),
    flagCommand: mock(async () => ({ stats: {}, results: [] })),
    replyCommand: mock(async () => ({ sent: true })),
    formatMoveOutput: mock(() => "move"),
    formatFlagOutput: mock(() => "flag"),
    formatReplyOutput: mock(() => "reply"),
    forEachAccount: mock(async () => {}),
    listMailboxes: mock(async () => []),
    simpleParser: mock(async () => ({})),
    _fs: {},
    smtpGateway: {},
    editorGateway: {},
    confirmGateway: {},
    ...overrides,
  };
}

describe("registerMutationCommands", () => {
  let consoleLog;
  let consoleError;

  beforeEach(() => {
    consoleLog = spyOn(console, "log").mockImplementation(() => {});
    consoleError = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLog.mockRestore();
    consoleError.mockRestore();
  });

  // ── plan/apply model ─────────────────────────────────────────────────────────

  describe("plan/apply model", () => {
    it("move previews by default (dryRun true)", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerMutationCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "move", "42", "--to", "Archive"]);

      expect(deps.moveCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ dryRun: true }),
        expect.anything(),
      );
    });

    it("move executes with --apply (dryRun false)", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerMutationCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "move", "42", "--to", "Archive", "--apply"]);

      expect(deps.moveCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ dryRun: false }),
        expect.anything(),
      );
    });

    it("legacy --dry-run still forces preview even with --apply", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerMutationCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "flag", "42", "--read", "--apply", "--dry-run"]);

      expect(deps.flagCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ dryRun: true }),
        expect.anything(),
      );
    });
  });

  // ── reply — injected gateways ────────────────────────────────────────────────

  describe("reply command", () => {
    it("uses the injected smtpGateway from deps (not constructing its own)", async () => {
      const { program, ctx } = makeCtx();
      const smtpGateway = { send: mock(async () => {}) };
      const deps = makeDeps({ smtpGateway });
      registerMutationCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "reply", "42"]);

      // replyCommand receives the smtpGateway from deps
      expect(deps.replyCommand).toHaveBeenCalledWith("42", expect.anything(), expect.objectContaining({ smtpGateway }));
    });

    it("uses the injected editorGateway from deps", async () => {
      const { program, ctx } = makeCtx();
      const editorGateway = { edit: mock(async () => "reply text") };
      const deps = makeDeps({ editorGateway });
      registerMutationCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "reply", "42"]);

      expect(deps.replyCommand).toHaveBeenCalledWith(
        "42",
        expect.anything(),
        expect.objectContaining({ editorGateway }),
      );
    });

    it("writes 'Aborted.' to console.error when replyCommand returns aborted result", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps({ replyCommand: mock(async () => ({ aborted: true })) });
      registerMutationCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "reply", "42"]);

      expect(consoleError).toHaveBeenCalledWith("Aborted.");
      expect(deps.formatReplyOutput).not.toHaveBeenCalled();
    });

    it("calls formatReplyOutput when reply is not aborted", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps({ replyCommand: mock(async () => ({ sent: true })) });
      registerMutationCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "reply", "42"]);

      expect(deps.formatReplyOutput).toHaveBeenCalled();
    });
  });

  // ── emitPlanHint ─────────────────────────────────────────────────────────────

  describe("plan hint", () => {
    it("emits plan hint to stderr on move preview", async () => {
      const { program, ctx } = makeCtx();
      const deps = makeDeps();
      registerMutationCommands(program, ctx, deps);
      await program.parseAsync(["node", "mailctl", "move", "42", "--to", "Archive"]);

      const stderrOutput = consoleError.mock.calls.map((c) => c[0]).join("\n");
      expect(stderrOutput).toContain("--apply");
    });
  });
});
