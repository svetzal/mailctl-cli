#!/usr/bin/env node
import { join } from "node:path";
import { Command, Option } from "commander";
import { simpleParser } from "mailparser";
import { loadAccounts } from "./accounts.js";
import { renderAuthEvent } from "./auth-event-factories.js";
import {
  collectValues,
  createProgressRenderer,
  createResolveAccount,
  createResolveJson,
  emitPlanHint,
  filterAccountsByName,
  resolveCommandContext,
  resolvePlanApply,
  withErrorHandling,
} from "./cli-helpers.js";
import { classifyCommand } from "./commands/classify-command.js";
import { contactsCommand } from "./commands/contacts-command.js";
import { downloadCommand } from "./commands/download-command.js";
import { extractAttachmentCommand } from "./commands/extract-attachment-command.js";
import { flagCommand } from "./commands/flag-command.js";
import { importClassificationsCommand } from "./commands/import-classifications-command.js";
import { inboxCommand } from "./commands/inbox-command.js";
import { listFoldersCommand } from "./commands/list-folders-command.js";
import { moveCommand } from "./commands/move-command.js";
import { readCommand } from "./commands/read-command.js";
import { replyCommand } from "./commands/reply-command.js";
import { scanCommand } from "./commands/scan-command.js";
import { searchCommand } from "./commands/search-command.js";
import { sortCommand } from "./commands/sort-command.js";
import { threadCommand } from "./commands/thread-command.js";
import { DATA_DIR } from "./data-dir.js";
import { renderDownloadEvent } from "./download-event-factories.js";
import { formatAttachmentOutput } from "./format-attachment.js";
import { formatContactsOutput } from "./format-contacts.js";
import { formatDownloadOutput } from "./format-download.js";
import { formatFlagOutput } from "./format-flag.js";
import { formatFoldersOutput } from "./format-folders.js";
import { formatImportClassificationsOutput } from "./format-import-classifications.js";
import { formatInboxOutput } from "./format-inbox.js";
import { formatInitOutput } from "./format-init.js";
import { formatMoveOutput } from "./format-move.js";
import { formatReadOutput } from "./format-read.js";
import { formatReplyOutput } from "./format-reply.js";
import { formatClassifyOutput, formatScanOutput } from "./format-scan.js";
import { formatSearchOutput } from "./format-search.js";
import { formatSortOutput } from "./format-sort.js";
import { formatThreadOutput } from "./format-thread.js";
import { ConfirmGateway } from "./gateways/confirm-gateway.js";
import { EditorGateway } from "./gateways/editor-gateway.js";
import { FileSystemGateway } from "./gateways/fs-gateway.js";
import { KeychainGateway } from "./gateways/keychain-gateway.js";
import { SmtpGateway } from "./gateways/smtp-gateway.js";
import { forEachAccount, listMailboxes } from "./imap-client.js";
import { initCommand } from "./init.js";
import { loadOpenAiKey } from "./keychain.js";
import { downloadReceiptsCommand } from "./receipts/download-receipts-command.js";
import { renderDownloadReceiptsEvent } from "./receipts/download-receipts-event-factories.js";
import { formatDownloadReceiptsOutput } from "./receipts/format-download-receipts.js";
import { renderScanEvent } from "./scan-event-factories.js";
import { renderSortEvent } from "./sort-event-factories.js";

const _keychainSingleton = new KeychainGateway();
const _fsSingleton = new FileSystemGateway();

function makeRequireAccounts(keychain) {
  return () => {
    const accounts = loadAccounts(keychain);
    if (accounts.length === 0) {
      throw new Error("No accounts configured. Check ~/.config/mailctl/config.json and macOS Keychain.");
    }
    return accounts;
  };
}

function makeGetOpenAiKey(keychain) {
  let _cache;
  return () => {
    if (_cache === undefined) {
      _cache = loadOpenAiKey(keychain);
    }
    return _cache;
  };
}

/** Default production dependencies — real implementations wired up. */
export const defaultDeps = {
  // command orchestrators
  scanCommand,
  classifyCommand,
  importClassificationsCommand,
  sortCommand,
  downloadCommand,
  downloadReceiptsCommand,
  searchCommand,
  readCommand,
  listFoldersCommand,
  extractAttachmentCommand,
  moveCommand,
  inboxCommand,
  flagCommand,
  replyCommand,
  threadCommand,
  contactsCommand,
  initCommand,
  // formatters
  formatScanOutput,
  formatClassifyOutput,
  formatImportClassificationsOutput,
  formatSortOutput,
  formatDownloadOutput,
  formatDownloadReceiptsOutput,
  formatSearchOutput,
  formatReadOutput,
  formatFoldersOutput,
  formatAttachmentOutput,
  formatMoveOutput,
  formatInboxOutput,
  formatFlagOutput,
  formatReplyOutput,
  formatThreadOutput,
  formatContactsOutput,
  formatInitOutput,
  // progress renderers
  renderAuthEvent,
  renderScanEvent,
  renderSortEvent,
  renderDownloadEvent,
  renderDownloadReceiptsEvent,
  // data dir
  DATA_DIR,
  // gateways
  _fs: _fsSingleton,
  // helpers
  requireAccounts: makeRequireAccounts(_keychainSingleton),
  getOpenAiKey: makeGetOpenAiKey(_keychainSingleton),
  forEachAccount,
  listMailboxes,
  simpleParser,
  // dynamic import seam for download-receipts
  importDownloadReceipts: () => import("./receipts/download-receipts.js"),
  importVendorMap: () => import("./vendor-map.js"),
};

// Default lookback periods for Commander option defaults (strings match Commander's contract)
const SCAN_DEFAULT_MONTHS = "12";
const SORT_DEFAULT_MONTHS = "24";
const DOWNLOAD_DEFAULT_MONTHS = "24";
const DOWNLOAD_RECEIPTS_DEFAULT_MONTHS = "12";

/**
 * Build and return a configured Commander program instance without parsing.
 * Accepts a deps object for dependency injection (defaults to production deps).
 *
 * @param {Record<string, any>} deps
 * @returns {import("commander").Command}
 */
export function buildProgram(deps = defaultDeps) {
  const program = new Command();

  const resolveJson = createResolveJson(() => program.opts());
  const resolveAccount = createResolveAccount(() => program.opts());
  const contextDeps = { resolveJson, resolveAccount, requireAccounts: deps.requireAccounts, filterAccountsByName };
  const wrapAction = (/** @type {(...args: any[]) => Promise<void>} */ fn) => withErrorHandling(fn, resolveJson);

  /**
   * Attach the canonical plan/apply options to a mutating command: a visible
   * `--apply` and a hidden, deprecated `-n, --dry-run` (now the default, kept so
   * existing muscle memory and scripts don't break).
   * @param {import("commander").Command} cmd
   * @returns {import("commander").Command}
   */
  const mutating = (cmd) =>
    cmd
      .option("--apply", "execute the changes (previews by default)", false)
      .addOption(new Option("-n, --dry-run", "deprecated: preview is the default").hideHelp());

  const renderAuthProgress = createProgressRenderer(deps.renderAuthEvent);
  const renderScanProgress = createProgressRenderer(deps.renderScanEvent);
  const renderSortProgress = createProgressRenderer(deps.renderSortEvent);
  const renderDownloadProgress = createProgressRenderer(deps.renderDownloadEvent);
  const renderDownloadReceiptsProgress = createProgressRenderer(deps.renderDownloadReceiptsEvent);

  program
    .name("mailctl")
    .description("Personal email operations tool — receipt sorting, search, folder management, and more")
    .version("1.3.0")
    .option("--account <name>", "email account to use (searches all if omitted)")
    .option("--json", "output results as JSON");

  // --- Receipt operations ---
  //
  // These live under the `receipts` noun (`mailctl receipts scan`, etc.). The
  // pre-1.2 top-level names (`scan`, `sort`, `download`, `download-receipts`, …)
  // are kept as hidden aliases for back-compat. Each command is built by a
  // factory so the same definition can be registered under both parents; the
  // factory takes the command name because `download-receipts` becomes
  // `receipts extract`.

  const buildScanCommand = (name) =>
    new Command(name)
      .description("Scan configured email accounts for receipt-like messages")
      .option("-m, --months <n>", "months to look back", SCAN_DEFAULT_MONTHS)
      .option("-a, --all-mailboxes", "scan all mailboxes (slower)", false)
      .option("-o, --output <file>", "write raw results to JSON file")
      .option("--summary", "output aggregated sender summary (default)", true)
      .action(
        wrapAction(async (opts) => {
          const json = resolveJson(opts);
          const account = resolveAccount(opts);

          const { total, senders, rawPath, summaryPath } = await deps.scanCommand(
            opts,
            { account: account || null, dataDir: deps.DATA_DIR, fsGateway: deps._fs },
            renderScanProgress,
          );

          console.error(`Saved raw results to ${rawPath}`);
          console.error(`Saved sender summary to ${summaryPath}`);
          console.log(deps.formatScanOutput(json, total, senders));
        }),
      );

  const buildClassifyCommand = (name) =>
    new Command(name)
      .description("Interactively classify senders as business or personal (outputs JSON)")
      .option("-i, --input <file>", "sender summary JSON", join(deps.DATA_DIR, "senders.json"))
      .option("-o, --output <file>", "classification output", join(deps.DATA_DIR, "classifications.json"))
      .action(
        wrapAction(async (opts) => {
          const json = resolveJson(opts);

          const { unclassifiedList } = deps.classifyCommand(opts.input, opts.output, {
            fsGateway: deps._fs,
          });

          console.log(deps.formatClassifyOutput(json, unclassifiedList));
        }),
      );

  const buildImportClassificationsCommand = (name) =>
    new Command(name)
      .description("Import a classification JSON file")
      .argument("<file>", "JSON file with classifications")
      .option("-o, --output <file>", "classification store", join(deps.DATA_DIR, "classifications.json"))
      .action(
        wrapAction(async (file, opts) => {
          const json = resolveJson(opts);

          // Ensure the state dir exists — the default output lives under DATA_DIR,
          // which may not have been created yet if `scan` hasn't run.
          deps._fs.mkdir(join(opts.output, ".."));
          const { imported, path } = deps.importClassificationsCommand(file, opts.output, { fsGateway: deps._fs });

          console.log(deps.formatImportClassificationsOutput(json, imported, path));
        }),
      );

  const buildSortCommand = (name) =>
    mutating(
      new Command(name)
        .description("Move receipt emails into Receipts/Business and Receipts/Personal folders [Mutates with --apply]")
        .option("-m, --months <n>", "months to look back", SORT_DEFAULT_MONTHS),
    ).action(
      wrapAction(async (opts) => {
        const json = resolveJson(opts);
        const account = resolveAccount(opts);
        const applied = resolvePlanApply(opts);

        const stats = await deps.sortCommand(opts, { account: account || null }, renderSortProgress);

        console.log(deps.formatSortOutput(json, stats));
        emitPlanHint(applied, json);
      }),
    );

  const buildDownloadCommand = (name) =>
    mutating(
      new Command(name)
        .description("Download PDF attachments from business receipt emails [Mutates with --apply]")
        .option("-m, --months <n>", "months to look back", DOWNLOAD_DEFAULT_MONTHS)
        .option("-o, --output <dir>", "override output directory"),
    ).action(
      wrapAction(async (opts) => {
        const json = resolveJson(opts);
        const account = resolveAccount(opts);
        const applied = resolvePlanApply(opts);

        const stats = await deps.downloadCommand(opts, { account: account || null }, renderDownloadProgress);

        console.log(deps.formatDownloadOutput(json, stats));
        emitPlanHint(applied, json);
      }),
    );

  const buildExtractCommand = (name) =>
    mutating(
      new Command(name)
        .description("Download receipt PDFs and create JSON sidecar metadata files [Mutates with --apply]")
        .option("-o, --output <dir>", "root output directory", ".")
        .option("-m, --months <n>", "how far back to search", DOWNLOAD_RECEIPTS_DEFAULT_MONTHS)
        .option("--since <date>", "search from this date instead of months")
        .option("--reprocess", "re-run LLM extraction on existing receipt files", false)
        .option("--vendor <name>", "filter to a specific vendor (substring match)")
        .option("--list-vendors", "list vendors found in recent receipts", false)
        .option(
          "--include-empty",
          "also write sidecars when LLM extraction is empty (no amount, no invoice number, no PDF)",
          false,
        )
        .option("--max <n>", "stop after processing this many messages")
        .option("--timeout <seconds>", "per-message timeout in seconds (default: 120)")
        .option("--budget <seconds>", "overall wall-clock budget in seconds; stop cleanly when exceeded"),
    ).action(
      wrapAction(async (opts) => {
        const json = resolveJson(opts);
        const account = resolveAccount(opts);
        // --list-vendors is a read-only query; don't force it through plan/apply.
        const applied = opts.listVendors ? true : resolvePlanApply(opts);

        const commandDeps = {
          account: account || null,
          openAiKey: deps.getOpenAiKey(),
          importDownloadReceipts: deps.importDownloadReceipts,
          importVendorMap: deps.importVendorMap,
        };
        const result = await deps.downloadReceiptsCommand(opts, commandDeps, renderDownloadReceiptsProgress);
        console.log(deps.formatDownloadReceiptsOutput(json, result, opts));
        emitPlanHint(applied, json);
      }),
    );

  const receipts = program
    .command("receipts")
    .description("Receipt operations — scan, classify, sort, and download receipt mail");

  // { build, sub: name under `receipts`, legacy: pre-1.2 top-level name (hidden alias) }
  const receiptCommands = [
    { build: buildScanCommand, sub: "scan", legacy: "scan" },
    { build: buildClassifyCommand, sub: "classify", legacy: "classify" },
    { build: buildImportClassificationsCommand, sub: "import-classifications", legacy: "import-classifications" },
    { build: buildSortCommand, sub: "sort", legacy: "sort" },
    { build: buildDownloadCommand, sub: "download", legacy: "download" },
    { build: buildExtractCommand, sub: "extract", legacy: "download-receipts" },
  ];
  for (const { build, sub, legacy } of receiptCommands) {
    receipts.addCommand(build(sub));
    program.addCommand(build(legacy), { hidden: true });
  }

  // --- General email operations ---

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
        smtpGateway: new SmtpGateway(),
        editorGateway: new EditorGateway(),
        confirmGateway: new ConfirmGateway(),
      };
      const result = await deps.replyCommand(uid, opts, replyDeps);
      if ("aborted" in result) return void console.error("Aborted.");
      console.log(deps.formatReplyOutput(json, result));
      emitPlanHint(applied, json);
    }),
  );

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

  // --- Skill distribution ---

  program
    .command("init")
    .description("Install the mailctl companion skill across all cmx-managed agent platforms")
    .option("--local", "install into the current project instead of the user home")
    .option("--force", "overwrite drifted or newer installs")
    .action(
      wrapAction(async (opts) => {
        const json = resolveJson(opts);
        const result = await deps.initCommand(program.version() ?? "0.0.0", {
          local: !!opts.local,
          force: !!opts.force,
        });

        console.log(deps.formatInitOutput(json, result));
      }),
    );

  return program;
}

if (import.meta.main) {
  buildProgram(defaultDeps).parse();
}
