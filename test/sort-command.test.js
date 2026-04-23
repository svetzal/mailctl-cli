import { afterEach, describe, expect, it, mock } from "bun:test";

function makeSortCommand(overrides = {}) {
  const sortReceipts =
    overrides.sortReceipts ??
    mock(() =>
      Promise.resolve({
        moved: 3,
        skipped: 1,
        alreadySorted: 2,
        unclassified: 0,
      }),
    );

  mock.module("../src/sorter.js", () => ({ sortReceipts }));

  const { sortCommand } = require("../src/sort-command.js");

  return { sortCommand, sortReceipts };
}

function makeDeps(overrides = {}) {
  return { account: null, ...overrides };
}

afterEach(() => {
  mock.restore();
});

describe("sortCommand", () => {
  describe("sortReceipts invocation", () => {
    it("passes parsed months to sortReceipts", async () => {
      const { sortCommand, sortReceipts } = makeSortCommand();
      await sortCommand({ months: "6" }, makeDeps());

      expect(sortReceipts).toHaveBeenCalledWith(expect.objectContaining({ months: 6 }), {}, expect.any(Function));
    });

    it("defaults months to 24 when not provided", async () => {
      const { sortCommand, sortReceipts } = makeSortCommand();
      await sortCommand({}, makeDeps());

      expect(sortReceipts).toHaveBeenCalledWith(expect.objectContaining({ months: 24 }), {}, expect.any(Function));
    });

    it("passes dryRun option to sortReceipts", async () => {
      const { sortCommand, sortReceipts } = makeSortCommand();
      await sortCommand({ dryRun: true }, makeDeps());

      expect(sortReceipts).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }), {}, expect.any(Function));
    });

    it("defaults dryRun to false when not provided", async () => {
      const { sortCommand, sortReceipts } = makeSortCommand();
      await sortCommand({}, makeDeps());

      expect(sortReceipts).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }), {}, expect.any(Function));
    });

    it("passes account from deps to sortReceipts", async () => {
      const { sortCommand, sortReceipts } = makeSortCommand();
      await sortCommand({}, makeDeps({ account: "iCloud" }));

      expect(sortReceipts).toHaveBeenCalledWith(
        expect.objectContaining({ account: "iCloud" }),
        {},
        expect.any(Function),
      );
    });

    it("normalises empty account string to undefined", async () => {
      const { sortCommand, sortReceipts } = makeSortCommand();
      await sortCommand({}, makeDeps({ account: "" }));

      expect(sortReceipts).toHaveBeenCalledWith(
        expect.objectContaining({ account: undefined }),
        {},
        expect.any(Function),
      );
    });

    it("forwards the onProgress callback to sortReceipts", async () => {
      const { sortCommand, sortReceipts } = makeSortCommand();
      const onProgress = mock(() => {});
      await sortCommand({}, makeDeps(), onProgress);

      expect(sortReceipts).toHaveBeenCalledWith(expect.anything(), {}, onProgress);
    });
  });

  describe("return value", () => {
    it("returns the stats object from sortReceipts unchanged", async () => {
      const stats = { moved: 5, skipped: 2, alreadySorted: 1, unclassified: 3 };
      const { sortCommand } = makeSortCommand({
        sortReceipts: mock(() => Promise.resolve(stats)),
      });

      const result = await sortCommand({}, makeDeps());

      expect(result).toBe(stats);
    });
  });
});
