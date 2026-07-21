import { Command } from "commander";
import { simpleParser } from "mailparser";
import { renderAuthEvent } from "../auth-event-factories.js";
import { collectValues, resolveCommandContext } from "../cli-helpers.js";
import { contactsCommand } from "../commands/contacts-command.js";
import { extractAttachmentCommand } from "../commands/extract-attachment-command.js";
import { inboxCommand } from "../commands/inbox-command.js";
import { listFoldersCommand } from "../commands/list-folders-command.js";
import { readCommand } from "../commands/read-command.js";
import { searchCommand } from "../commands/search-command.js";
import { threadCommand } from "../commands/thread-command.js";
import {
  formatAttachmentOutput,
  formatContactsOutput,
  formatFoldersOutput,
  formatInboxOutput,
  formatReadOutput,
  formatSearchOutput,
  formatThreadOutput,
} from "../format-mail.js";
import { FileSystemGateway } from "../gateways/fs-gateway.js";
import { forEachAccount, listMailboxes } from "../imap-client.js";

/**
 * @typedef {object} MailCliDeps
 * @property {Function} searchCommand
 * @property {Function} readCommand
 * @property {Function} listFoldersCommand
 * @property {Function} extractAttachmentCommand
 * @property {Function} inboxCommand
 * @property {Function} threadCommand
 * @property {Function} contactsCommand
 * @property {Function} formatSearchOutput
 * @property {Function} formatReadOutput
 * @property {Function} formatFoldersOutput
 * @property {Function} formatAttachmentOutput
 * @property {Function} formatInboxOutput
 * @property {Function} formatThreadOutput
 * @property {Function} formatContactsOutput
 * @property {(event: import('../event-types.js').BaseEvent) => string|null} renderAuthEvent
 * @property {Function} forEachAccount
 * @property {Function} listMailboxes
 * @property {Function} simpleParser
 * @property {object} _fs
 */

/** @type {MailCliDeps} */
export const mailDeps = {
  searchCommand,
  readCommand,
  listFoldersCommand,
  extractAttachmentCommand,
  inboxCommand,
  threadCommand,
  contactsCommand,
  formatSearchOutput,
  formatReadOutput,
  formatFoldersOutput,
  formatAttachmentOutput,
  formatInboxOutput,
  formatThreadOutput,
  formatContactsOutput,
  renderAuthEvent,
  forEachAccount,
  listMailboxes,
  simpleParser,
  _fs: new FileSystemGateway(),
};

/**
 * @param {import("commander").Command} program
 * @param {import("../cli-context.js").CliContext} ctx
 * @param {MailCliDeps} deps
 */
function registerSearchCommand(program, ctx, deps) {
  const { wrapAction, contextDeps } = ctx;

  program
    .command("search")
    .description("Search for emails across configured accounts (all mailboxes by default)")
    .argument("[query]", "search term (optional when --from, --to, --subject, or --body is specified)")
    .option("-f, --from <name>", "search by sender name or address")
    .option("-t, --to <address>", "search by recipient name or address")
    .option("-s, --subject <text>", "search by subject text")
    .option("-b, --body <text>", "search by body text")
    .option("--since <date>", "only messages on or after this date")
    .option("--before <date>", "only messages before this date")
    .option("-m, --months <n>", "shorthand: messages from the last N months")
    .option(
      "--mailbox <path>",
      "mailbox(es) to search (repeatable or comma-separated; omit for all)",
      collectValues,
      [],
    )
    .option("--exclude-mailbox <path>", "mailbox(es) to exclude (repeatable or comma-separated)", collectValues, [])
    .option("-l, --limit <n>", "max results per mailbox per account", "20")
    .action(
      wrapAction(async (query, opts) => {
        const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

        const { allResults, warnings } = await deps.searchCommand(query, opts, {
          targetAccounts,
          forEachAccount: deps.forEachAccount,
          listMailboxes: deps.listMailboxes,
        });

        for (const w of warnings) console.error(w);

        if (json || allResults.length > 0) {
          console.log(deps.formatSearchOutput(json, allResults));
        }
      }),
    );
}

/**
 * @param {import("commander").Command} program
 * @param {import("../cli-context.js").CliContext} ctx
 * @param {MailCliDeps} deps
 */
function registerReadCommand(program, ctx, deps) {
  const { wrapAction, contextDeps } = ctx;

  program
    .command("read")
    .description("Fetch and display a specific email by UID")
    .argument("<uid>", "message UID to read")
    .option("--mailbox <path>", "mailbox containing the message (auto-detects if omitted)")
    .option("--max-body <n>", "max body characters to display (default: 3000 for terminal)")
    .option("--raw", "output original HTML without stripping (for HTML emails)")
    .option("--headers", "include raw email headers in output")
    .action(
      wrapAction(async (uid, opts) => {
        const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

        const {
          account: acct,
          parsed,
          mailbox,
        } = await deps.readCommand(uid, opts, {
          targetAccounts,
          forEachAccount: deps.forEachAccount,
          listMailboxes: deps.listMailboxes,
          simpleParser: deps.simpleParser,
        });

        // Surface the resolved location. UIDs are per-mailbox, so a bare `read <uid>`
        // auto-detects a mailbox and can land on a different message than intended —
        // show which mailbox was used and how to pin it when it wasn't specified.
        console.error(`\n=== ${acct.name}${mailbox ? ` / ${mailbox}` : ""} ===`);
        if (!opts.mailbox && mailbox) {
          console.error(
            `(auto-detected mailbox; if this isn't the message you meant, re-run with ` +
              `--account "${acct.name}" --mailbox "${mailbox}" from your search result)`,
          );
        }
        console.log(deps.formatReadOutput(json, parsed, acct.name, uid, opts));
      }),
    );
}

/**
 * @param {import("commander").Command} program
 * @param {import("../cli-context.js").CliContext} ctx
 * @param {MailCliDeps} deps
 */
function registerFoldersCommand(program, ctx, deps) {
  const { wrapAction, contextDeps, progress } = ctx;
  const renderAuthProgress = progress(deps.renderAuthEvent);

  program
    .command("folders")
    .alias("list-folders")
    .description("List all IMAP folders for each configured account")
    .action(
      wrapAction(async (opts) => {
        const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

        const { allAccountFolders } = await deps.listFoldersCommand(
          opts,
          { targetAccounts, forEachAccount: deps.forEachAccount, listMailboxes: deps.listMailboxes },
          renderAuthProgress,
        );

        console.log(deps.formatFoldersOutput(json, allAccountFolders));
      }),
    );
}

/**
 * @param {import("commander").Command} program
 * @param {import("../cli-context.js").CliContext} ctx
 * @param {MailCliDeps} deps
 */
function registerExtractAttachmentCommand(program, ctx, deps) {
  const { wrapAction, contextDeps } = ctx;

  program
    .command("extract-attachment")
    .description("List or save attachments from a specific email by UID")
    .argument("<uid>", "message UID")
    .argument("[index]", "attachment index to save (0-based); omit to auto-select PDF or first non-signature")
    .option("--mailbox <name>", "mailbox containing the message (auto-detects if omitted)")
    .option("-o, --output <dir>", "output directory", ".")
    .option("--list", "list attachments without downloading")
    .action(
      wrapAction(async (uid, index, opts) => {
        const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

        const result = await deps.extractAttachmentCommand(
          uid,
          index === undefined ? undefined : parseInt(index, 10),
          opts,
          {
            targetAccounts,
            forEachAccount: deps.forEachAccount,
            listMailboxes: deps.listMailboxes,
            fsGateway: deps._fs,
          },
        );

        console.log(deps.formatAttachmentOutput(json, result));
      }),
    );
}

/**
 * @param {import("commander").Command} program
 * @param {import("../cli-context.js").CliContext} ctx
 * @param {MailCliDeps} deps
 */
function registerInboxCommand(program, ctx, deps) {
  const { wrapAction, contextDeps } = ctx;

  program
    .command("inbox")
    .description("Quick overview of recent inbox messages across accounts")
    .option("-l, --limit <n>", "max messages per account", "10")
    .option("--unread", "only show unread messages", false)
    .option("--since <date>", "only messages on or after this date (default: 7d)")
    .action(
      wrapAction(async (opts) => {
        const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

        const { resultsByAccount, allResults } = await deps.inboxCommand(opts, {
          targetAccounts,
          forEachAccount: deps.forEachAccount,
        });

        console.log(deps.formatInboxOutput(json, allResults, resultsByAccount));
      }),
    );
}

/**
 * @param {import("commander").Command} program
 * @param {import("../cli-context.js").CliContext} ctx
 * @param {MailCliDeps} deps
 */
function registerThreadCommand(program, ctx, deps) {
  const { wrapAction, contextDeps } = ctx;

  program
    .command("thread")
    .description("Show the full conversation thread containing a message")
    .argument("<uid>", "message UID to find the thread for")
    .option("--mailbox <path>", "mailbox containing the message (auto-detects if omitted)")
    .option("-l, --limit <n>", "max messages to show", "50")
    .option("--full", "show full message bodies", false)
    .action(
      wrapAction(async (uid, opts) => {
        const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

        const results = await deps.threadCommand(uid, opts, {
          targetAccounts,
          forEachAccount: deps.forEachAccount,
          listMailboxes: deps.listMailboxes,
        });

        for (const { account, output } of deps.formatThreadOutput(json, results, opts)) {
          console.error(`\n=== ${account} ===`);
          console.log(output);
        }
      }),
    );
}

/**
 * @param {import("commander").Command} program
 * @param {import("../cli-context.js").CliContext} ctx
 * @param {MailCliDeps} deps
 */
function registerContactsCommand(program, ctx, deps) {
  const { wrapAction, contextDeps } = ctx;

  program
    .command("contacts")
    .description("Extract frequent email contacts from recent messages")
    .option("-l, --limit <n>", "max contacts to show", "25")
    .option("--since <date>", "only messages on or after this date (default: 6m)")
    .option("--sent", "only show people you've sent TO", false)
    .option("--received", "only show people you've received FROM", false)
    .option("--search <text>", "filter contacts by name or address")
    .action(
      wrapAction(async (opts) => {
        const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

        const { contacts, sinceLabel } = await deps.contactsCommand(opts, {
          targetAccounts,
          forEachAccount: deps.forEachAccount,
        });

        console.log(deps.formatContactsOutput(json, contacts, { sinceLabel }));
      }),
    );
}

/**
 * Register the read-only mail noun commands: search, read, folders, extract-attachment,
 * inbox, thread, contacts.
 *
 * Adding a new read-only command means editing this file only.
 *
 * @param {import("commander").Command} program
 * @param {import("../cli-context.js").CliContext} ctx
 * @param {MailCliDeps} [deps]
 */
export function registerMailCommands(program, ctx, deps = mailDeps) {
  registerSearchCommand(program, ctx, deps);
  registerReadCommand(program, ctx, deps);
  registerFoldersCommand(program, ctx, deps);
  registerExtractAttachmentCommand(program, ctx, deps);
  registerInboxCommand(program, ctx, deps);
  registerThreadCommand(program, ctx, deps);
  registerContactsCommand(program, ctx, deps);
}
