import { loadAccounts } from "../accounts.js";
import { FileSystemGateway } from "../gateways/fs-gateway.js";
import { SubprocessGateway } from "../gateways/subprocess-gateway.js";
import { forEachAccount, listMailboxes } from "../imap-client.js";
import { createLlmBroker } from "./llm-receipt-extraction.js";
import { processReceiptMessage } from "./process-receipt-message.js";

/** Default per-message timeout: 2 minutes. */
export const DEFAULT_PER_MESSAGE_TIMEOUT_MS = 120_000;

/** Singleton production gateway instances. */
const _defaultFs = new FileSystemGateway();
const _defaultSubprocess = new SubprocessGateway();

/**
 * Default production gateways. Tests override individual keys.
 */
const defaultGateways = {
  fs: _defaultFs,
  subprocess: _defaultSubprocess,
  loadAccounts,
  forEachAccount,
  listMailboxes,
  createLlmBroker,
  processMessage: processReceiptMessage,
  openAiKey: /** @type {string|null} */ (null),
};

/**
 * Returns the merged gateway bundle, applying caller overrides over the defaults.
 * @param {object} [overrides]
 * @returns {typeof defaultGateways}
 */
export function resolveGateways(overrides = {}) {
  return { ...defaultGateways, ...overrides };
}
