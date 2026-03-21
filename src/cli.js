#!/usr/bin/env node
import { program } from "commander";
import { sortReceipts } from "./sorter.js";
import { downloadReceipts } from "./downloader.js";
import { loadAccounts } from "./accounts.js";
import { listMailboxes, forEachAccount } from "./imap-client.js";
import { FileSystemGateway } from "./gateways/fs-gateway.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { simpleParser } from "mailparser";
import { collectValues, filterAccountsByName, resolveCommandContext } from "./cli-helpers.js";
import { readCommand } from "./read-command.js";
import { flagCommand } from "./flag-command.js";
import { searchCommand } from "./search-command.js";
import { threadCommand } from "./thread-command.js";
import { inboxCommand } from "./inbox-command.js";
import { contactsCommand } from "./contacts-command.js";
import { scanCommand } from "./scan-command.js";
import { classifyCommand } from "./classify-command.js";
import { importClassificationsCommand } from "./import-classifications-command.js";
import { downloadReceiptsCommand } from "./download-receipts-command.js";
import { extractAttachmentCommand } from "./extract-attachment-command.js";
import { moveCommand } from "./move-command.js";
import { buildReadResult, formatReadResultText } from "./read-email.js";
import { formatScanSummaryText, formatUnclassifiedText } from "./format-scan.js";
import { formatSearchResultsText } from "./format-search.js";
import { formatMoveResultText } from "./format-move.js";
import { formatInboxText } from "./inbox.js";
import { SmtpGateway } from "./gateways/smtp-gateway.js";
import { replyCommand } from "./reply-command.js";
import { EditorGateway } from "./gateways/editor-gateway.js";
import { ConfirmGateway } from "./gateways/confirm-gateway.js";
import { formatThreadText } from "./thread.js";
import { formatContactsText } from "./contacts.js";
import { initCommand } from "./init.js";

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

/**
 * Load and validate accounts, throwing a consistent error if none configured.
 */
function requireAccounts() {
  const accounts = loadAccounts();
  if (accounts.length === 0) {
    throw new Error("No email accounts configured. Check keychain credentials and bin/run wrapper.");
  }
  return accounts;
}

/** Shared dependency object for resolveCommandContext calls throughout this file. */
const contextDeps = { resolveJson, resolveAccount, requireAccounts, filterAccountsByName };

program
  .name("mailctl")
  .description("Personal email operations tool — receipt sorting, search, folder management, and more")
  .version("0.7.2")
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
  .action(withErrorHandling(async (opts) => {
    const json = resolveJson(opts);
    const account = resolveAccount(opts);

    const { total, senders, rawPath, summaryPath } = await scanCommand(opts, {
      account: account || null,
      dataDir: DATA_DIR,
      fsGateway: new FileSystemGateway(),
    });

    console.error(`Saved raw results to ${rawPath}`);
    console.error(`Saved sender summary to ${summaryPath}`);

    if (json) {
      console.log(JSON.stringify({ total, senders }));
      return;
    }

    console.log(formatScanSummaryText(senders, total));
  }));

program
  .command("classify")
  .description("Interactively classify senders as business or personal (outputs JSON)")
  .option("-i, --input <file>", "sender summary JSON", join(DATA_DIR, "senders.json"))
  .option("-o, --output <file>", "classification output", join(DATA_DIR, "classifications.json"))
  .action(withErrorHandling(async (opts) => {
    const json = resolveJson(opts);

    const { unclassifiedList } = classifyCommand(opts.input, opts.output, {
      fsGateway: new FileSystemGateway(),
    });

    if (json) {
      console.log(JSON.stringify({ unclassified: unclassifiedList }));
    } else {
      console.log(formatUnclassifiedText(unclassifiedList));
    }
  }));

program
  .command("import-classifications")
  .description("Import a classification JSON file")
  .argument("<file>", "JSON file with classifications")
  .option("-o, --output <file>", "classification store", join(DATA_DIR, "classifications.json"))
  .action(withErrorHandling(async (file, opts) => {
    const json = resolveJson(opts);

    const { imported, path } = importClassificationsCommand(file, opts.output, {
      fsGateway: new FileSystemGateway(),
    });

    if (json) {
      console.log(JSON.stringify({ imported, path }));
    } else {
      console.log(`Imported ${imported} classifications to ${path}`);
    }
  }));

program
  .command("sort")
  .description("Move receipt emails into Receipts/Business and Receipts/Personal folders")
  .option("-m, --months <n>", "months to look back", "24")
  .option("-n, --dry-run", "show what would be moved without actually moving", false)
  .action(withErrorHandling(async (opts) => {
    const json = resolveJson(opts);
    const account = resolveAccount(opts);
    const stats = await sortReceipts({
      months: parseInt(opts.months, 10),
      dryRun: opts.dryRun,
      account: account || null,
    });

    if (json) {
      console.log(JSON.stringify(stats));
      return;
    }

    console.log("\n=== Sort Complete ===");
    console.log(`Moved:        ${stats.moved}`);
    console.log(`Skipped:      ${stats.skipped}`);
    console.log(`Unclassified: ${stats.unclassified} (defaulted to personal)`);
  }));

program
  .command("download")
  .description("Download PDF attachments from business receipt emails")
  .option("-m, --months <n>", "months to look back", "24")
  .option("-n, --dry-run", "show what would be downloaded without downloading", false)
  .option("-o, --output <dir>", "override output directory")
  .action(withErrorHandling(async (opts) => {
    const json = resolveJson(opts);
    const account = resolveAccount(opts);
    const stats = await downloadReceipts({
      months: parseInt(opts.months, 10),
      dryRun: opts.dryRun,
      outputDir: opts.output,
      account: account || null,
    });

    if (json) {
      console.log(JSON.stringify(stats));
      return;
    }

    console.log("\n=== Download Complete ===");
    console.log(`Downloaded:    ${stats.downloaded}`);
    console.log(`Already had:   ${stats.alreadyHave}`);
    console.log(`No PDF:        ${stats.noPdf}`);
    console.log(`Skipped/Error: ${stats.skipped}`);
  }));

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
  .action(withErrorHandling(async (opts) => {
    const json = resolveJson(opts);
    const account = resolveAccount(opts);

    const result = await downloadReceiptsCommand(opts, {
      account: account || null,
      importDownloadReceipts: () => import("./download-receipts.js"),
      importVendorMap: () => import("./vendor-map.js"),
    });

    if (json) {
      if (result.mode === "listVendors") {
        console.log(JSON.stringify({ configVendors: result.configVendors, recentVendors: result.recentVendors }));
      } else if (result.mode === "reprocess") {
        const { mode, ...rest } = result;
        console.log(JSON.stringify(rest));
      } else {
        console.log(JSON.stringify({ stats: result.stats, records: result.records }));
      }
      return;
    }

    if (result.mode === "listVendors") {
      if (result.configVendors.length > 0) {
        console.log("Known vendors (from config):");
        console.log(`  ${result.configVendors.join(", ")}`);
        console.log();
      }
      if (result.recentVendors.length > 0) {
        const monthLabel = opts.since ? `since ${opts.since}` : `last ${opts.months} months`;
        console.log(`Recent vendors (${monthLabel}):`);
        for (const v of result.recentVendors) {
          console.log(`  ${v.vendor} (${v.count} receipt${v.count === 1 ? "" : "s"})`);
        }
      } else {
        console.log("No receipt vendors found in the search period.");
      }
    } else if (result.mode === "reprocess") {
      console.log("\n=== Reprocess Complete ===");
      console.log(`Reprocessed:   ${result.reprocessed}`);
      console.log(`Skipped:       ${result.skipped}`);
      console.log(`Errors:        ${result.errors}`);
    } else {
      console.log("\n=== Download Receipts Complete ===");
      console.log(`Found:         ${result.stats.found}`);
      console.log(`Downloaded:    ${result.stats.downloaded}`);
      console.log(`No PDF:        ${result.stats.noPdf}`);
      console.log(`Already have:  ${result.stats.alreadyHave}`);
      console.log(`Errors:        ${result.stats.errors}`);
    }
  }));

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
  .action(withErrorHandling(async (query, opts) => {
    const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

    const { allResults, warnings } = await searchCommand(query, opts, {
      targetAccounts,
      forEachAccount,
      listMailboxes,
    });

    warnings.forEach((w) => console.error(w));

    if (json) {
      // Strip internal messageId from JSON output
      const output = allResults.map(({ messageId, ...rest }) => rest);
      console.log(JSON.stringify(output));
    } else if (allResults.length > 0) {
      console.log(formatSearchResultsText(allResults));
    }
  }));

program
  .command("read")
  .description("Fetch and display a specific email by UID")
  .argument("<uid>", "message UID to read")
  .option("--mailbox <path>", "mailbox containing the message (auto-detects if omitted)")
  .option("--max-body <n>", "max body characters to display (default: 3000 for terminal)")
  .option("--raw", "output original HTML without stripping (for HTML emails)")
  .option("--headers", "include raw email headers in output")
  .action(withErrorHandling(async (uid, opts) => {
    const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);
    const maxBodyExplicit = opts.maxBody !== undefined;
    const maxBody = maxBodyExplicit ? parseInt(opts.maxBody, 10) : 3000;
    // In JSON mode, include full body unless --max-body was explicitly set
    const effectiveMaxBody = json && !maxBodyExplicit ? Infinity : maxBody;

    const { account: acct, parsed } = await readCommand(uid, opts, {
      targetAccounts,
      forEachAccount,
      listMailboxes,
      simpleParser,
    });

    console.error(`\n=== ${acct.name} ===`);

    if (json) {
      const result = buildReadResult(parsed, acct.name, uid, {
        maxBody: effectiveMaxBody,
        includeHeaders: !!opts.headers,
      });
      console.log(JSON.stringify(result));
    } else {
      console.log(formatReadResultText(parsed, {
        maxBody,
        showHeaders: !!opts.headers,
        showRaw: !!opts.raw,
      }));
    }
  }));

program
  .command("list-folders")
  .description("List all IMAP folders for each configured account")
  .action(withErrorHandling(async (opts) => {
    const { json, account, targetAccounts } = resolveCommandContext(opts, contextDeps);

    const allFolders = [];

    await forEachAccount(targetAccounts, async (client, acct) => {
      if (!json) {
        console.log(`\n=== ${acct.name} ===`);
      }

      const folders = await listMailboxes(client);

      for (const f of folders) {
        if (json) {
          allFolders.push({ account: acct.name, path: f.path, specialUse: f.specialUse || null });
        } else {
          const special = f.specialUse ? ` (${f.specialUse})` : "";
          console.log(`  ${f.path}${special}`);
        }
      }
    });

    if (json) {
      console.log(JSON.stringify(allFolders));
    }
  }));

program
  .command("extract-attachment")
  .description("List or save attachments from a specific email by UID")
  .argument("<uid>", "message UID")
  .argument("[index]", "attachment index to save (0-based)", "0")
  .option("--mailbox <name>", "mailbox containing the message (auto-detects if omitted)")
  .option("-o, --output <dir>", "output directory", ".")
  .option("--list", "list attachments without downloading")
  .action(withErrorHandling(async (uid, index, opts) => {
    const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);
    const attachmentIndex = parseInt(index, 10);

    const result = await extractAttachmentCommand(uid, attachmentIndex, opts, {
      targetAccounts,
      forEachAccount,
      listMailboxes,
      fsGateway: new FileSystemGateway(),
    });

    if (!result.found) {
      if (!opts.list) throw new Error(`Could not find UID ${uid} in any account.`);
      return;
    }

    if (result.list) {
      if (json) {
        console.log(JSON.stringify({ account: result.account, uid: result.uid, attachments: result.attachments }));
      } else {
        if (result.attachments.length === 0) {
          console.log("No attachments.");
          return;
        }
        for (const entry of result.attachments) {
          console.log(`[${entry.index}] ${entry.filename}  ${entry.contentType}  ${entry.size} bytes`);
        }
      }
      return;
    }

    if ("path" in result) {
      if (json) {
        console.log(JSON.stringify({ path: result.path, filename: result.filename, size: result.size, contentType: result.contentType }));
      } else {
        console.log(result.path);
      }
    }
  }));

program
  .command("move")
  .description("Move emails by UID to a specified IMAP folder")
  .argument("<uids...>", "message UIDs (space or comma-separated; prefix with account: if --account omitted)")
  .requiredOption("--to <folder>", "destination IMAP folder (e.g. Junk, [Gmail]/Spam, Archive)")
  .option("--mailbox <source>", "source mailbox to move from", "INBOX")
  .option("-n, --dry-run", "show what would be moved without executing", false)
  .action(withErrorHandling(async (uids, opts) => {
    const { json, account, accounts } = resolveCommandContext(opts, contextDeps);

    const { stats, results } = await moveCommand(uids, opts, {
      accounts,
      account: account || null,
      forEachAccount,
      listMailboxes,
    });

    if (json) {
      console.log(JSON.stringify({ ...stats, results }));
    } else {
      console.log(formatMoveResultText(stats));
    }
  }));

program
  .command("inbox")
  .description("Quick overview of recent inbox messages across accounts")
  .option("-l, --limit <n>", "max messages per account", "10")
  .option("--unread", "only show unread messages", false)
  .option("--since <date>", "only messages on or after this date (default: 7d)")
  .action(withErrorHandling(async (opts) => {
    const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

    const { resultsByAccount, allResults } = await inboxCommand(opts, {
      targetAccounts,
      forEachAccount,
    });

    if (json) {
      console.log(JSON.stringify(allResults));
    } else {
      console.log(formatInboxText(resultsByAccount));
    }
  }));

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
  .action(withErrorHandling(async (uids, opts) => {
    const { json, account, accounts } = resolveCommandContext(opts, contextDeps);

    const results = await flagCommand(uids, opts, {
      accounts,
      account: account || null,
      forEachAccount,
      listMailboxes,
    });

    for (const flagResult of results) {
      const uidRange = flagResult.uids.join(",");
      const parts = [
        ...flagResult.added.map((f) => `+${f}`),
        ...flagResult.removed.map((f) => `-${f}`),
      ];
      const label = flagResult.uids.length === 1 ? `UID ${uidRange}` : `UIDs ${uidRange}`;

      if (json) {
        const { dryRun, ...rest } = flagResult;
        console.log(JSON.stringify(dryRun ? { dryRun: true, ...rest } : rest));
      } else if (flagResult.dryRun) {
        console.log(`[DRY RUN] Would flag ${label}: ${parts.join(" ")}`);
      } else {
        console.log(`Flagged ${label}: ${parts.join(" ")}`);
      }
    }
  }));

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
  .action(withErrorHandling(async (uid, opts) => {
    const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

    const result = await replyCommand(uid, opts, {
      targetAccounts,
      forEachAccount,
      listMailboxes,
      simpleParser,
      fsGateway: new FileSystemGateway(),
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
      if (json) {
        console.log(JSON.stringify({ dryRun: true, message }));
      } else {
        console.log("--- Dry Run: Composed Reply ---");
        console.log(`From: ${message.from}`);
        console.log(`To: ${message.to}`);
        if (message.cc) console.log(`CC: ${message.cc}`);
        console.log(`Subject: ${message.subject}`);
        console.log(`In-Reply-To: ${message.inReplyTo}`);
        console.log(`References: ${message.references}`);
        console.log(`\n${message.text}`);
      }
      return;
    }

    if (json) {
      console.log(JSON.stringify({ sent: result.sent, messageId: result.messageId, accepted: result.accepted }));
    } else {
      console.log(`Reply sent to ${result.message.to} (Message-ID: ${result.messageId})`);
    }
  }));

program
  .command("thread")
  .description("Show the full conversation thread containing a message")
  .argument("<uid>", "message UID to find the thread for")
  .option("--mailbox <path>", "mailbox containing the message (auto-detects if omitted)")
  .option("-l, --limit <n>", "max messages to show", "50")
  .option("--full", "show full message bodies", false)
  .action(withErrorHandling(async (uid, opts) => {
    const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

    const results = await threadCommand(uid, opts, {
      targetAccounts,
      forEachAccount,
      listMailboxes,
    });

    for (const { account: acctName, threadSize, fallback, messages } of results) {
      console.error(`\n=== ${acctName} ===`);
      if (json) {
        console.log(JSON.stringify({ account: acctName, threadSize, fallback, messages }));
      } else {
        console.log(formatThreadText(messages, { full: opts.full, fallback }));
      }
    }
  }));

program
  .command("contacts")
  .description("Extract frequent email contacts from recent messages")
  .option("-l, --limit <n>", "max contacts to show", "25")
  .option("--since <date>", "only messages on or after this date (default: 6m)")
  .option("--sent", "only show people you've sent TO", false)
  .option("--received", "only show people you've received FROM", false)
  .option("--search <text>", "filter contacts by name or address")
  .action(withErrorHandling(async (opts) => {
    const { json, targetAccounts } = resolveCommandContext(opts, contextDeps);

    const { contacts, sinceLabel } = await contactsCommand(opts, {
      targetAccounts,
      forEachAccount,
    });

    if (json) {
      console.log(JSON.stringify(contacts));
    } else {
      console.log(formatContactsText(contacts, { sinceLabel }));
    }
  }));

// --- Skill distribution ---

program
  .command("init")
  .description("Install mailctl skill files for Claude Code")
  .option("-g, --global", "install to ~/.claude (global) instead of .claude/ in CWD")
  .option("--force", "overwrite even if installed skill is from a newer version")
  .action(withErrorHandling(async (opts) => {
    const json = resolveJson(opts);
    await initCommand(program.version(), { json, global: !!opts.global, force: !!opts.force });
  }));

program.parse();
