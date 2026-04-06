import { describe, expect, it, mock } from "bun:test";
import { replyCommand } from "../src/reply-command.js";
import { makeAccount, makeForEachAccount, makeListMailboxes, makeLock } from "./helpers.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeParsedEmail(overrides = {}) {
  return {
    from: { text: "Alice <alice@example.com>" },
    replyTo: null,
    subject: "Hello world",
    messageId: "<msg-1@example.com>",
    headers: new Map(),
    text: "Original body text.",
    html: null,
    date: new Date("2025-01-15"),
    ...overrides,
  };
}

/**
 * Build a mock IMAP client that returns a raw email buffer on download.
 */
function makeImapClient({ downloadContent = Buffer.from("raw email"), findMailbox = "INBOX" } = {}) {
  return {
    getMailboxLock: mock(() => Promise.resolve(makeLock())),
    search: mock(() => Promise.resolve(findMailbox ? [42] : [])),
    download: mock(() => ({
      content: (async function* () {
        yield downloadContent;
      })(),
    })),
  };
}

/**
 * Build a deps object with all mocks.
 */
function makeDeps(overrides = {}) {
  const account = makeAccount({ smtp: { host: "smtp.test.com", port: 587, secure: false } });
  const parsed = makeParsedEmail();
  const client = makeImapClient();

  const forEachAccount = makeForEachAccount(client, account);

  const listMailboxes = makeListMailboxes([
    { path: "INBOX", specialUse: "\\Inbox" },
    { path: "Sent", specialUse: "\\Sent" },
  ]);

  const simpleParser = mock(() => Promise.resolve(parsed));

  const fsGateway = { readText: mock(() => "Message from file") };
  const smtpGateway = {
    send: mock(() => Promise.resolve({ messageId: "<sent-1@test.com>", accepted: ["alice@example.com"] })),
  };
  const editorGateway = { editTempFile: mock(() => "Message from editor") };
  const confirmGateway = { confirm: mock(() => Promise.resolve("y")) };

  return {
    targetAccounts: [account],
    forEachAccount,
    listMailboxes,
    simpleParser,
    fsGateway,
    smtpGateway,
    editorGateway,
    confirmGateway,
    ...overrides,
  };
}

// ── replyCommand ───────────────────────────────────────────────────────────────

describe("replyCommand", () => {
  describe("input validation", () => {
    it("throws when no message source is provided", async () => {
      const deps = makeDeps();
      await expect(replyCommand("42", {}, deps)).rejects.toThrow(
        "Provide --message, --message-file, or --edit to compose a reply.",
      );
    });

    it("throws when UID is not found in any account", async () => {
      const deps = makeDeps({
        forEachAccount: mock(async (_accounts, _fn) => {
          // Never calls fn with a valid match — simulates UID not found
        }),
      });
      await expect(replyCommand("99", { message: "hello" }, deps)).rejects.toThrow(
        "Could not find UID 99 in any account.",
      );
    });

    it("throws when matched account has no SMTP configuration", async () => {
      const accountNoSmtp = makeAccount({ smtp: undefined });
      const deps = makeDeps({
        forEachAccount: mock(async (_accounts, fn) => {
          await fn(makeImapClient(), accountNoSmtp);
        }),
      });
      await expect(replyCommand("42", { message: "hello" }, deps)).rejects.toThrow(
        `No SMTP configuration for account "Test Account"`,
      );
    });
  });

  describe("--message (inline text)", () => {
    describe("sends reply with inline message and returns sent result", () => {
      it("result.sent is true", async () => {
        const deps = makeDeps();
        const result = /** @type {any} */ (await replyCommand("42", { message: "Hello back!" }, deps));
        expect(result.sent).toBe(true);
      });

      it("result.messageId matches sent message id", async () => {
        const deps = makeDeps();
        const result = /** @type {any} */ (await replyCommand("42", { message: "Hello back!" }, deps));
        expect(result.messageId).toBe("<sent-1@test.com>");
      });
    });

    it("builds correct To address from original From field", async () => {
      const deps = makeDeps();
      const result = /** @type {any} */ (await replyCommand("42", { message: "Reply" }, deps));

      expect(result.message.to).toBe("Alice <alice@example.com>");
    });

    it("prepends Re: to subject when not already present", async () => {
      const deps = makeDeps();
      const result = /** @type {any} */ (await replyCommand("42", { message: "Reply" }, deps));

      expect(result.message.subject).toBe("Re: Hello world");
    });

    it("does not double-prepend Re: when subject already starts with Re:", async () => {
      const deps = makeDeps({
        simpleParser: mock(() => Promise.resolve(makeParsedEmail({ subject: "Re: Hello world" }))),
      });
      const result = /** @type {any} */ (await replyCommand("42", { message: "Reply" }, deps));

      expect(result.message.subject).toBe("Re: Hello world");
    });

    it("sets from address to account user", async () => {
      const deps = makeDeps();
      const result = /** @type {any} */ (await replyCommand("42", { message: "Reply" }, deps));

      expect(result.message.from).toBe("user@test.com");
    });

    it("includes CC when --cc is set", async () => {
      const deps = makeDeps();
      const result = /** @type {any} */ (await replyCommand("42", { message: "Reply", cc: "bob@example.com" }, deps));

      expect(result.message.cc).toBe("bob@example.com");
    });

    it("omits CC when --cc is not set", async () => {
      const deps = makeDeps();
      const result = /** @type {any} */ (await replyCommand("42", { message: "Reply" }, deps));

      expect(result.message.cc).toBeUndefined();
    });

    it("calls smtpGateway.send with account and message", async () => {
      const deps = makeDeps();
      await replyCommand("42", { message: "Reply" }, deps);

      expect(deps.smtpGateway.send).toHaveBeenCalledTimes(1);
    });
  });

  describe("--message-file", () => {
    describe("reads message text from fsGateway.readText", () => {
      it("result.sent is true", async () => {
        const deps = makeDeps();
        deps.fsGateway.readText = mock(() => "  File message  ");
        const result = /** @type {any} */ (await replyCommand("42", { messageFile: "/tmp/msg.txt" }, deps));
        expect(result.sent).toBe(true);
      });

      it("calls fsGateway.readText once", async () => {
        const deps = makeDeps();
        deps.fsGateway.readText = mock(() => "  File message  ");
        await replyCommand("42", { messageFile: "/tmp/msg.txt" }, deps);
        expect(deps.fsGateway.readText).toHaveBeenCalledTimes(1);
      });
    });

    it("trims whitespace from file content", async () => {
      const deps = makeDeps();
      deps.fsGateway.readText = mock(() => "  trimmed message  ");
      await replyCommand("42", { messageFile: "/tmp/msg.txt" }, deps);

      // Verify the trimmed content is included in the body
      expect(deps.smtpGateway.send).toHaveBeenCalledTimes(1);
    });
  });

  describe("--edit", () => {
    it("calls editorGateway.editTempFile with template content", async () => {
      const deps = makeDeps();
      deps.editorGateway.editTempFile = mock(() => "Edited reply text");
      await replyCommand("42", { edit: true }, deps);

      expect(deps.editorGateway.editTempFile).toHaveBeenCalledTimes(1);
    });

    it("throws when editor produces empty content", async () => {
      const deps = makeDeps();
      // parseEditorContent strips comment lines — return only comments
      deps.editorGateway.editTempFile = mock(() => "# Just a comment\n# Another comment");

      await expect(replyCommand("42", { edit: true }, deps)).rejects.toThrow("Empty reply — aborting.");
    });

    it("prompts for confirmation before sending", async () => {
      const deps = makeDeps();
      deps.editorGateway.editTempFile = mock(() => "Real message");
      await replyCommand("42", { edit: true }, deps);

      expect(deps.confirmGateway.confirm).toHaveBeenCalledTimes(1);
    });

    it("returns aborted result when user declines confirmation", async () => {
      const deps = makeDeps({
        confirmGateway: { confirm: mock(() => Promise.resolve("n")) },
      });
      deps.editorGateway.editTempFile = mock(() => "Real message");
      const result = /** @type {any} */ (await replyCommand("42", { edit: true }, deps));

      expect(result.aborted).toBe(true);
    });

    it("skips confirmation when --yes is set", async () => {
      const deps = makeDeps();
      deps.editorGateway.editTempFile = mock(() => "Real message");
      await replyCommand("42", { edit: true, yes: true }, deps);

      expect(deps.confirmGateway.confirm).not.toHaveBeenCalled();
    });

    it("skips confirmation when --dry-run is set", async () => {
      const deps = makeDeps();
      deps.editorGateway.editTempFile = mock(() => "Real message");
      await replyCommand("42", { edit: true, dryRun: true }, deps);

      expect(deps.confirmGateway.confirm).not.toHaveBeenCalled();
    });

    describe("does not send when user confirms but --dry-run is set", () => {
      it("result.dryRun is true", async () => {
        const deps = makeDeps();
        deps.editorGateway.editTempFile = mock(() => "Real message");
        const result = /** @type {any} */ (await replyCommand("42", { edit: true, dryRun: true }, deps));
        expect(result.dryRun).toBe(true);
      });

      it("does not call smtpGateway.send", async () => {
        const deps = makeDeps();
        deps.editorGateway.editTempFile = mock(() => "Real message");
        await replyCommand("42", { edit: true, dryRun: true }, deps);
        expect(deps.smtpGateway.send).not.toHaveBeenCalled();
      });
    });
  });

  describe("--dry-run", () => {
    describe("returns dryRun: true with composed message, without sending", () => {
      it("result.dryRun is true", async () => {
        const deps = makeDeps();
        const result = /** @type {any} */ (await replyCommand("42", { message: "Preview", dryRun: true }, deps));
        expect(result.dryRun).toBe(true);
      });

      it("result.message is defined", async () => {
        const deps = makeDeps();
        const result = /** @type {any} */ (await replyCommand("42", { message: "Preview", dryRun: true }, deps));
        expect(result.message).toBeDefined();
      });

      it("does not call smtpGateway.send", async () => {
        const deps = makeDeps();
        await replyCommand("42", { message: "Preview", dryRun: true }, deps);
        expect(deps.smtpGateway.send).not.toHaveBeenCalled();
      });
    });

    describe("includes message fields in dry-run result", () => {
      it("message.from is the account user", async () => {
        const deps = makeDeps();
        const result = /** @type {any} */ (await replyCommand("42", { message: "Hello", dryRun: true }, deps));
        expect(result.message.from).toBe("user@test.com");
      });

      it("message.subject has Re: prepended", async () => {
        const deps = makeDeps();
        const result = /** @type {any} */ (await replyCommand("42", { message: "Hello", dryRun: true }, deps));
        expect(result.message.subject).toBe("Re: Hello world");
      });
    });
  });

  describe("account iteration", () => {
    it("stops iterating after the UID is found in first account", async () => {
      const account = makeAccount({ smtp: { host: "smtp.test.com", port: 587, secure: false } });
      const client = makeImapClient();
      let _callCount = 0;

      const deps = makeDeps({
        forEachAccount: mock(async (_accounts, fn) => {
          _callCount++;
          await fn(client, account);
          await fn(client, makeAccount({ name: "Second Account" })); // should not be used
        }),
        simpleParser: mock(() => {
          _callCount++;
          return Promise.resolve(makeParsedEmail());
        }),
      });

      await replyCommand("42", { message: "Reply" }, deps);

      // simpleParser called once (for first account), second account not used
      expect(deps.simpleParser).toHaveBeenCalledTimes(1);
    });

    it("tries next account when UID not found in current one", async () => {
      const account1 = makeAccount({ name: "Account 1", smtp: undefined });
      const account2 = makeAccount({ name: "Account 2", smtp: { host: "smtp.test.com", port: 587, secure: false } });
      let _callCount = 0;

      const failClient = {
        getMailboxLock: mock(() => Promise.resolve(makeLock())),
        search: mock(() => Promise.resolve([])),
        download: mock(() => {
          throw new Error("UID not found");
        }),
      };
      const successClient = makeImapClient();

      const deps = makeDeps({
        forEachAccount: mock(async (_accounts, fn) => {
          await fn(failClient, account1);
          await fn(successClient, account2);
        }),
        simpleParser: mock(async () => {
          _callCount++;
          return makeParsedEmail();
        }),
      });

      const result = /** @type {any} */ (await replyCommand("42", { message: "Reply" }, deps));

      expect(result.sent).toBe(true);
    });

    it("calls simpleParser once (only for the matching account)", async () => {
      const account1 = makeAccount({ name: "Account 1", smtp: undefined });
      const account2 = makeAccount({ name: "Account 2", smtp: { host: "smtp.test.com", port: 587, secure: false } });
      let callCount = 0;

      const failClient = {
        getMailboxLock: mock(() => Promise.resolve(makeLock())),
        search: mock(() => Promise.resolve([])),
        download: mock(() => {
          throw new Error("UID not found");
        }),
      };
      const successClient = makeImapClient();

      const deps = makeDeps({
        forEachAccount: mock(async (_accounts, fn) => {
          await fn(failClient, account1);
          await fn(successClient, account2);
        }),
        simpleParser: mock(async () => {
          callCount++;
          return makeParsedEmail();
        }),
      });

      await replyCommand("42", { message: "Reply" }, deps);

      expect(callCount).toBe(1);
    });
  });
});
