import { describe, expect, it, mock } from "bun:test";
import { applyExitCode, FAILURE_EXIT_CODE, operationalFailureCount } from "../src/exit-status.js";

describe("operationalFailureCount", () => {
  it("returns zero when stats has no failures", () => {
    expect(operationalFailureCount({ stats: { errors: 0, failed: 0 } })).toBe(0);
  });

  it("counts non-zero searchFailures", () => {
    expect(operationalFailureCount({ stats: { searchFailures: 1 } })).toBeGreaterThan(0);
  });

  it("counts non-zero failed", () => {
    expect(operationalFailureCount({ stats: { failed: 2 } })).toBe(2);
  });

  it("counts accountFailures array length", () => {
    expect(operationalFailureCount({ accountFailures: [{}] })).toBe(1);
  });

  it("returns zero for undefined result", () => {
    expect(operationalFailureCount(undefined)).toBe(0);
  });

  it("returns zero for a result with no stats or accountFailures", () => {
    expect(operationalFailureCount({ allResults: [] })).toBe(0);
  });
});

describe("applyExitCode", () => {
  it("calls the injected setter exactly once with the failure exit code when failures exist", () => {
    const setExitCode = mock(() => {});
    applyExitCode({ stats: { failed: 1 } }, setExitCode);
    expect(setExitCode).toHaveBeenCalledTimes(1);
    expect(setExitCode).toHaveBeenCalledWith(FAILURE_EXIT_CODE);
  });

  it("does not call the setter when there are no failures", () => {
    const setExitCode = mock(() => {});
    applyExitCode({ stats: { failed: 0 } }, setExitCode);
    expect(setExitCode).not.toHaveBeenCalled();
  });
});
