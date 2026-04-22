#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { program } from "commander";
import { simpleParser } from "mailparser";
import { loadAccounts } from "./accounts.js";
import { classifyCommand } from "./classify-command.js";
import { collectValues, filterAccountsByName, formatOutput, resolveCommandContext } from "./cli-helpers.js";
import { contactsCommand } from "./contacts-command.js";
import { downloadReceiptsCommand } from "./download-receipts-command.js";
import { downloadReceipts } from "./downloader.js";
import { extractAttachmentCommand } from "./extract-attachment-command.js";
import { flagCommand } from "./flag-command.js";
import {
  buildAttachmentListJson,
  buildAttachmentSavedJson,
  formatAttachmentListText,
  formatAttachmentSavedText,
} from "./format-attachment.js";
import { formatContactsText } from "./format-contacts.js";
import { formatDownloadResultText } from "./format-download.js";
import { buildDownloadReceiptsJson, formatDownloadReceiptsResultText } from "./format-download-receipts.js";
import { buildFlagResultJson, formatFlagResultText } from "./format-flag.js";
import { buildFoldersJson, formatFoldersText } from "./format-folders.js";
import { buildImportClassificationsJson } from "./format-import-classifications.js";
import { formatInboxText } from "./format-inbox.js";
import { buildInitJsonResult, formatInitResultText } from "./format-init.js";
import { buildMoveJson, formatMoveResultText } from "./format-move.js";
import { buildReadJson, formatReadResultText } from "./format-read.js";
import {
  buildReplyDryRunJson,
  buildReplySentJson,
  formatReplyDryRunText,
  formatReplySentText,
} from "./format-reply.js";
import { buildClassifyJson, buildScanJson, formatScanSummaryText, formatUnclassifiedText } from "./format-scan.js";
import { buildSearchJson, formatSearchResultsText } from "./format-search.js";
import { formatSortResultText } from "./format-sort.js";
import { buildThreadJson, formatThreadText } from "./format-thread.js";
import { ConfirmGateway } from "./gateways/confirm-gateway.js";
import { EditorGateway } from "./gateways/editor-gateway.js";
import { FileSystemGateway } from "./gateways/fs-gateway.js";
import { KeychainGateway } from "./gateways/keychain-gateway.js";
import { SmtpGateway } from "./gateways/smtp-gateway.js";
import { forEachAccount, listMailboxes } from "./imap-client.js";
import { importClassificationsCommand } from "./import-classifications-command.js";
import { inboxCommand } from "./inbox-command.js";
import { initCommand } from "./init.js";
import { loadOpenAiKey } from "./keychain.js";
import { moveCommand } from "./move-command.js";
import { readCommand } from "./read-command.js";
import { renderAuthEvent } from "./render-auth-events.js";
import { renderDownloadEvent } from "./render-download-events.js";
import { renderDownloadReceiptsEvent } from "./render-download-receipts-events.js";
import { renderScanEvent } from "./render-scan-events.js";
import { renderSortEvent } from "./render-sort-events.js";
import { replyCommand } from "./reply-command.js";
import { scanCommand } from "./scan-command.js";
import { searchCommand } from "./search-command.js";
import { sortReceipts } from "./sorter.js";
import { threadCommand } from "./thread-command.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

/**
 * Resolve the --json flag from either command-level or global options.
 * @param {object} opts - command-level options
 * @returns {boolean}
 */
function resolveJson(opts) {
  return !!(opts.json || program.opts().json);
}

/**
 * Resolve the --account flag from either command-level or global options.
 * @param {object} opts - command-level options
 * @returns {string|undefined}
 */
function resolveAccount(opts) {
  return opts.account || program.opts().account;
}

/**
 * Wrap a command action with consistent error handling.
 * Catches errors and outputs them appropriately for --json or human mode.
 */
function withErrorHandling(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      const localOpts = args[args.length - 1]?.opts?.() ?? args[args.length - 1] ?? {};
      const json = resolveJson(localOpts);
      if (json) {
        console.log(JSON.stringify({ error: err.message }));
      } else {
        console.error(`Error: ${err.message}`);
      }
      process.exit(1);
    }
  };
}

/** Shared keychain gateway — instantiated once, used by requireAccounts and openAiKey. */
const _keychain = new KeychainGateway();

/** Shared filesystem gateway — stateless thin wrapper, safe to share. */
const _fs = new FileSystemGateway();

/**
 * Load and validate accounts, throwing a consistent error if none configured.
 */
function requireAccounts() {
  const accounts = loadAccounts(_keychain);
  if (accounts.length === 0) {
    throw new Error("No accounts configured. Check ~/.config/mailctl/config.json and macOS Keychain.");
  }
  return accounts;
}

/** OpenAI API key read from keychain (lazy, cached). */
let _openAiKeyCache;
function getOpenAiKey() {
  if (_openAiKeyCache === undefined) {
    _openAiKeyCache = loadOpenAiKey(_keychain);
  }
  return _openAiKeyCache;
}

/** Shared dependency object for resolveCommandContext calls throughout this file. */
const contextDeps = { resolveJson, resolveAccount, requireAccounts, filterAccountsByName };

/**
 * Render M365 auth progress events to stderr.
 * @param {object} event
 */
function renderAuthProgress(event) {
  const line = renderAuthEvent(event);
  if (line) console.error(line);
}

program
  .name("mailctl")
  .description("Personal email operations tool — receipt sorting, search, folder management, and more")
  .version("1.0.3")
  .option("--account <name>", "email account to use (searches all if omitted)")
  .option("--json", "output results as JSON");

// --- Receipt operations ---

program
  .command("scan")
  .description("Scan configured email accounts for receipt-like messages")
  .option("-m, --months <n>", "months to look back", "12")
  .option("-a, --all-mailboxes", "scan all mailboxes (slower)", false)
  .option("-o, --output <file>", "write raw results to JSON file")
  .option("--summary", "output aggregated sender summary (default)", true)
  .action(
    withErrorHandling(async (opts) => {
      const json = resolveJson(opts);
      const account = resolveAccount(opts);

      const { total, senders, rawPath, summaryPath } = await scanCommand(
        opts,
        {
          account: account || null,
          dataDir: DATA_DIR,
          fsGateway: _fs,
        },
        (event) => {
          const line = renderScanEvent(event);
          if (line) console.error(line);
        },
      );

      console.error(`Saved raw results to ${rawPath}`);
      console.error(`Saved sender summary to ${summaryPath}`);

      console.log(formatOutput(json, buildScanJson(total, senders), formatScanSummaryText(senders, total)));
    }),
  );

program
  .command("classify")
  .description("Interactively classify senders as business or personal (outputs JSON)")
  .option("-i, --input <file>", "sender summary JSON", join(DATA_DIR, "senders.json"))
  .option("-o, --output <file>", "classification output", join(DATA_DIR, "classifications.json"))
  .action(
    withErrorHandling(async (opts) => {
      const json = resolveJson(opts);

      const { unclassifiedList } = classifyCommand(opts.input, opts.output, {
        fsGateway: _fs,
      });

      console.log(formatOutput(json, buildClassifyJson(unclassifiedList), formatUnclassifiedText(unclassifiedList)));
    }),
  );

program
  .command("import-classifications")
  .description("Import a classification JSON file")
  .argument("<file>", "JSON file with classifications")
  .option("-o, --output <file>", "classification store", join(DATA_DIR, "classifications.json"))
  .action(
    withErrorHandling(async (file, opts) => {
      const json = resolveJson(opts);

      const { imported, path } = importClassificationsCommand(file, opts.output, {
        fsGateway: _fs,
      });

      console.log(
        formatOutput(
          json,
          buildImportClassificationsJson(imported, path),
          `Imported ${imported} classifications to ${path}`,
        ),
      );
    }),
  );

program
  .command("sort")
  .description("Move receipt emails into Receipts/Business and Receipts/Personal folders")
  .option("-m, --months <n>", "months to look back", "24")
  .option("-n, --dry-run", "show what would be moved without actually moving", false)
  .action(
    withErrorHandling(async (opts) => {
      const json = resolveJson(opts);
      const account = resolveAccount(opts);
      const stats = await sortReceipts(
        {
          months: parseInt(opts.months, 10),
          dryRun: opts.dryRun,
          account: account || undefined,
        },
        {},
        (event) => {
          const line = renderSortEvent(event);
          if (line) console.error(line);
        },
      );

      console.log(formatOutput(json, stats, formatSortResultText(stats)));
    }),
  );

program
  .command("download")
  .description("Download PDF attachments from business receipt emails")
  .option("-m, --months <n>", "months to look back", "24")
  .option("-n, --dry-run", "show what would be downloaded without downloading", false)
  .option("-o, --output <dir>", "override output directory")
  .action(
    withErrorHandling(async (opts) => {
      const json = resolveJson(opts);
      const account = resolveAccount(opts);
      const stats = await downloadReceipts(
        {
          months: parseInt(opts.months, 10),
          dryRun: opts.dryRun,
          outputDir: opts.output,
          account: account || undefined,
        },
        {},
        (event) => {
          const line = renderDownloadEvent(event);
          if (line) console.error(line);
        },
      );

      console.log(formatOutput(json, stats, formatDownloadResultText(stats)));
    }),
  );

program
  .command("download-receipts")
  .description("Download receipt PDFs and create JSON sidecar metadata files")
  .option("-o, --output <dir>", "root output directory", ".")
  .option("-m, --months <n>", "how far back to search", "12")
  .option("--since <date>", "search from this date instead of months")
  .option("-n, --dry-run", "show what would be downloaded without writing", false)
  .option("--reprocess", "re-run LLM extraction on existing receipt files", false)
  .option("--vendor <name>", "filter to a specific vendor (substring match)")
  .option("--list-vendors", "list vendors found in recent receipts", false)
  .action(
    withErrorHandling(async (opts) => {
      const json = resolveJson(opts);
      const account = resolveAccount(opts);

      const result = await downloadReceiptsCommand(
        opts,
        {
          account: account || null,
          openAiKey: getOpenAiKey(),
          importDownloadReceipts: () => import("./download-receipts.js"),
          importVendorMap: () => import("./vendor-map.js"),
        },
        (event) => {
          const line = renderDownloadReceiptsEvent(event);
          if (line) console.error(line);
        },
      );

      console.log(
        formatOutput(json, buildDownloadReceiptsJson(result), formatDownloadReceiptsResultText(result, opts)),
      );
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
  .option("--mailbox <path>", "mailbox(es) to search (repeatable or comma-separated; omit for all)", collectValues, [])
  .option("--exclude-mailbox <path>", "mailbox(es) to exclude (repeatable or comma-separated)", collectValues, [])
  .option("-l, --limit <n>", "max results per mailbox per account", "20")
  .action(
    withErrorHandling(async (query, opts) => {
      const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

      const { allResults, warnings } = await searchCommand(query, opts, {
        targetAccounts,
        forEachAccount,
        listMailboxes,
      });

      for (const w of warnings) console.error(w);

      if (json || allResults.length > 0) {
        console.log(formatOutput(json, buildSearchJson(allResults), formatSearchResultsText(allResults)));
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
    withErrorHandling(async (uid, opts) => {
      const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);
      const maxBodyExplicit = opts.maxBody !== undefined;
      const maxBody = maxBodyExplicit ? parseInt(opts.maxBody, 10) : 3000;

      const { account: acct, parsed } = await readCommand(uid, opts, {
        targetAccounts,
        forEachAccount,
        listMailboxes,
        simpleParser,
      });

      console.error(`\n=== ${acct.name} ===`);

      console.log(
        formatOutput(
          json,
          buildReadJson(parsed, acct.name, uid, {
            maxBody,
            maxBodyExplicit,
            includeHeaders: !!opts.headers,
          }),
          formatReadResultText(parsed, {
            maxBody,
            showHeaders: !!opts.headers,
            showRaw: !!opts.raw,
          }),
        ),
      );
    }),
  );

program
  .command("list-folders")
  .description("List all IMAP folders for each configured account")
  .action(
    withErrorHandling(async (opts) => {
      const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

      const allAccountFolders = [];

      await forEachAccount(
        targetAccounts,
        async (client, acct) => {
          const folders = await listMailboxes(client);
          allAccountFolders.push({
            account: acct.name,
            folders: folders.map((f) => ({ path: f.path, specialUse: f.specialUse || null })),
          });
        },
        renderAuthProgress,
      );

      console.log(formatOutput(json, buildFoldersJson(allAccountFolders), formatFoldersText(allAccountFolders)));
    }),
  );

program
  .command("extract-attachment")
  .description("List or save attachments from a specific email by UID")
  .argument("<uid>", "message UID")
  .argument("[index]", "attachment index to save (0-based)", "0")
  .option("--mailbox <name>", "mailbox containing the message (auto-detects if omitted)")
  .option("-o, --output <dir>", "output directory", ".")
  .option("--list", "list attachments without downloading")
  .action(
    withErrorHandling(async (uid, index, opts) => {
      const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);
      const attachmentIndex = parseInt(index, 10);

      const result = await extractAttachmentCommand(uid, attachmentIndex, opts, {
        targetAccounts,
        forEachAccount,
        listMailboxes,
        fsGateway: _fs,
      });

      if (result.list) {
        console.log(formatOutput(json, buildAttachmentListJson(result), formatAttachmentListText(result.attachments)));
        return;
      }

      if ("path" in result) {
        console.log(formatOutput(json, buildAttachmentSavedJson(result), formatAttachmentSavedText(result.path)));
      }
    }),
  );

program
  .command("move")
  .description("Move emails by UID to a specified IMAP folder")
  .argument("<uids...>", "message UIDs (space or comma-separated; prefix with account: if --account omitted)")
  .requiredOption("--to <folder>", "destination IMAP folder (e.g. Junk, [Gmail]/Spam, Archive)")
  .option("--mailbox <source>", "source mailbox to move from", "INBOX")
  .option("-n, --dry-run", "show what would be moved without executing", false)
  .action(
    withErrorHandling(async (uids, opts) => {
      const { json, account, accounts } = resolveCommandContext(opts, contextDeps);

      const { stats, results } = await moveCommand(uids, opts, {
        accounts,
        account: account || null,
        forEachAccount,
        listMailboxes,
      });

      console.log(formatOutput(json, buildMoveJson(stats, results), formatMoveResultText(stats)));
    }),
  );

program
  .command("inbox")
  .description("Quick overview of recent inbox messages across accounts")
  .option("-l, --limit <n>", "max messages per account", "10")
  .option("--unread", "only show unread messages", false)
  .option("--since <date>", "only messages on or after this date (default: 7d)")
  .action(
    withErrorHandling(async (opts) => {
      const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

      const { resultsByAccount, allResults } = await inboxCommand(opts, {
        targetAccounts,
        forEachAccount,
      });

      console.log(formatOutput(json, allResults, formatInboxText(resultsByAccount)));
    }),
  );

program
  .command("flag")
  .description("Set or clear flags on messages (read, unread, star, unstar)")
  .argument("<uids...>", "message UIDs (space or comma-separated; prefix with account: if --account omitted)")
  .option("--read", "mark as read (add \\Seen)")
  .option("--unread", "mark as unread (remove \\Seen)")
  .option("--star", "add star/flag (add \\Flagged)")
  .option("--unstar", "remove star/flag (remove \\Flagged)")
  .option("--mailbox <path>", "mailbox containing the messages (auto-detects if omitted)")
  .option("-n, --dry-run", "show what would change without modifying", false)
  .action(
    withErrorHandling(async (uids, opts) => {
      const { json, account, accounts } = resolveCommandContext(opts, contextDeps);

      const { stats, results } = await flagCommand(uids, opts, {
        accounts,
        account: account || null,
        forEachAccount,
        listMailboxes,
      });

      console.log(formatOutput(json, buildFlagResultJson(stats, results), formatFlagResultText(stats, results)));
    }),
  );

program
  .command("reply")
  .description("Reply to an email by UID via SMTP")
  .argument("<uid>", "message UID to reply to")
  .option("--message <text>", "reply message text (inline)")
  .option("--message-file <path>", "read reply text from a file")
  .option("--edit", "open $EDITOR to compose the reply", false)
  .option("--mailbox <path>", "mailbox containing the message (auto-detects if omitted)")
  .option("--cc <addresses>", "CC recipients (comma-separated)")
  .option("-n, --dry-run", "show composed email without sending", false)
  .option("-y, --yes", "skip confirmation when using --edit", false)
  .action(
    withErrorHandling(async (uid, opts) => {
      const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

      const result = await replyCommand(uid, opts, {
        targetAccounts,
        forEachAccount,
        listMailboxes,
        simpleParser,
        fsGateway: _fs,
        smtpGateway: new SmtpGateway(),
        editorGateway: new EditorGateway(),
        confirmGateway: new ConfirmGateway(),
      });

      if ("aborted" in result) {
        console.error("Aborted.");
        return;
      }

      if ("dryRun" in result) {
        const { message } = result;
        console.log(formatOutput(json, buildReplyDryRunJson(message), formatReplyDryRunText(message)));
        return;
      }

      console.log(formatOutput(json, buildReplySentJson(result), formatReplySentText(result)));
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
    withErrorHandling(async (uid, opts) => {
      const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

      const results = await threadCommand(uid, opts, {
        targetAccounts,
        forEachAccount,
        listMailboxes,
      });

      for (const { account: acctName, threadSize, fallback, messages } of results) {
        console.error(`\n=== ${acctName} ===`);
        console.log(
          formatOutput(
            json,
            buildThreadJson(acctName, threadSize, fallback, messages),
            formatThreadText(messages, { full: opts.full, fallback }),
          ),
        );
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
    withErrorHandling(async (opts) => {
      const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

      const { contacts, sinceLabel } = await contactsCommand(opts, {
        targetAccounts,
        forEachAccount,
      });

      console.log(formatOutput(json, contacts, formatContactsText(contacts, { sinceLabel })));
    }),
  );

// --- Skill distribution ---

program
  .command("init")
  .description("Install mailctl skill files for Claude Code")
  .option("-g, --global", "install to ~/.claude (global) instead of .claude/ in CWD")
  .option("--force", "overwrite even if installed skill is from a newer version")
  .action(
    withErrorHandling(async (opts) => {
      const json = resolveJson(opts);
      const result = await initCommand(program.version() ?? "0.0.0", { global: !!opts.global, force: !!opts.force });

      console.log(formatOutput(json, buildInitJsonResult(result), formatInitResultText(result)));
    }),
  );

program.parse();
