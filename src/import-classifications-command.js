/**
 * Import-classifications command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js import-classifications handler
 * so it can be tested independently. All I/O is injected via deps.
 */

/**
 * @typedef {object} ImportClassificationsCommandDeps
 * @property {object} fsGateway - { exists(path): boolean, readJson(path): unknown, writeJson(path, data): void }
 */

/**
 * Orchestrate importing a classification JSON file into the classification store.
 *
 * @param {string} file - path to the input JSON file (array of {address, classification})
 * @param {string} outputFile - path to the classification store
 * @param {ImportClassificationsCommandDeps} deps - injected dependencies
 * @returns {{ imported: number, path: string }}
 */
export function importClassificationsCommand(file, outputFile, deps) {
  const { fsGateway } = deps;

  const entries = /** @type {any[]} */ (fsGateway.readJson(file));

  /** @type {Record<string, string>} */
  let store = {};
  if (fsGateway.exists(outputFile)) {
    store = /** @type {Record<string, string>} */ (fsGateway.readJson(outputFile));
  }

  let count = 0;
  for (const entry of entries) {
    if (entry.classification && entry.address) {
      store[entry.address] = entry.classification;
      count++;
    }
  }

  fsGateway.writeJson(outputFile, store);

  return { imported: count, path: outputFile };
}
