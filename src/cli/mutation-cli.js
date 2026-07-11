import { Command } from "commander";
import { simpleParser } from "mailparser";
import { emitPlanHint, resolveCommandContext, resolvePlanApply } from "../cli-helpers.js";
import { flagCommand } from "../commands/flag-command.js";
import { moveCommand } from "../commands/move-command.js";
import { replyCommand } from "../commands/reply-command.js";
import { formatFlagOutput } from "../format-flag.js";
import { formatMoveOutput } from "../format-move.js";
import { formatReplyOutput } from "../format-reply.js";
import { ConfirmGateway } from "../gateways/confirm-gateway.js";
import { EditorGateway } from "../gateways/editor-gateway.js";
import { FileSystemGateway } from "../gateways/fs-gateway.js";
import { SmtpGateway } from "../gateways/smtp-gateway.js";
import { forEachAccount, listMailboxes } from "../imap-client.js";

/**
 * @typedef {object} MutationCliDeps
 * @property {Function} moveCommand
 * @property {Function} flagCommand
 * @property {Function} replyCommand
 * @property {Function} formatMoveOutput
 * @property {Function} formatFlagOutput
 * @property {Function} formatReplyOutput
 * @property {Function} forEachAccount
 * @property {Function} listMailboxes
 * @property {Function} simpleParser
 * @property {object} _fs
 * @property {object} smtpGateway
 * @property {object} editorGateway
 * @property {object} confirmGateway
 */

/** @type {MutationCliDeps} */
export const mutationDeps = {
  moveCommand,
  flagCommand,
  replyCommand,
  formatMoveOutput,
  formatFlagOutput,
  formatReplyOutput,
  forEachAccount,
  listMailboxes,
  simpleParser,
  _fs: new FileSystemGateway(),
  smtpGateway: new SmtpGateway(),
  editorGateway: new EditorGateway(),
  confirmGateway: new ConfirmGateway(),
};

/**
 * Register the mutating message commands: move, flag, reply.
 * All commands default to preview mode; pass `--apply` to execute.
 *
 * Adding a new mutating command means editing this file only.
 *
 * @param {import("commander").Command} program
 * @param {import("../cli-context.js").CliContext} ctx
 * @param {MutationCliDeps} [deps]
 */
export function registerMutationCommands(program, ctx, deps = mutationDeps) {
  const { wrapAction, mutating, contextDeps } = ctx;

  mutating(
    program
      .command("move")
      .description("Move emails by UID to a specified IMAP folder [Mutates with --apply]")
      .argument("<uids...>", "message UIDs (space or comma-separated; prefix with account: if --account omitted)")
      .requiredOption("--to <folder>", "destination IMAP folder (e.g. Junk, [Gmail]/Spam, Archive)")
      .option("--mailbox <source>", "source mailbox to move from", "INBOX"),
  ).action(
    wrapAction(async (uids, opts) => {
      const { json, account, accounts } = resolveCommandContext(opts, contextDeps);
      const applied = resolvePlanApply(opts);

      const { stats, results } = await deps.moveCommand(uids, opts, {
        accounts,
        account: account || null,
        forEachAccount: deps.forEachAccount,
        listMailboxes: deps.listMailboxes,
      });

      console.log(deps.formatMoveOutput(json, stats, results));
      emitPlanHint(applied, json);
    }),
  );

  mutating(
    program
      .command("flag")
      .description("Set or clear flags on messages (read, unread, star, unstar) [Mutates with --apply]")
      .argument("<uids...>", "message UIDs (space or comma-separated; prefix with account: if --account omitted)")
      .option("--read", "mark as read (add \\Seen)")
      .option("--unread", "mark as unread (remove \\Seen)")
      .option("--star", "add star/flag (add \\Flagged)")
      .option("--unstar", "remove star/flag (remove \\Flagged)")
      .option("--mailbox <path>", "mailbox containing the messages (auto-detects if omitted)"),
  ).action(
    wrapAction(async (uids, opts) => {
      const { json, account, accounts } = resolveCommandContext(opts, contextDeps);
      const applied = resolvePlanApply(opts);

      const { stats, results } = await deps.flagCommand(uids, opts, {
        accounts,
        account: account || null,
        forEachAccount: deps.forEachAccount,
        listMailboxes: deps.listMailboxes,
      });

      console.log(deps.formatFlagOutput(json, stats, results));
      emitPlanHint(applied, json);
    }),
  );

  mutating(
    program
      .command("reply")
      .description("Reply to an email by UID via SMTP [Mutates with --apply]")
      .argument("<uid>", "message UID to reply to")
      .option("--message <text>", "reply message text (inline)")
      .option("--message-file <path>", "read reply text from a file")
      .option("--edit", "open $EDITOR to compose the reply", false)
      .option("--mailbox <path>", "mailbox containing the message (auto-detects if omitted)")
      .option("--cc <addresses>", "CC recipients (comma-separated)")
      .option("-y, --yes", "skip confirmation when using --edit --apply", false),
  ).action(
    wrapAction(async (uid, opts) => {
      const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);
      const applied = resolvePlanApply(opts);

      const replyDeps = {
        targetAccounts,
        forEachAccount: deps.forEachAccount,
        listMailboxes: deps.listMailboxes,
        simpleParser: deps.simpleParser,
        fsGateway: deps._fs,
        smtpGateway: deps.smtpGateway,
        editorGateway: deps.editorGateway,
        confirmGateway: deps.confirmGateway,
      };
      const result = await deps.replyCommand(uid, opts, replyDeps);
      if ("aborted" in result) return void console.error("Aborted.");
      console.log(deps.formatReplyOutput(json, result));
      emitPlanHint(applied, json);
    }),
  );
}
