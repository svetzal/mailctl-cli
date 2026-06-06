import { afterEach, describe, expect, it, mock } from "bun:test";

function makeGateway(imapClientMock) {
  mock.module("../../src/imap-client.js", () => imapClientMock);
  const { ImapGateway } = require("../../src/gateways/imap-gateway.js");
  return new ImapGateway();
}

afterEach(() => {
  mock.restore();
});

// ── connect ───────────────────────────────────────────────────────────────────

describe("ImapGateway connect", () => {
  it("delegates to imap-client connect and returns its result", async () => {
    /** @type {any} */
    const sentinel = {};
    const gateway = makeGateway({
      connect: () => Promise.resolve(sentinel),
      listMailboxes: () => Promise.resolve([]),
    });

    const result = await gateway.connect({ user: "test@example.com" });

    expect(result).toBe(sentinel);
  });
});

// ── listMailboxes ─────────────────────────────────────────────────────────────

describe("ImapGateway listMailboxes", () => {
  it("delegates to imap-client listMailboxes and returns its result", async () => {
    /** @type {any} */
    const sentinel = [{ path: "INBOX" }];
    /** @type {any} */
    const fakeClient = {};
    const gateway = makeGateway({
      connect: () => Promise.resolve({}),
      listMailboxes: () => Promise.resolve(sentinel),
    });

    const result = await gateway.listMailboxes(fakeClient);

    expect(result).toBe(sentinel);
  });
});

// ── getMailboxLock ────────────────────────────────────────────────────────────

describe("ImapGateway getMailboxLock", () => {
  it("forwards the mailbox argument to client.getMailboxLock and returns its result", async () => {
    const sentinel = { release: () => {} };
    /** @type {any} */
    const fakeClient = {
      getMailboxLock: (mailbox) => Promise.resolve(mailbox === "INBOX" ? sentinel : null),
    };
    const gateway = makeGateway({
      connect: () => Promise.resolve({}),
      listMailboxes: () => Promise.resolve([]),
    });

    const result = await gateway.getMailboxLock(fakeClient, "INBOX");

    expect(result).toBe(sentinel);
  });
});

// ── search ────────────────────────────────────────────────────────────────────

describe("ImapGateway search", () => {
  it("forwards criteria and opts to client.search and returns its result", async () => {
    /** @type {any} */
    const sentinel = [1, 2, 3];
    /** @type {any} */
    const fakeClient = {
      search: () => Promise.resolve(sentinel),
    };
    const gateway = makeGateway({
      connect: () => Promise.resolve({}),
      listMailboxes: () => Promise.resolve([]),
    });

    const result = await gateway.search(fakeClient, { all: true }, { uid: true });

    expect(result).toBe(sentinel);
  });
});

// ── fetch ─────────────────────────────────────────────────────────────────────

describe("ImapGateway fetch", () => {
  it("forwards range, opts, and fetchOpts to client.fetch and returns its result", () => {
    /** @type {any} */
    const sentinel = {};
    /** @type {any} */
    const fakeClient = {
      fetch: () => sentinel,
    };
    const gateway = makeGateway({
      connect: () => Promise.resolve({}),
      listMailboxes: () => Promise.resolve([]),
    });

    const result = gateway.fetch(fakeClient, "1:10", { envelope: true }, { uid: true });

    expect(result).toBe(sentinel);
  });
});

// ── messageMove ───────────────────────────────────────────────────────────────

describe("ImapGateway messageMove", () => {
  it("forwards uids, destination, and opts to client.messageMove and returns its result", async () => {
    /** @type {any} */
    const sentinel = {};
    /** @type {any} */
    const fakeClient = {
      messageMove: () => Promise.resolve(sentinel),
    };
    const gateway = makeGateway({
      connect: () => Promise.resolve({}),
      listMailboxes: () => Promise.resolve([]),
    });

    const result = await gateway.messageMove(fakeClient, "1,2,3", "Archive", { uid: true });

    expect(result).toBe(sentinel);
  });
});

// ── download ──────────────────────────────────────────────────────────────────

describe("ImapGateway download", () => {
  it("forwards uid, part, and opts to client.download and returns its result", async () => {
    /** @type {any} */
    const sentinel = {};
    /** @type {any} */
    const fakeClient = {
      download: () => Promise.resolve(sentinel),
    };
    const gateway = makeGateway({
      connect: () => Promise.resolve({}),
      listMailboxes: () => Promise.resolve([]),
    });

    const result = await gateway.download(fakeClient, "42", "1", { uid: true });

    expect(result).toBe(sentinel);
  });
});

// ── logout ────────────────────────────────────────────────────────────────────

describe("ImapGateway logout", () => {
  it("calls client.logout and returns its result", async () => {
    let called = false;
    /** @type {any} */
    const fakeClient = {
      logout: () => {
        called = true;
        return Promise.resolve();
      },
    };
    const gateway = makeGateway({
      connect: () => Promise.resolve({}),
      listMailboxes: () => Promise.resolve([]),
    });

    await gateway.logout(fakeClient);

    expect(called).toBe(true);
  });
});
