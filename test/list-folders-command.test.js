import { describe, expect, it, mock } from "bun:test";
import { listFoldersCommand } from "../src/list-folders-command.js";
import { makeAccount } from "./helpers.js";

function makeDeps(overrides = {}) {
  const account = makeAccount();
  const folders = [
    { path: "INBOX", specialUse: "\\Inbox" },
    { path: "Sent", specialUse: "\\Sent" },
  ];

  const listMailboxes = mock(() => Promise.resolve(folders));
  const forEachAccount = mock(async (_accounts, fn) => {
    await fn({}, account);
  });

  return {
    targetAccounts: [account],
    forEachAccount,
    listMailboxes,
    ...overrides,
  };
}

describe("listFoldersCommand", () => {
  describe("forEachAccount invocation", () => {
    it("calls forEachAccount with the provided targetAccounts", async () => {
      const accounts = [makeAccount({ name: "Account A" }), makeAccount({ name: "Account B" })];
      const deps = makeDeps({ targetAccounts: accounts });
      await listFoldersCommand({}, deps);

      expect(deps.forEachAccount).toHaveBeenCalledWith(accounts, expect.any(Function), expect.any(Function));
    });

    it("passes onProgress as the third argument to forEachAccount", async () => {
      const deps = makeDeps();
      const onProgress = mock(() => {});
      await listFoldersCommand({}, deps, onProgress);

      expect(deps.forEachAccount).toHaveBeenCalledWith(expect.anything(), expect.any(Function), onProgress);
    });
  });

  describe("folder mapping", () => {
    it("maps folder objects to { path, specialUse } shape", async () => {
      const deps = makeDeps();
      const { allAccountFolders } = await listFoldersCommand({}, deps);

      expect(allAccountFolders[0].folders[0]).toEqual({ path: "INBOX", specialUse: "\\Inbox" });
    });

    it("coerces missing specialUse to null", async () => {
      const deps = makeDeps({
        listMailboxes: mock(() => Promise.resolve([{ path: "Archive" }])),
      });
      const { allAccountFolders } = await listFoldersCommand({}, deps);

      expect(allAccountFolders[0].folders[0]).toEqual({ path: "Archive", specialUse: null });
    });
  });

  describe("multiple accounts", () => {
    it("collects folders from each account into allAccountFolders", async () => {
      const account1 = makeAccount({ name: "Work" });
      const account2 = makeAccount({ name: "Personal" });

      const forEachAccount = mock(async (_accounts, fn) => {
        await fn({}, account1);
        await fn({}, account2);
      });

      const deps = makeDeps({
        targetAccounts: [account1, account2],
        forEachAccount,
      });

      const { allAccountFolders } = await listFoldersCommand({}, deps);

      expect(allAccountFolders).toHaveLength(2);
    });

    it("stores account name in each entry", async () => {
      const account1 = makeAccount({ name: "Work" });
      const account2 = makeAccount({ name: "Personal" });

      const forEachAccount = mock(async (_accounts, fn) => {
        await fn({}, account1);
        await fn({}, account2);
      });

      const deps = makeDeps({
        targetAccounts: [account1, account2],
        forEachAccount,
      });

      const { allAccountFolders } = await listFoldersCommand({}, deps);

      expect(allAccountFolders.map((e) => e.account)).toEqual(["Work", "Personal"]);
    });
  });

  describe("return value", () => {
    it("returns allAccountFolders array", async () => {
      const { allAccountFolders } = await listFoldersCommand({}, makeDeps());

      expect(Array.isArray(allAccountFolders)).toBe(true);
    });

    it("includes the account name for each entry", async () => {
      const { allAccountFolders } = await listFoldersCommand({}, makeDeps());

      expect(allAccountFolders[0].account).toBe("Test Account");
    });
  });
});
