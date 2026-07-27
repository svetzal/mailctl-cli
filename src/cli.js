#!/usr/bin/env node
import { Command } from "commander";
import { loadAccounts } from "./accounts.js";
import { initDeps, registerInitCommand } from "./cli/init-cli.js";
import { mailDeps, registerMailCommands } from "./cli/mail-cli.js";
import { mutationDeps, registerMutationCommands } from "./cli/mutation-cli.js";
import { receiptsDeps, registerReceiptsCommands } from "./cli/receipts-cli.js";
import { createCliContext } from "./cli-context.js";
import { NO_ACCOUNTS_CONFIGURED_MESSAGE } from "./cli-helpers.js";
import { KeychainGateway } from "./gateways/keychain-gateway.js";
import { loadOpenAiKey } from "./keychain.js";

const _keychainSingleton = new KeychainGateway();

function makeRequireAccounts(keychain) {
  return () => {
    const accounts = loadAccounts(keychain);
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
      _cache = loadOpenAiKey(keychain);
    }
    return _cache;
  };
}

/**
 * Default production dependencies — each value is the named noun-registrar's own dep slice.
 * `receipts.getOpenAiKey` is overridden here with the real keychain-backed getter.
 */
export const defaultDeps = {
  requireAccounts: makeRequireAccounts(_keychainSingleton),
  receipts: { ...receiptsDeps, getOpenAiKey: makeGetOpenAiKey(_keychainSingleton) },
  mail: mailDeps,
  mutation: mutationDeps,
  init: initDeps,
};

/**
 * Build and return a configured Commander program instance without parsing.
 * `src/cli.js` is the composition root — it wires named dep slices into per-noun
 * registrars and does nothing else. New commands belong in the relevant
 * `src/cli/*-cli.js` module.
 *
 * @param {{ requireAccounts: () => object[], receipts: object, mail: object, mutation: object, init: object }} [deps]
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

  return program;
}

if (import.meta.main) {
  buildProgram(defaultDeps).parse();
}
