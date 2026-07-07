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
const defaultDeps = {
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
  _keychain: _keychainSingleton,
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
  const {
    scanCommand: _scanCommand,
    classifyCommand: _classifyCommand,
    importClassificationsCommand: _importClassificationsCommand,
    sortCommand: _sortCommand,
    downloadCommand: _downloadCommand,
    downloadReceiptsCommand: _downloadReceiptsCommand,
    searchCommand: _searchCommand,
    readCommand: _readCommand,
    listFoldersCommand: _listFoldersCommand,
    extractAttachmentCommand: _extractAttachmentCommand,
    moveCommand: _moveCommand,
    inboxCommand: _inboxCommand,
    flagCommand: _flagCommand,
    replyCommand: _replyCommand,
    threadCommand: _threadCommand,
    contactsCommand: _contactsCommand,
    initCommand: _initCommand,
    formatScanOutput: _formatScanOutput,
    formatClassifyOutput: _formatClassifyOutput,
    formatImportClassificationsOutput: _formatImportClassificationsOutput,
    formatSortOutput: _formatSortOutput,
    formatDownloadOutput: _formatDownloadOutput,
    formatDownloadReceiptsOutput: _formatDownloadReceiptsOutput,
    formatSearchOutput: _formatSearchOutput,
    formatReadOutput: _formatReadOutput,
    formatFoldersOutput: _formatFoldersOutput,
    formatAttachmentOutput: _formatAttachmentOutput,
    formatMoveOutput: _formatMoveOutput,
    formatInboxOutput: _formatInboxOutput,
    formatFlagOutput: _formatFlagOutput,
    formatReplyOutput: _formatReplyOutput,
    formatThreadOutput: _formatThreadOutput,
    formatContactsOutput: _formatContactsOutput,
    formatInitOutput: _formatInitOutput,
    renderAuthEvent: _renderAuthEvent,
    renderScanEvent: _renderScanEvent,
    renderSortEvent: _renderSortEvent,
    renderDownloadEvent: _renderDownloadEvent,
    renderDownloadReceiptsEvent: _renderDownloadReceiptsEvent,
    DATA_DIR: _DATA_DIR,
    _fs,
    requireAccounts,
    getOpenAiKey,
    forEachAccount: _forEachAccount,
    listMailboxes: _listMailboxes,
    simpleParser: _simpleParser,
    importDownloadReceipts,
    importVendorMap,
  } = deps;

  const program = new Command();

  const resolveJson = createResolveJson(() => program.opts());
  const resolveAccount = createResolveAccount(() => program.opts());
  const contextDeps = { resolveJson, resolveAccount, requireAccounts, filterAccountsByName };
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

  const renderAuthProgress = createProgressRenderer(_renderAuthEvent);
  const renderScanProgress = createProgressRenderer(_renderScanEvent);
  const renderSortProgress = createProgressRenderer(_renderSortEvent);
  const renderDownloadProgress = createProgressRenderer(_renderDownloadEvent);
  const renderDownloadReceiptsProgress = createProgressRenderer(_renderDownloadReceiptsEvent);

  program
    .name("mailctl")
    .description("Personal email operations tool — receipt sorting, search, folder management, and more")
    .version("1.2.0")
    .option("--account <name>", "email account to use (searches all if omitted)")
    .option("--json", "output results as JSON");

  // --- Receipt operations ---

  program
    .command("scan")
    .description("Scan configured email accounts for receipt-like messages")
    .option("-m, --months <n>", "months to look back", SCAN_DEFAULT_MONTHS)
    .option("-a, --all-mailboxes", "scan all mailboxes (slower)", false)
    .option("-o, --output <file>", "write raw results to JSON file")
    .option("--summary", "output aggregated sender summary (default)", true)
    .action(
      wrapAction(async (opts) => {
        const json = resolveJson(opts);
        const account = resolveAccount(opts);

        const { total, senders, rawPath, summaryPath } = await _scanCommand(
          opts,
          { account: account || null, dataDir: _DATA_DIR, fsGateway: _fs },
          renderScanProgress,
        );

        console.error(`Saved raw results to ${rawPath}`);
        console.error(`Saved sender summary to ${summaryPath}`);
        console.log(_formatScanOutput(json, total, senders));
      }),
    );

  program
    .command("classify")
    .description("Interactively classify senders as business or personal (outputs JSON)")
    .option("-i, --input <file>", "sender summary JSON", join(_DATA_DIR, "senders.json"))
    .option("-o, --output <file>", "classification output", join(_DATA_DIR, "classifications.json"))
    .action(
      wrapAction(async (opts) => {
        const json = resolveJson(opts);

        const { unclassifiedList } = _classifyCommand(opts.input, opts.output, {
          fsGateway: _fs,
        });

        console.log(_formatClassifyOutput(json, unclassifiedList));
      }),
    );

  program
    .command("import-classifications")
    .description("Import a classification JSON file")
    .argument("<file>", "JSON file with classifications")
    .option("-o, --output <file>", "classification store", join(_DATA_DIR, "classifications.json"))
    .action(
      wrapAction(async (file, opts) => {
        const json = resolveJson(opts);

        // Ensure the state dir exists — the default output lives under DATA_DIR,
        // which may not have been created yet if `scan` hasn't run.
        _fs.mkdir(join(opts.output, ".."));
        const { imported, path } = _importClassificationsCommand(file, opts.output, { fsGateway: _fs });

        console.log(_formatImportClassificationsOutput(json, imported, path));
      }),
    );

  mutating(
    program
      .command("sort")
      .description("Move receipt emails into Receipts/Business and Receipts/Personal folders [Mutates with --apply]")
      .option("-m, --months <n>", "months to look back", SORT_DEFAULT_MONTHS),
  ).action(
    wrapAction(async (opts) => {
      const json = resolveJson(opts);
      const account = resolveAccount(opts);
      const applied = resolvePlanApply(opts);

      const stats = await _sortCommand(opts, { account: account || null }, renderSortProgress);

      console.log(_formatSortOutput(json, stats));
      emitPlanHint(applied, json);
    }),
  );

  mutating(
    program
      .command("download")
      .description("Download PDF attachments from business receipt emails [Mutates with --apply]")
      .option("-m, --months <n>", "months to look back", DOWNLOAD_DEFAULT_MONTHS)
      .option("-o, --output <dir>", "override output directory"),
  ).action(
    wrapAction(async (opts) => {
      const json = resolveJson(opts);
      const account = resolveAccount(opts);
      const applied = resolvePlanApply(opts);

      const stats = await _downloadCommand(opts, { account: account || null }, renderDownloadProgress);

      console.log(_formatDownloadOutput(json, stats));
      emitPlanHint(applied, json);
    }),
  );

  mutating(
    program
      .command("download-receipts")
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
        openAiKey: getOpenAiKey(),
        importDownloadReceipts,
        importVendorMap,
      };
      const result = await _downloadReceiptsCommand(opts, commandDeps, renderDownloadReceiptsProgress);
      console.log(_formatDownloadReceiptsOutput(json, result, opts));
      emitPlanHint(applied, json);
    }),
  );

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

        const { allResults, warnings } = await _searchCommand(query, opts, {
          targetAccounts,
          forEachAccount: _forEachAccount,
          listMailboxes: _listMailboxes,
        });

        for (const w of warnings) console.error(w);

        if (json || allResults.length > 0) {
          console.log(_formatSearchOutput(json, allResults));
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
        } = await _readCommand(uid, opts, {
          targetAccounts,
          forEachAccount: _forEachAccount,
          listMailboxes: _listMailboxes,
          simpleParser: _simpleParser,
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
        console.log(_formatReadOutput(json, parsed, acct.name, uid, opts));
      }),
    );

  program
    .command("folders")
    .alias("list-folders")
    .description("List all IMAP folders for each configured account")
    .action(
      wrapAction(async (opts) => {
        const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

        const { allAccountFolders } = await _listFoldersCommand(
          opts,
          { targetAccounts, forEachAccount: _forEachAccount, listMailboxes: _listMailboxes },
          renderAuthProgress,
        );

        console.log(_formatFoldersOutput(json, allAccountFolders));
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

        const result = await _extractAttachmentCommand(
          uid,
          index === undefined ? undefined : parseInt(index, 10),
          opts,
          {
            targetAccounts,
            forEachAccount: _forEachAccount,
            listMailboxes: _listMailboxes,
            fsGateway: _fs,
          },
        );

        console.log(_formatAttachmentOutput(json, result));
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

      const { stats, results } = await _moveCommand(uids, opts, {
        accounts,
        account: account || null,
        forEachAccount: _forEachAccount,
        listMailboxes: _listMailboxes,
      });

      console.log(_formatMoveOutput(json, stats, results));
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

        const { resultsByAccount, allResults } = await _inboxCommand(opts, {
          targetAccounts,
          forEachAccount: _forEachAccount,
        });

        console.log(_formatInboxOutput(json, allResults, resultsByAccount));
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

      const { stats, results } = await _flagCommand(uids, opts, {
        accounts,
        account: account || null,
        forEachAccount: _forEachAccount,
        listMailboxes: _listMailboxes,
      });

      console.log(_formatFlagOutput(json, stats, results));
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
        forEachAccount: _forEachAccount,
        listMailboxes: _listMailboxes,
        simpleParser: _simpleParser,
        fsGateway: _fs,
        smtpGateway: new SmtpGateway(),
        editorGateway: new EditorGateway(),
        confirmGateway: new ConfirmGateway(),
      };
      const result = await _replyCommand(uid, opts, replyDeps);
      if ("aborted" in result) return void console.error("Aborted.");
      console.log(_formatReplyOutput(json, result));
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

        const results = await _threadCommand(uid, opts, {
          targetAccounts,
          forEachAccount: _forEachAccount,
          listMailboxes: _listMailboxes,
        });

        for (const { account, output } of _formatThreadOutput(json, results, opts)) {
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

        const { contacts, sinceLabel } = await _contactsCommand(opts, {
          targetAccounts,
          forEachAccount: _forEachAccount,
        });

        console.log(_formatContactsOutput(json, contacts, { sinceLabel }));
      }),
    );

  // --- Skill distribution ---

  program
    .command("init")
    .description("Install the mailctl companion skill for Claude Code (global by default)")
    .option("--local", "install to .claude/ in the current directory instead of ~/.claude")
    .option("--force", "overwrite even if installed skill is from a newer version")
    .action(
      wrapAction(async (opts) => {
        const json = resolveJson(opts);
        const result = await _initCommand(program.version() ?? "0.0.0", {
          global: !opts.local,
          force: !!opts.force,
        });

        console.log(_formatInitOutput(json, result));
      }),
    );

  return program;
}

if (import.meta.main) {
  buildProgram(defaultDeps).parse();
}
