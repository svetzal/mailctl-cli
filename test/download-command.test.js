import { describe, expect, it, mock } from "bun:test";
import { downloadCommand } from "../src/commands/download-command.js";

function makeDownloadReceipts(overrides = {}) {
  return (
    overrides.downloadReceipts ??
    mock(() =>
      Promise.resolve({
        downloaded: 4,
        skipped: 1,
        noPdf: 2,
        alreadyHave: 3,
      }),
    )
  );
}

function makeDeps(overrides = {}) {
  return { account: null, downloadReceipts: makeDownloadReceipts(), ...overrides };
}

describe("downloadCommand", () => {
  describe("downloadReceipts invocation", () => {
    it("passes parsed months to downloadReceipts", async () => {
      const downloadReceipts = makeDownloadReceipts();
      await downloadCommand({ months: "6" }, makeDeps({ downloadReceipts }));

      expect(downloadReceipts).toHaveBeenCalledWith(expect.objectContaining({ months: 6 }), {}, expect.any(Function));
    });

    it("defaults months to 24 when not provided", async () => {
      const downloadReceipts = makeDownloadReceipts();
      await downloadCommand({}, makeDeps({ downloadReceipts }));

      expect(downloadReceipts).toHaveBeenCalledWith(expect.objectContaining({ months: 24 }), {}, expect.any(Function));
    });

    it("passes dryRun option to downloadReceipts", async () => {
      const downloadReceipts = makeDownloadReceipts();
      await downloadCommand({ dryRun: true }, makeDeps({ downloadReceipts }));

      expect(downloadReceipts).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
        {},
        expect.any(Function),
      );
    });

    it("defaults dryRun to false when not provided", async () => {
      const downloadReceipts = makeDownloadReceipts();
      await downloadCommand({}, makeDeps({ downloadReceipts }));

      expect(downloadReceipts).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: false }),
        {},
        expect.any(Function),
      );
    });

    it("passes output directory as outputDir to downloadReceipts", async () => {
      const downloadReceipts = makeDownloadReceipts();
      await downloadCommand({ output: "/tmp/receipts" }, makeDeps({ downloadReceipts }));

      expect(downloadReceipts).toHaveBeenCalledWith(
        expect.objectContaining({ outputDir: "/tmp/receipts" }),
        {},
        expect.any(Function),
      );
    });

    it("passes account from deps to downloadReceipts", async () => {
      const downloadReceipts = makeDownloadReceipts();
      await downloadCommand({}, makeDeps({ account: "iCloud", downloadReceipts }));

      expect(downloadReceipts).toHaveBeenCalledWith(
        expect.objectContaining({ account: "iCloud" }),
        {},
        expect.any(Function),
      );
    });

    it("normalises empty account string to undefined", async () => {
      const downloadReceipts = makeDownloadReceipts();
      await downloadCommand({}, makeDeps({ account: "", downloadReceipts }));

      expect(downloadReceipts).toHaveBeenCalledWith(
        expect.objectContaining({ account: undefined }),
        {},
        expect.any(Function),
      );
    });

    it("forwards the onProgress callback to downloadReceipts", async () => {
      const downloadReceipts = makeDownloadReceipts();
      const onProgress = mock(() => {});
      await downloadCommand({}, makeDeps({ downloadReceipts }), onProgress);

      expect(downloadReceipts).toHaveBeenCalledWith(expect.anything(), {}, onProgress);
    });
  });

  describe("error propagation", () => {
    it("re-throws with prefixed message when downloadReceipts rejects", async () => {
      const downloadReceipts = mock(() => Promise.reject(new Error("connection refused")));
      await expect(downloadCommand({}, makeDeps({ downloadReceipts }))).rejects.toThrow(
        "Download failed: connection refused",
      );
    });

    it("forwards error code on the re-thrown error when original has code", async () => {
      const original = new Error("timed out");
      /** @type {any} */ (original).code = "ETIMEDOUT";
      const downloadReceipts = mock(() => Promise.reject(original));

      let caught;
      try {
        await downloadCommand({}, makeDeps({ downloadReceipts }));
      } catch (e) {
        caught = e;
      }
      expect(/** @type {any} */ (caught).code).toBe("ETIMEDOUT");
    });

    it("sets cause to the original error when downloadReceipts rejects", async () => {
      const original = new Error("connection refused");
      const downloadReceipts = mock(() => Promise.reject(original));

      let caught;
      try {
        await downloadCommand({}, makeDeps({ downloadReceipts }));
      } catch (e) {
        caught = e;
      }
      expect(/** @type {any} */ (caught).cause).toBe(original);
    });
  });

  describe("return value", () => {
    it("returns the stats object from downloadReceipts unchanged", async () => {
      const stats = { downloaded: 5, skipped: 2, noPdf: 1, alreadyHave: 3 };
      const downloadReceipts = mock(() => Promise.resolve(stats));
      const result = await downloadCommand({}, makeDeps({ downloadReceipts }));

      expect(result).toBe(stats);
    });
  });
});
