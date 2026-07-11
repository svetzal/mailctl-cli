import { formatInitOutput } from "../format-init.js";
import { initCommand } from "../init.js";

/**
 * @typedef {object} InitCliDeps
 * @property {Function} initCommand
 * @property {Function} formatInitOutput
 */

/** @type {InitCliDeps} */
export const initDeps = {
  initCommand,
  formatInitOutput,
};

/**
 * Register the `init` command for skill distribution.
 *
 * @param {import("commander").Command} program
 * @param {import("../cli-context.js").CliContext} ctx
 * @param {InitCliDeps} [deps]
 */
export function registerInitCommand(program, ctx, deps = initDeps) {
  const { wrapAction, resolveJson } = ctx;

  program
    .command("init")
    .description("Install the mailctl companion skill across all cmx-managed agent platforms")
    .option("--local", "install into the current project instead of the user home")
    .option("--force", "overwrite drifted or newer installs")
    .action(
      wrapAction(async (opts) => {
        const json = resolveJson(opts);
        const result = await deps.initCommand(program.version() ?? "0.0.0", {
          local: !!opts.local,
          force: !!opts.force,
        });

        console.log(deps.formatInitOutput(json, result));
      }),
    );
}
