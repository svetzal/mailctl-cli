/**
 * Single source of truth for the failure -> exit-code contract.
 *
 * Command orchestrators return a result object whose failure counts live
 * either at `result.stats.<field>` (the canonical batch/run-stats shape) or
 * as `result.accountFailures` (per-account connect failures). This module
 * reads those fields without needing to know which command produced them.
 */

/** Exit code used when any operational failure is detected. */
export const FAILURE_EXIT_CODE = 1;

/**
 * Names of `result.stats` fields that represent operational failures.
 * Kept in one place so new failure kinds only need to be added here.
 */
const FAILURE_STAT_KEYS = ["errors", "failed", "timedOut", "searchFailures", "indexErrors", "accountFailures"];

/**
 * Count operational failures represented in a command result.
 * Pure — returns 0 for null/undefined/non-object input, or when no
 * recognized failure field is present.
 *
 * @param {unknown} result
 * @returns {number}
 */
export function operationalFailureCount(result) {
  if (result === null || typeof result !== "object") return 0;

  const stats = /** @type {{ stats?: Record<string, unknown> }} */ (result).stats;
  let count = 0;

  if (stats !== null && typeof stats === "object") {
    for (const key of FAILURE_STAT_KEYS) {
      const value = stats[key];
      if (typeof value === "number") count += value;
      else if (Array.isArray(value)) count += value.length;
    }
  }

  const accountFailures = /** @type {{ accountFailures?: unknown }} */ (result).accountFailures;
  if (Array.isArray(accountFailures)) count += accountFailures.length;

  return count;
}

/**
 * Apply the failure -> exit-code contract for a command result.
 * Invokes `setExitCode(FAILURE_EXIT_CODE)` when any operational failure is
 * present; otherwise does nothing.
 *
 * @param {unknown} result
 * @param {(code: number) => void} setExitCode
 * @returns {void}
 */
export function applyExitCode(result, setExitCode) {
  if (operationalFailureCount(result) > 0) {
    setExitCode(FAILURE_EXIT_CODE);
  }
}
