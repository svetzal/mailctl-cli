import { secretDiagnostic, validateRemoteDiagnostic } from "../secret-diagnostics.js";
import { validateService } from "../secret-store.js";
import {
  decodeSecretProtocol,
  encodeSecretProtocol,
  expectedSecretNames,
  validateAccounts,
  validateNonSecretConfig,
} from "../secrets-protocol.js";
import { requireObject } from "../validate-json.js";

/** @typedef {{name: string, status: "present"|"missing"|"planned"|"stored"|"removed"|"failed", diagnostic?: import("../secret-diagnostics.js").SecretDiagnostic}} SecretOutcome */
/** @typedef {{store: import("../secret-store.js").SecretStore, input: import("../gateways/secret-input-gateway.js").SecretInputGateway, config: import("../gateways/secret-config-gateway.js").SecretConfigGateway, subprocess: import("../gateways/subprocess-gateway.js").SubprocessGateway}} SecretsDeps */
const SSH_TIMEOUT_MS = 120_000;
const REMOTE_IMPORT = "exec \"$SHELL\" -lc 'exec mailctl secrets import --apply --json'";

/** @param {SecretOutcome[]} results @param {"stored"|"failed"} [config] */
function resultFor(results, config) {
  return {
    results,
    stats: { failed: results.filter((entry) => entry.status === "failed").length + (config === "failed" ? 1 : 0) },
    ...(config ? { config } : {}),
  };
}

/** @param {string} name @param {() => SecretOutcome["status"]} operation @returns {SecretOutcome} */
function outcome(name, operation) {
  try {
    return { name, status: operation() };
  } catch (error) {
    const diagnostic = secretDiagnostic(error);
    return { name, status: "failed", ...(diagnostic ? { diagnostic } : {}) };
  }
}

/** @param {SecretsDeps} deps */
function listSecrets(deps) {
  const accounts = validateAccounts(requireObject(deps.config.read(), "config").accounts ?? []);
  deps.store.unlockNewtKeychain();
  const names = deps.store.listNames().map(validateService);
  return resultFor(
    [...new Set([...expectedSecretNames(accounts), ...names])]
      .sort()
      .map((name) => ({ name, status: names.includes(name) ? "present" : "missing" })),
  );
}

/** @param {"list"|"set"|"rm"|"push"|"import"} command @param {string|undefined} argument
 * @param {{apply?: boolean, stdin?: boolean, config?: boolean}} options @param {SecretsDeps} deps */
export async function secretsCommand(command, argument, options, deps) {
  if (command === "import") return importSecrets(options, deps);
  if (command === "push") return pushSecrets(argument, options, deps);
  if (command === "list") return listSecrets(deps);
  const name = validateService(argument ?? "");
  if (!options.apply) return resultFor([{ name, status: "planned" }]);
  if (options.stdin && deps.input.isTerminal()) throw new Error("Use non-terminal stdin.");
  const value = command === "set" ? await (options.stdin ? deps.input.readStdin() : deps.input.prompt()) : undefined;
  if (value === "") throw new Error("Empty secret input.");
  return resultFor([
    outcome(name, () => {
      deps.store.unlockNewtKeychain();
      if (command === "set") deps.store.writeSecret(name, value ?? "");
      else deps.store.deleteSecret(name);
      return command === "set" ? "stored" : "removed";
    }),
  ]);
}

/** @param {{apply?: boolean}} options @param {SecretsDeps} deps */
async function importSecrets(options, deps) {
  if (deps.input.isTerminal()) throw new Error("Secret import requires non-terminal stdin.");
  const { entries, accounts } = decodeSecretProtocol(await deps.input.readStdin());
  const config = accounts ? { ...validateNonSecretConfig(deps.config.read()), accounts } : undefined;
  if (!options.apply) return resultFor(entries.map(({ name }) => ({ name, status: "planned" })));
  const results = entries.map(({ name, value }) =>
    outcome(name, () => {
      deps.store.unlockNewtKeychain();
      deps.store.writeSecret(name, value);
      return "stored";
    }),
  );
  if (!config) return resultFor(results);
  try {
    deps.config.write(config);
    return resultFor(results, "stored");
  } catch {
    return resultFor(results, "failed");
  }
}

/** A remote import exits nonzero on partial failure. Its stdout remains an
 * untrusted response to validate; stderr and error messages never reach output.
 * @param {string} target @param {string} input @param {SecretsDeps} deps @returns {string} */
function sendProtocol(target, input, deps) {
  try {
    return String(
      deps.subprocess.execFileSync("ssh", ["-T", "--", target, REMOTE_IMPORT], {
        input,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: SSH_TIMEOUT_MS,
      }),
    );
  } catch (error) {
    if (typeof error?.stdout === "string" || Buffer.isBuffer(error?.stdout)) return String(error.stdout);
    throw new Error("SSH secret import failed.");
  }
}

/** @param {string} output @param {string} target @param {import("../secrets-protocol.js").SecretEntry[]} entries
 * @returns {SecretOutcome[]} */
function remoteOutcomes(output, target, entries) {
  const remote = requireObject(JSON.parse(output), "response");
  if (!Array.isArray(remote.results) || remote.results.length !== entries.length)
    throw new Error("Invalid import response.");
  return remote.results.map((raw, index) => {
    const entry = requireObject(raw, "outcome");
    if (
      entry.name !== entries[index].name ||
      (entry.status !== "stored" && entry.status !== "failed") ||
      Object.keys(entry).some((key) => !["name", "status", "diagnostic"].includes(key))
    )
      throw new Error("Invalid import outcome.");
    if (entry.diagnostic !== undefined && entry.status !== "failed") throw new Error("Invalid import outcome.");
    const diagnostic = entry.diagnostic === undefined ? undefined : validateRemoteDiagnostic(entry.diagnostic);
    // Host-only destinations let SSH configuration select the remote login.
    // Explicit logins must still match the canonical diagnostic's username.
    if (diagnostic?.username !== undefined && target.includes("@") && diagnostic.username !== target.split("@")[0])
      throw new Error("Invalid destination username.");
    return { name: entries[index].name, status: entry.status, ...(diagnostic ? { diagnostic } : {}) };
  });
}

/** @param {SecretOutcome[]} local @param {SecretOutcome[]} remote */
function mergeOutcomes(local, remote) {
  const byName = new Map(remote.map((entry) => [entry.name, entry]));
  return local.map((entry) => byName.get(entry.name) ?? entry);
}

/** @param {string|undefined} target @param {{apply?: boolean, config?: boolean}} options @param {SecretsDeps} deps */
async function pushSecrets(target, options, deps) {
  if (!target || !/^[A-Za-z0-9][A-Za-z0-9._@-]*$/.test(target)) throw new Error("Invalid SSH destination.");
  const accounts = validateAccounts(requireObject(deps.config.read(), "config").accounts ?? []);
  const names = expectedSecretNames(accounts);
  if (!options.apply) return { ...resultFor(names.map((name) => ({ name, status: "planned" }))), destination: target };
  // Unlock once, retaining a safely classified failure for every affected name.
  let unlockFailure;
  try {
    deps.store.unlockNewtKeychain();
  } catch (error) {
    unlockFailure = { error };
  }
  /** @type {import("../secrets-protocol.js").SecretEntry[]} */
  const entries = [];
  const results = names.map((name) =>
    outcome(name, () => {
      if (unlockFailure) throw unlockFailure.error;
      const value = deps.store.readSecret(name);
      if (value === null) return "missing";
      entries.push({ name, value });
      return "planned";
    }),
  );
  if (!entries.length && !options.config) return resultFor(results);
  try {
    const output = sendProtocol(target, encodeSecretProtocol(entries, options.config ? accounts : undefined), deps);
    const remote = remoteOutcomes(output, target, entries);
    const config = options.config
      ? requireObject(JSON.parse(output), "response").config === "stored"
        ? "stored"
        : "failed"
      : undefined;
    return resultFor(mergeOutcomes(results, remote), config);
  } catch {
    return resultFor(
      results.map((entry) => (entry.status === "planned" ? { name: entry.name, status: "failed" } : entry)),
      options.config ? "failed" : undefined,
    );
  }
}
