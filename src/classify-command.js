/**
 * Classify command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js classify handler so it can
 * be tested independently. All I/O is injected via deps.
 */

/**
 * @typedef {object} ClassifyCommandDeps
 * @property {object} fsGateway - { exists(path): boolean, readJson(path): unknown }
 */

/**
 * @typedef {object} UnclassifiedEntry
 * @property {string} address
 * @property {string} name
 * @property {number} count
 * @property {string[]} accounts
 * @property {string} example
 * @property {null} classification
 */

/**
 * Orchestrate loading senders and returning the unclassified subset.
 *
 * @param {string} inputFile - path to senders.json
 * @param {string} outputFile - path to classifications.json
 * @param {ClassifyCommandDeps} deps - injected dependencies
 * @returns {{ unclassifiedList: UnclassifiedEntry[] }}
 * @throws {Error} when the input file does not exist
 */
export function classifyCommand(inputFile, outputFile, deps) {
  const { fsGateway } = deps;

  if (!fsGateway.exists(inputFile)) {
    throw new Error("Run 'scan' first to generate sender data.");
  }

  const senders = /** @type {any[]} */ (fsGateway.readJson(inputFile));

  /** @type {Record<string, string>} */
  let classifications = {};
  if (fsGateway.exists(outputFile)) {
    classifications = /** @type {Record<string, string>} */ (fsGateway.readJson(outputFile));
  }

  const unclassified = senders.filter((s) => !classifications[s.address]);

  const unclassifiedList = unclassified.map((s) => ({
    address: s.address,
    name: s.name,
    count: s.count,
    accounts: s.accounts,
    example: s.sampleSubjects?.[0] || "",
    classification: /** @type {null} */ (null),
  }));

  return { unclassifiedList };
}
