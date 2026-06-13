/**
 * Shared batch-result accumulator for batch command orchestrators (move, flag).
 */

/**
 * Creates a batch accumulator for tracking stats and results.
 *
 * @param {string[]} statKeys - stat counter names, each initialized to 0
 * @returns {{ stats: Record<string,number>, results: Array, record: (statKey: string, records: Array) => void, getResult: () => { stats: Record<string,number>, results: Array } }}
 */
export function createBatchAccumulator(statKeys) {
  /** @type {Record<string,number>} */
  const stats = Object.fromEntries(statKeys.map((k) => [k, 0]));
  /** @type {Array} */
  const results = [];

  return {
    stats,
    results,
    /**
     * Records entries under a stat key. Increments the stat by the number of records.
     *
     * @param {string} statKey
     * @param {Array} records
     */
    record(statKey, records) {
      stats[statKey] += records.length;
      results.push(...records);
    },
    /**
     * @returns {{ stats: Record<string,number>, results: Array }}
     */
    getResult() {
      return { stats, results };
    },
  };
}

/**
 * Expands a base record into one record per UID, each with its own `uid` field.
 *
 * @param {string[]} uids
 * @param {object} baseRecord
 * @returns {Array<object>}
 */
export function expandPerUid(uids, baseRecord) {
  return uids.map((uid) => ({ ...baseRecord, uid }));
}
