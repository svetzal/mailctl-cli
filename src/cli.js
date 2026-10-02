#!/usr/bin/env node
import { Command } from "commander";
import { loadAccounts } from "./accounts.js";
import { initDeps, registerInitCommand } from "./cli/init-cli.js";
import { mailDeps, registerMailCommands } from "./cli/mail-cli.js";
import { mutationDeps, registerMutationCommands } from "./cli/mutation-cli.js";
import { receiptsDeps, registerReceiptsCommands } from "./cli/receipts-cli.js";
import { registerSecretsCommands, secretsDeps } from "./cli/secrets-cli.js";
import { createCliContext } from "./cli-context.js";
import { NO_ACCOUNTS_CONFIGURED_MESSAGE } from "./cli-helpers.js";
import { loadOpenAiKey } from "./keychain.js";
import { createSecretStore } from "./secret-store.js";

const _keychainSingleton = createSecretStore();

function makeRequireAccounts(keychain, readConfigAccounts) {
  return () => {
    const accounts = loadAccounts(keychain, readConfigAccounts);
    if (accounts.length === 0) {
      throw new Error(NO_ACCOUNTS_CONFIGURED_MESSAGE);
    }
    return accounts;
  };
}

function makeGetOpenAiKey(keychain) {
  let _cache;
  return () => {
    if (_cache === undefined) {
      keychain.unlockNewtKeychain();
      _cache = loadOpenAiKey(keychain);
    }
    return _cache;
  };
}

/**
 * Default production dependencies — each value is the named noun-registrar's own dep slice.
 * The account and OpenAI resolvers share one platform-selected store.
 * @param {import("./secret-store.js").CredentialReader} [store]
 * @param {() => import("./keychain.js").ConfigAccount[]} [readConfigAccounts]
 */
export function createDefaultDeps(store = _keychainSingleton, readConfigAccounts) {
  return {
    requireAccounts: makeRequireAccounts(store, readConfigAccounts),
    receipts: { ...receiptsDeps, getOpenAiKey: makeGetOpenAiKey(store) },
    mail: mailDeps,
    mutation: mutationDeps,
    init: initDeps,
    secrets: {
      ...secretsDeps,
      store:
        "writeSecret" in store ? /** @type {import("./secret-store.js").SecretStore} */ (store) : secretsDeps.store,
    },
  };
}

export const defaultDeps = createDefaultDeps();

/**
 * Build and return a configured Commander program instance without parsing.
 * `src/cli.js` is the composition root — it wires named dep slices into per-noun
 * registrars and does nothing else. New commands belong in the relevant
 * `src/cli/*-cli.js` module.
 *
 * @param {{ requireAccounts: () => Object[], receipts: Object, mail: Object, mutation: Object, init: Object, secrets?: import("./commands/secrets-command.js").SecretsDeps }} [deps]
 * @returns {import("commander").Command}
 */
export function buildProgram(deps = defaultDeps) {
  const program = new Command();

  program
    .name("mailctl")
    .description("Personal email operations tool — receipt sorting, search, folder management, and more")
    .version("1.3.0")
    .option("--account <name>", "email account to use (searches all if omitted)")
    .option("--json", "output results as JSON");

  const ctx = createCliContext({
    getGlobalOpts: () => program.opts(),
    requireAccounts: deps.requireAccounts,
  });

  registerReceiptsCommands(program, ctx, deps.receipts);
  registerMailCommands(program, ctx, deps.mail);
  registerMutationCommands(program, ctx, deps.mutation);
  registerInitCommand(program, ctx, deps.init);
  registerSecretsCommands(program, ctx, deps.secrets ?? secretsDeps);

  return program;
}

if (import.meta.main) {
  buildProgram(defaultDeps).parse();
}
