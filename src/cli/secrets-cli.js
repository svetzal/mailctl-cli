import { secretsCommand } from "../commands/secrets-command.js";
import { SecretConfigGateway } from "../gateways/secret-config-gateway.js";
import { SecretInputGateway } from "../gateways/secret-input-gateway.js";
import { SubprocessGateway } from "../gateways/subprocess-gateway.js";
import { createSecretStore } from "../secret-store.js";

export const secretsDeps = {
  store: createSecretStore(),
  input: new SecretInputGateway(),
  config: new SecretConfigGateway(),
  subprocess: new SubprocessGateway(),
};

/** @param {import("commander").Command} program @param {import("../cli-context.js").CliContext} ctx
 * @param {import("../commands/secrets-command.js").SecretsDeps} deps */
export function registerSecretsCommands(program, ctx, deps) {
  const secrets = program
    .command("secrets")
    .description("Provision and replicate platform credentials without exposing values");
  for (const verb of /** @type {const} */ (["list", "set", "rm", "push", "import"])) {
    const command = secrets.command(verb).option("--json", "output results as JSON");
    if (["set", "rm"].includes(verb)) command.argument("<name>", "credential service name");
    if (verb === "push")
      command
        .argument("<destination>", "SSH host or user@host")
        .option("--config", "include validated non-secret account metadata");
    if (verb === "set") command.option("--stdin", "read exact secret bytes from non-terminal stdin");
    if (verb !== "list") ctx.mutating(command);
    command.action(
      ctx.wrapAction(async (...args) => {
        const opts = command.opts();
        let result;
        try {
          result = await secretsCommand(
            verb,
            ["set", "rm", "push"].includes(verb) ? args[0] : undefined,
            { ...opts, apply: opts.apply && !opts.dryRun },
            deps,
          );
        } catch {
          throw new Error(
            "Secret operation rejected. Check input/configuration, protocol version, TPM2 support and noninteractive sudo permissions; values are never reported.",
          );
        }
        console.log(
          ctx.resolveJson(opts)
            ? JSON.stringify(result)
            : result.results.map(({ name, status }) => `${name}: ${status}`).join("\n") +
                (result.config ? `\nconfiguration: ${result.config}` : ""),
        );
        return result;
      }),
    );
  }
}
