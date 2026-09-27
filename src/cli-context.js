import { Option } from "commander";
import {
  createProgressRenderer,
  createResolveAccount,
  createResolveJson,
  filterAccountsByName,
  withErrorHandling,
} from "./cli-helpers.js";

/** @typedef {import('./event-types.js').BaseEvent} BaseEvent */

/**
 * @typedef {Object} CliContext
 * @property {(opts: Object) => boolean} resolveJson
 * @property {(opts: Object) => string|undefined} resolveAccount
 * @property {(fn: (...args: any[]) => Promise<any>) => (...args: any[]) => Promise<void>} wrapAction
 * @property {(cmd: import("commander").Command) => import("commander").Command} mutating
 * @property {{ resolveJson: (opts: Object) => boolean, resolveAccount: (opts: Object) => string|undefined, requireAccounts: () => Object[], filterAccountsByName: (accounts: Object[], name: string|null|undefined) => Object[] }} contextDeps
 * @property {(renderEvent: (event: BaseEvent) => string|null) => (event: BaseEvent) => void} progress
 */

/**
 * Creates the shared CLI context for building command handlers.
 * Centralises the resolveJson/resolveAccount closures, wrapAction, mutating helper,
 * and progress renderer factory so every noun-registrar gets the same contract.
 *
 * @param {{ getGlobalOpts: () => Object, requireAccounts: () => Object[] }} options
 * @returns {CliContext}
 */
export function createCliContext({ getGlobalOpts, requireAccounts }) {
  const resolveJson = createResolveJson(getGlobalOpts);
  const resolveAccount = createResolveAccount(getGlobalOpts);
  const contextDeps = { resolveJson, resolveAccount, requireAccounts, filterAccountsByName };
  const wrapAction = (/** @type {(...args: any[]) => Promise<any>} */ fn) => withErrorHandling(fn, resolveJson);

  /**
   * Attach the canonical plan/apply options to a mutating command: a visible
   * `--apply` and a hidden, deprecated `-n, --dry-run` (now the default, kept so
   * existing muscle memory and scripts don't break).
   *
   * @param {import("commander").Command} cmd
   * @returns {import("commander").Command}
   */
  const mutating = (cmd) =>
    cmd
      .option("--apply", "execute the changes (previews by default)", false)
      .addOption(new Option("-n, --dry-run", "deprecated: preview is the default").hideHelp());

  /**
   * @param {(event: BaseEvent) => string|null} renderEvent
   * @returns {(event: BaseEvent) => void}
   */
  const progress = (renderEvent) => createProgressRenderer(renderEvent);

  return Object.freeze({ resolveJson, resolveAccount, wrapAction, mutating, contextDeps, progress });
}
