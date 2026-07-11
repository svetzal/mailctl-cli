import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Command } from "commander";
import { registerInitCommand } from "../../src/cli/init-cli.js";
import { createCliContext } from "../../src/cli-context.js";

const FAKE_ACCOUNTS = [{ name: "Test", host: "imap.example.com" }];

function makeCtx(versionStr = "1.3.0") {
  const program = new Command();
  program.option("--account <name>").option("--json").version(versionStr);
  const ctx = createCliContext({
    getGlobalOpts: () => program.opts(),
    requireAccounts: mock(() => FAKE_ACCOUNTS),
  });
  return { program, ctx };
}

function makeDeps(overrides = {}) {
  return {
    initCommand: mock(async () => ({ installed: true })),
    formatInitOutput: mock(() => "init-output"),
    ...overrides,
  };
}

describe("registerInitCommand", () => {
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

  it("passes the program version as the first argument to initCommand", async () => {
    const { program, ctx } = makeCtx("1.3.0");
    const deps = makeDeps();
    registerInitCommand(program, ctx, deps);
    await program.parseAsync(["node", "mailctl", "init"]);

    expect(deps.initCommand).toHaveBeenCalledWith("1.3.0", expect.anything());
  });

  it("installs to the user home by default (local=false)", async () => {
    const { program, ctx } = makeCtx();
    const deps = makeDeps();
    registerInitCommand(program, ctx, deps);
    await program.parseAsync(["node", "mailctl", "init"]);

    expect(deps.initCommand).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ local: false }));
  });

  it("installs locally when --local is passed", async () => {
    const { program, ctx } = makeCtx();
    const deps = makeDeps();
    registerInitCommand(program, ctx, deps);
    await program.parseAsync(["node", "mailctl", "init", "--local"]);

    expect(deps.initCommand).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ local: true }));
  });

  it("passes force=true when --force is given", async () => {
    const { program, ctx } = makeCtx();
    const deps = makeDeps();
    registerInitCommand(program, ctx, deps);
    await program.parseAsync(["node", "mailctl", "init", "--local", "--force"]);

    expect(deps.initCommand).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ force: true }));
  });
});
