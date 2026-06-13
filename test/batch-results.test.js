import { describe, expect, it } from "bun:test";
import { createBatchAccumulator, expandPerUid } from "../src/batch-results.js";

describe("createBatchAccumulator", () => {
  it("initializes all stat keys to 0", () => {
    const acc = createBatchAccumulator(["moved", "failed", "skipped"]);
    expect(acc.stats).toEqual({ moved: 0, failed: 0, skipped: 0 });
  });

  it("starts with an empty results array", () => {
    const acc = createBatchAccumulator(["moved", "failed"]);
    expect(acc.results).toEqual([]);
  });

  it("increments the stat key by the number of records passed", () => {
    const acc = createBatchAccumulator(["failed"]);
    acc.record("failed", [{ uid: "1" }, { uid: "2" }]);
    expect(acc.stats.failed).toBe(2);
  });

  it("pushes all passed records into results in order", () => {
    const acc = createBatchAccumulator(["failed"]);
    const a = { uid: "1" };
    const b = { uid: "2" };
    acc.record("failed", [a, b]);
    expect(acc.results).toEqual([a, b]);
  });

  it("increments by exactly 1 when a single record carrying multiple UIDs is passed", () => {
    const acc = createBatchAccumulator(["flagged"]);
    acc.record("flagged", [{ uids: [1, 2, 3], status: "flagged", account: "X" }]);
    expect(acc.stats.flagged).toBe(1);
  });

  it("getResult returns the same stats and results references", () => {
    const acc = createBatchAccumulator(["moved"]);
    const result = acc.getResult();
    expect(result.stats).toBe(acc.stats);
    expect(result.results).toBe(acc.results);
  });
});

describe("expandPerUid", () => {
  it("returns one record per UID", () => {
    const records = expandPerUid(["1", "2"], { account: "X", status: "failed" });
    expect(records).toHaveLength(2);
  });

  it("assigns each record its own uid from the array", () => {
    const records = expandPerUid(["1", "2"], { account: "X", status: "failed" });
    expect(records[0].uid).toBe("1");
    expect(records[1].uid).toBe("2");
  });

  it("spreads base record fields onto each entry", () => {
    const records = expandPerUid(["1", "2"], { account: "X", status: "failed" });
    expect(records[0]).toMatchObject({ account: "X", status: "failed" });
    expect(records[1]).toMatchObject({ account: "X", status: "failed" });
  });
});
