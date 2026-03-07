#!/usr/bin/env node
import { program } from "commander";
import { scanAllAccounts, aggregateBySender } from "./scanner.js";
import { sortReceipts } from "./sorter.js";
import { downloadReceipts } from "./downloader.js";
import { loadAccounts } from "./accounts.js";
import { listMailboxes, filterSearchMailboxes, forEachAccount } from "./imap-client.js";
import { findAttachmentParts } from "./attachment-parts.js";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { simpleParser } from "mailparser";
import { collectValues, filterAccountsByName } from "./cli-helpers.js";
import { searchMailbox } from "./search.js";
import { deduplicateByMessageId } from "./dedup.js";
import { parseUidArgs, groupUidsByAccount } from "./move-logic.js";
import { computeFlagChanges, applyFlagChanges } from "./flag-messages.js";
import { buildReadResult, formatReadResultText } from "./read-email.js";
import { fetchInbox, formatInboxText } from "./inbox.js";
import { buildAttachmentListing, validateAttachmentIndex } from "./extract-attachment-logic.js";
import { detectMailbox } from "./mailbox-detect.js";
import { parseDate } from "./parse-date.js";
import { buildReplyHeaders, buildReplyBody, buildEditorTemplate, parseEditorContent } from "./reply.js";
import { SmtpGateway } from "./gateways/smtp-gateway.js";
import { findThread, formatThreadText } from "./thread.js";
import { extractContacts, aggregateContacts, formatContactsText } from "./contacts.js";
import { getConfigSelfAddresses } from "./config.js";

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

program
  .name("mailctl")
  .description("Personal email operations tool — receipt sorting, search, folder management, and more")
  .version("0.5.1")
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
    const results = await scanAllAccounts({
      months: parseInt(opts.months, 10),
      allMailboxes: opts.allMailboxes,
      account: account || null,
    });

    // Ensure data dir exists
    const { mkdirSync } = await import("fs");
    mkdirSync(DATA_DIR, { recursive: true });

    // Always save raw results
    const rawPath = opts.output || join(DATA_DIR, "scan-results.json");
    writeFileSync(rawPath, JSON.stringify(results, null, 2));
    console.error(`Saved raw results to ${rawPath}`);

    // Output sender summary
    const senders = aggregateBySender(results);
    const summaryPath = join(DATA_DIR, "senders.json");
    writeFileSync(summaryPath, JSON.stringify(senders, null, 2));
    console.error(`Saved sender summary to ${summaryPath}`);

    if (json) {
      console.log(JSON.stringify({ total: results.length, senders }));
      return;
    }

    // Print human-readable summary to stdout
    console.log("\n=== Receipt Senders Found ===\n");
    console.log(`Total: ${results.length} receipt emails from ${senders.length} unique senders\n`);

    for (const s of senders) {
      const accts = s.accounts.join(", ");
      console.log(`${s.name || s.address} (${s.count} emails)`);
      console.log(`   Address:  ${s.address}`);
      console.log(`   Accounts: ${accts}`);
      console.log(`   Example:  ${s.sampleSubjects[0] || "N/A"}`);
      console.log();
    }
  }));

program
  .command("classify")
  .description("Interactively classify senders as business or personal (outputs JSON)")
  .option("-i, --input <file>", "sender summary JSON", join(DATA_DIR, "senders.json"))
  .option("-o, --output <file>", "classification output", join(DATA_DIR, "classifications.json"))
  .action(withErrorHandling(async (opts) => {
    const json = resolveJson(opts);
    if (!existsSync(opts.input)) {
      throw new Error("Run 'scan' first to generate sender data.");
    }

    const senders = JSON.parse(readFileSync(opts.input, "utf-8"));

    // Load existing classifications if any
    let classifications = {};
    if (existsSync(opts.output)) {
      classifications = JSON.parse(readFileSync(opts.output, "utf-8"));
    }

    // Output unclassified senders as a JSON list for external classification
    const unclassified = senders.filter((s) => !classifications[s.address]);

    if (unclassified.length === 0) {
      if (json) {
        console.log(JSON.stringify({ unclassified: [] }));
      } else {
        console.log("All senders are classified!");
      }
      return;
    }

    const unclassifiedList = unclassified.map((s) => ({
      address: s.address,
      name: s.name,
      count: s.count,
      accounts: s.accounts,
      example: s.sampleSubjects[0] || "",
      classification: null, // fill in: "business" or "personal"
    }));

    if (json) {
      console.log(JSON.stringify({ unclassified: unclassifiedList }));
    } else {
      console.log(JSON.stringify(unclassifiedList, null, 2));
      console.error(`\n${unclassified.length} senders need classification.`);
      console.error(`   Edit the output and set "classification" to "business" or "personal".`);
      console.error(`   Then import with: mailctl import-classifications <file>`);
    }
  }));

program
  .command("import-classifications")
  .description("Import a classification JSON file")
  .argument("<file>", "JSON file with classifications")
  .option("-o, --output <file>", "classification store", join(DATA_DIR, "classifications.json"))
  .action(withErrorHandling(async (file, opts) => {
    const json = resolveJson(opts);
    const entries = JSON.parse(readFileSync(file, "utf-8"));
    let store = {};
    if (existsSync(opts.output)) {
      store = JSON.parse(readFileSync(opts.output, "utf-8"));
    }

    let count = 0;
    for (const entry of entries) {
      if (entry.classification && entry.address) {
        store[entry.address] = entry.classification;
        count++;
      }
    }

    writeFileSync(opts.output, JSON.stringify(store, null, 2));

    if (json) {
      console.log(JSON.stringify({ imported: count, path: opts.output }));
    } else {
      console.log(`Imported ${count} classifications to ${opts.output}`);
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
  .action(withErrorHandling(async (opts) => {
    const json = resolveJson(opts);
    const account = resolveAccount(opts);
    const { downloadReceiptEmails } = await import("./download-receipts.js");
    const { stats, records } = await downloadReceiptEmails({
      outputDir: opts.output,
      months: parseInt(opts.months, 10),
      since: opts.since || null,
      account: account || null,
      dryRun: opts.dryRun,
    });

    if (json) {
      console.log(JSON.stringify({ stats, records }));
      return;
    }

    console.log("\n=== Download Receipts Complete ===");
    console.log(`Found:         ${stats.found}`);
    console.log(`Downloaded:    ${stats.downloaded}`);
    console.log(`No PDF:        ${stats.noPdf}`);
    console.log(`Already have:  ${stats.alreadyHave}`);
    console.log(`Errors:        ${stats.errors}`);
  }));

// --- General email operations ---

program
  .command("search")
  .description("Search for emails across configured accounts (all mailboxes by default)")
  .argument("[query]", "search term (optional when --from, --subject, or --body is specified)")
  .option("-f, --from <name>", "search by sender name or address")
  .option("-s, --subject <text>", "search by subject text")
  .option("-b, --body <text>", "search by body text")
  .option("--since <date>", "only messages on or after this date")
  .option("--before <date>", "only messages before this date")
  .option("-m, --months <n>", "shorthand: messages from the last N months")
  .option("--mailbox <path>", "mailbox(es) to search (repeatable or comma-separated; omit for all)", collectValues, [])
  .option("--exclude-mailbox <path>", "mailbox(es) to exclude (repeatable or comma-separated)", collectValues, [])
  .option("-l, --limit <n>", "max results per mailbox per account", "20")
  .action(withErrorHandling(async (query, opts) => {
    if (!query && !opts.from && !opts.subject && !opts.body) {
      throw new Error("Provide a search query or use --from, --subject, or --body to filter.");
    }
    const json = resolveJson(opts);
    const account = resolveAccount(opts);
    const accounts = requireAccounts();
    const targetAccounts = filterAccountsByName(accounts, account);

    if (account && targetAccounts.length === 0) {
      throw new Error(`Account "${account}" not found.`);
    }

    const limit = parseInt(opts.limit, 10);

    // Resolve date filters
    let since, before;
    if (opts.months && !opts.since) {
      since = new Date();
      since.setMonth(since.getMonth() - parseInt(opts.months, 10));
      since = new Date(since.getFullYear(), since.getMonth(), since.getDate());
    }
    if (opts.since) {
      since = parseDate(opts.since);
      if (opts.months) {
        console.error("Note: --since takes precedence over --months");
      }
    }
    if (opts.before) {
      before = parseDate(opts.before);
    }
    if (since && before && since >= before) {
      throw new Error("--since date must be before --before date");
    }

    // Show date context
    const dateParts = [];
    if (since)  dateParts.push(`since: ${since.toISOString().slice(0, 10)}`);
    if (before) dateParts.push(`before: ${before.toISOString().slice(0, 10)}`);
    const dateLabel = dateParts.length > 0 ? ` (${dateParts.join(", ")})` : "";

    const allResults = [];

    await forEachAccount(targetAccounts, async (client, acct) => {
      console.error(`\n=== ${acct.name} ===`);

      let mailboxPaths;
      if (opts.mailbox.length > 0) {
        mailboxPaths = opts.mailbox;
      } else {
        const allBoxes = await listMailboxes(client);
        mailboxPaths = filterSearchMailboxes(allBoxes, {
          excludePaths: opts.excludeMailbox,
        });
      }

      // Search mailboxes sequentially (IMAP requires one mailbox lock at a time)
      const accountResults = [];
      for (const mbPath of mailboxPaths) {
        console.error(`  Searching ${mbPath}${dateLabel}...`);
        const results = await searchMailbox(client, acct.name, mbPath, query, {
          from: opts.from,
          subject: opts.subject,
          body: opts.body,
          since,
          before,
          limit,
        });
        accountResults.push(...results);
      }

      // Deduplicate by message-id before adding to global results
      for (const r of deduplicateByMessageId(accountResults)) {
        allResults.push(r);
        if (!json) {
          console.log(`  [${r.mailbox}] UID:${r.uid} ${r.date} | ${r.fromName || ""} <${r.from}> | ${r.subject}`);
        }
      }
    });

    if (json) {
      // Strip internal messageId from JSON output
      const output = allResults.map(({ messageId, ...rest }) => rest);
      console.log(JSON.stringify(output));
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
    const json = resolveJson(opts);
    const account = resolveAccount(opts);
    const accounts = requireAccounts();
    const maxBodyExplicit = opts.maxBody !== undefined;
    const maxBody = maxBodyExplicit ? parseInt(opts.maxBody, 10) : 3000;
    // In JSON mode, include full body unless --max-body was explicitly set
    const effectiveMaxBody = json && !maxBodyExplicit ? Infinity : maxBody;

    const targetAccounts = filterAccountsByName(accounts, account);

    if (targetAccounts.length === 0) {
      throw new Error(`Account "${account}" not found.`);
    }

    await forEachAccount(targetAccounts, async (client, acct) => {
      console.error(`\n=== ${acct.name} ===`);

      let mailbox = opts.mailbox;
      if (!mailbox) {
        const allBoxes = await listMailboxes(client);
        const paths = filterSearchMailboxes(allBoxes);
        mailbox = await detectMailbox(client, uid, paths);
        if (!mailbox) {
          throw new Error(`UID ${uid} not found in any mailbox on ${acct.name}`);
        }
        console.error(`Found UID ${uid} in ${mailbox}`);
      }

      let lock;
      try {
        lock = await client.getMailboxLock(mailbox);
      } catch {
        console.error(`  Could not open ${mailbox}`);
        return;
      }

      try {
        const raw = await client.download(uid, undefined, { uid: true });
        const chunks = [];
        for await (const chunk of raw.content) chunks.push(chunk);
        const buf = Buffer.concat(chunks);
        const parsed = await simpleParser(buf);

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
      } catch (err) {
        console.error(`  Could not fetch UID ${uid}: ${err.message}`);
      } finally {
        lock.release();
      }
    });
  }));

program
  .command("list-folders")
  .description("List all IMAP folders for each configured account")
  .action(withErrorHandling(async (opts) => {
    const json = resolveJson(opts);
    const account = resolveAccount(opts);
    const accounts = requireAccounts();
    const targetAccounts = filterAccountsByName(accounts, account);

    if (account && targetAccounts.length === 0) {
      throw new Error(`Account "${account}" not found.`);
    }

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
    const json = resolveJson(opts);
    const account = resolveAccount(opts);
    const accounts = requireAccounts();
    const attachmentIndex = parseInt(index, 10);

    const targetAccounts = filterAccountsByName(accounts, account);

    if (targetAccounts.length === 0) {
      throw new Error(`Account "${account}" not found.`);
    }

    let found = false;

    await forEachAccount(targetAccounts, async (client, acct) => {
      if (found) return;

      let mailbox = opts.mailbox;
      if (!mailbox) {
        const allBoxes = await listMailboxes(client);
        const paths = filterSearchMailboxes(allBoxes);
        mailbox = await detectMailbox(client, uid, paths);
        if (!mailbox) return;
        console.error(`Found UID ${uid} in ${mailbox}`);
      }

      let lock;
      try {
        lock = await client.getMailboxLock(mailbox);
      } catch {
        return;
      }

      try {
        // Use BODYSTRUCTURE to enumerate attachments without downloading the full message
        let bodyStructure;
        try {
          for await (const fetched of client.fetch(String(uid), { bodyStructure: true }, { uid: true })) {
            bodyStructure = fetched.bodyStructure;
          }
        } catch {
          return;
        }

        if (!bodyStructure) return;

        const listing = buildAttachmentListing(findAttachmentParts(bodyStructure));

        if (opts.list) {
          found = true;
          if (json) {
            console.log(JSON.stringify({ account: acct.name, uid: parseInt(uid, 10), attachments: listing }));
          } else {
            if (listing.length === 0) {
              console.log("No attachments.");
              return;
            }
            for (const entry of listing) {
              console.log(`[${entry.index}] ${entry.filename}  ${entry.contentType}  ${entry.size} bytes`);
            }
          }
          return;
        }

        // Save mode — validateAttachmentIndex throws on invalid index
        found = true;
        const att = validateAttachmentIndex(listing, attachmentIndex, uid);
        const filename = att.filename !== "(unnamed)" ? att.filename : `attachment_${attachmentIndex}`;

        // Download just the specific MIME part, not the entire message
        const { content } = await client.download(String(uid), att.part, { uid: true });
        const chunks = [];
        for await (const chunk of content) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        const outputDir = resolve(opts.output);
        mkdirSync(outputDir, { recursive: true });
        const outPath = join(outputDir, filename);
        writeFileSync(outPath, buffer);

        if (json) {
          console.log(JSON.stringify({ path: outPath, filename, size: buffer.length, contentType: att.contentType }));
        } else {
          console.log(outPath);
        }
      } finally {
        lock.release();
      }
    });

    if (!found && !opts.list) {
      throw new Error(`Could not find UID ${uid} in any account.`);
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
    const json = resolveJson(opts);
    const account = resolveAccount(opts);
    const accounts = requireAccounts();
    const destination = opts.to;
    const sourceMailbox = opts.mailbox;
    const dryRun = opts.dryRun;

    const parsed = parseUidArgs(uids, account || null);

    if (parsed.length === 0) {
      throw new Error("No UIDs provided.");
    }

    const byAccount = groupUidsByAccount(parsed);

    const stats = { moved: 0, failed: 0, skipped: 0 };
    const results = [];

    for (const [acctKey, acctUids] of byAccount) {
      const targetAccounts = filterAccountsByName(accounts, acctKey);

      if (targetAccounts.length === 0) {
        const msg = `Account "${acctKey}" not found.`;
        if (!json) console.error(`Error: ${msg}`);
        for (const uid of acctUids) {
          stats.failed++;
          results.push({ account: acctKey, uid, status: "failed", error: msg });
        }
        continue;
      }

      await forEachAccount(targetAccounts, async (client, acct) => {
        if (!json) console.error(`\n=== ${acct.name} ===`);

        // Validate destination folder exists
        const folders = await listMailboxes(client);
        const folderExists = folders.some((f) => f.path === destination);
        if (!folderExists) {
          const available = folders.map((f) => f.path).join(", ");
          throw new Error(
            `Destination folder "${destination}" does not exist on ${acct.name}. Available: ${available}`
          );
        }

        // Lock source mailbox
        let lock;
        try {
          lock = await client.getMailboxLock(sourceMailbox);
        } catch (err) {
          const msg = `Could not open source mailbox "${sourceMailbox}" on ${acct.name}: ${err.message}`;
          if (!json) console.error(`  ${msg}`);
          for (const uid of acctUids) {
            stats.failed++;
            results.push({ account: acct.name, uid, status: "failed", error: msg });
          }
          return;
        }

        try {
          const uidRange = acctUids.join(",");

          if (dryRun) {
            if (!json) {
              console.log(
                `[DRY RUN] Would move ${acctUids.length} message(s) on ${acct.name}: ${sourceMailbox} → ${destination} (UIDs: ${uidRange})`
              );
            }
            stats.skipped += acctUids.length;
            for (const uid of acctUids) {
              results.push({ account: acct.name, uid, status: "skipped", reason: "dry-run" });
            }
          } else {
            try {
              await client.messageMove(uidRange, destination, { uid: true });
              if (!json) {
                console.error(
                  `  Moved ${acctUids.length} message(s): ${sourceMailbox} → ${destination} (UIDs: ${uidRange})`
                );
              }
              stats.moved += acctUids.length;
              for (const uid of acctUids) {
                results.push({ account: acct.name, uid, status: "moved" });
              }
            } catch (err) {
              if (!json) {
                console.error(`  Move failed (UIDs: ${uidRange}): ${err.message}`);
              }
              stats.failed += acctUids.length;
              for (const uid of acctUids) {
                results.push({ account: acct.name, uid, status: "failed", error: err.message });
              }
            }
          }
        } finally {
          lock.release();
        }
      });
    }

    if (json) {
      console.log(JSON.stringify({ ...stats, results }));
    } else {
      console.log(`\nSummary: ${stats.moved} moved, ${stats.failed} failed, ${stats.skipped} skipped (dry-run)`);
    }
  }));

program
  .command("inbox")
  .description("Quick overview of recent inbox messages across accounts")
  .option("-l, --limit <n>", "max messages per account", "10")
  .option("--unread", "only show unread messages", false)
  .option("--since <date>", "only messages on or after this date (default: 7d)")
  .action(withErrorHandling(async (opts) => {
    const json = resolveJson(opts);
    const account = resolveAccount(opts);
    const accounts = requireAccounts();
    const targetAccounts = filterAccountsByName(accounts, account);

    if (account && targetAccounts.length === 0) {
      throw new Error(`Account "${account}" not found.`);
    }

    const limit = parseInt(opts.limit, 10);
    const since = opts.since ? parseDate(opts.since) : parseDate("7d");

    /** @type {Map<string, Array>} */
    const resultsByAccount = new Map();
    const allResults = [];

    await forEachAccount(targetAccounts, async (client, acct) => {
      if (!json) console.error(`Checking ${acct.name}...`);

      const messages = await fetchInbox(client, acct.name, {
        limit,
        since,
        unreadOnly: opts.unread,
      });

      resultsByAccount.set(acct.name, messages);
      allResults.push(...messages);
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
    const json = resolveJson(opts);
    const account = resolveAccount(opts);
    const accounts = requireAccounts();

    const changes = computeFlagChanges({
      read: opts.read,
      unread: opts.unread,
      star: opts.star,
      unstar: opts.unstar,
    });

    const parsed = parseUidArgs(uids, account || null);

    if (parsed.length === 0) {
      throw new Error("No UIDs provided.");
    }

    const byAccount = groupUidsByAccount(parsed);

    for (const [acctKey, acctUids] of byAccount) {
      const targetAccounts = filterAccountsByName(accounts, acctKey);

      if (targetAccounts.length === 0) {
        throw new Error(`Account "${acctKey}" not found.`);
      }

      await forEachAccount(targetAccounts, async (client, acct) => {
        const uidRange = acctUids.join(",");

        let mailbox = opts.mailbox;
        if (!mailbox) {
          const allBoxes = await listMailboxes(client);
          const paths = filterSearchMailboxes(allBoxes);
          mailbox = await detectMailbox(client, acctUids[0], paths);
          if (!mailbox) {
            throw new Error(`UID ${acctUids[0]} not found in any mailbox on ${acct.name}`);
          }
          console.error(`Found UID ${acctUids[0]} in ${mailbox}`);
        }

        if (opts.dryRun) {
          const parts = [];
          for (const f of changes.add) parts.push(`+${f}`);
          for (const f of changes.remove) parts.push(`-${f}`);
          const label = acctUids.length === 1 ? `UID ${uidRange}` : `UIDs ${uidRange}`;
          if (json) {
            console.log(JSON.stringify({
              dryRun: true,
              uids: acctUids.map(Number),
              added: changes.add,
              removed: changes.remove,
              account: acct.name,
              mailbox,
            }));
          } else {
            console.log(`[DRY RUN] Would flag ${label}: ${parts.join(" ")}`);
          }
          return;
        }

        let lock;
        try {
          lock = await client.getMailboxLock(mailbox);
        } catch (err) {
          throw new Error(`Could not open mailbox "${mailbox}" on ${acct.name}: ${err.message}`);
        }

        try {
          const result = await applyFlagChanges(client, uidRange, changes);
          const parts = [];
          for (const f of result.added) parts.push(`+${f}`);
          for (const f of result.removed) parts.push(`-${f}`);
          const label = acctUids.length === 1 ? `UID ${uidRange}` : `UIDs ${uidRange}`;

          if (json) {
            console.log(JSON.stringify({
              uids: acctUids.map(Number),
              added: result.added,
              removed: result.removed,
              account: acct.name,
              mailbox,
            }));
          } else {
            console.log(`Flagged ${label}: ${parts.join(" ")}`);
          }
        } finally {
          lock.release();
        }
      });
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
    const json = resolveJson(opts);
    const account = resolveAccount(opts);
    const accounts = requireAccounts();
    const targetAccounts = filterAccountsByName(accounts, account);

    if (account && targetAccounts.length === 0) {
      throw new Error(`Account "${account}" not found.`);
    }

    if (!opts.message && !opts.messageFile && !opts.edit) {
      throw new Error("Provide --message, --message-file, or --edit to compose a reply.");
    }

    // Find the account that has this UID and fetch the original message
    /** @type {any} */
    let originalParsed = null;
    /** @type {any} */
    let matchedAccount = null;

    await forEachAccount(targetAccounts, async (client, acct) => {
      if (originalParsed) return;

      let mailbox = opts.mailbox;
      if (!mailbox) {
        const allBoxes = await listMailboxes(client);
        const paths = filterSearchMailboxes(allBoxes);
        mailbox = await detectMailbox(client, uid, paths);
        if (!mailbox) return;
        console.error(`Found UID ${uid} in ${mailbox}`);
      }

      let lock;
      try {
        lock = await client.getMailboxLock(mailbox);
      } catch {
        return;
      }

      try {
        const raw = await client.download(uid, undefined, { uid: true });
        const chunks = [];
        for await (const chunk of raw.content) chunks.push(chunk);
        const buf = Buffer.concat(chunks);
        originalParsed = await simpleParser(buf);
        matchedAccount = acct;
      } catch {
        // UID not found in this account
      } finally {
        lock.release();
      }
    });

    if (!originalParsed || !matchedAccount) {
      throw new Error(`Could not find UID ${uid} in any account.`);
    }

    if (!matchedAccount.smtp) {
      throw new Error(`No SMTP configuration for account "${matchedAccount.name}". Add an smtp section to config.json.`);
    }

    // Build reply headers
    const headers = buildReplyHeaders(originalParsed, matchedAccount.user);

    // Get the reply message text
    let userMessage;
    if (opts.message) {
      userMessage = opts.message;
    } else if (opts.messageFile) {
      userMessage = readFileSync(resolve(opts.messageFile), "utf-8").trim();
    } else if (opts.edit) {
      // Build template and open editor
      const quotedBody = buildReplyBody("", originalParsed);
      const template = buildEditorTemplate(headers, quotedBody);
      const { tmpdir } = await import("os");
      const tmpFile = join(tmpdir(), `mailctl-reply-${Date.now()}.txt`);
      writeFileSync(tmpFile, template);

      const editor = process.env.VISUAL || process.env.EDITOR || "vi";
      const { execSync } = await import("child_process");
      execSync(`${editor} "${tmpFile}"`, { stdio: "inherit" });

      const edited = readFileSync(tmpFile, "utf-8");
      const { unlinkSync } = await import("fs");
      unlinkSync(tmpFile);

      userMessage = parseEditorContent(edited);
      if (!userMessage) {
        throw new Error("Empty reply — aborting.");
      }

      // Confirm before sending (unless --yes)
      if (!opts.yes && !opts.dryRun) {
        const readline = await import("readline");
        const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
        const answer = await new Promise((resolve) => rl.question("Send this reply? [y/N] ", resolve));
        rl.close();
        if (answer.toLowerCase() !== "y") {
          console.error("Aborted.");
          return;
        }
      }
    }

    // Build the full reply body with quoted original
    const replyBody = buildReplyBody(userMessage, originalParsed);

    const message = {
      from: matchedAccount.user,
      to: headers.to,
      cc: opts.cc || undefined,
      subject: headers.subject,
      text: replyBody,
      inReplyTo: headers.inReplyTo,
      references: headers.references,
    };

    if (opts.dryRun) {
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

    // Send via SMTP
    const gateway = new SmtpGateway();
    const result = await gateway.send(matchedAccount, message);

    if (json) {
      console.log(JSON.stringify({ sent: true, messageId: result.messageId, accepted: result.accepted }));
    } else {
      console.log(`Reply sent to ${message.to} (Message-ID: ${result.messageId})`);
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
    const json = resolveJson(opts);
    const account = resolveAccount(opts);
    const accounts = requireAccounts();
    const targetAccounts = filterAccountsByName(accounts, account);
    const limit = parseInt(opts.limit, 10);

    if (account && targetAccounts.length === 0) {
      throw new Error(`Account "${account}" not found.`);
    }

    await forEachAccount(targetAccounts, async (client, acct) => {
      console.error(`\n=== ${acct.name} ===`);

      let mailbox = opts.mailbox;
      if (!mailbox) {
        const allBoxes = await listMailboxes(client);
        const paths = filterSearchMailboxes(allBoxes);
        mailbox = await detectMailbox(client, uid, paths);
        if (!mailbox) {
          throw new Error(`UID ${uid} not found in any mailbox on ${acct.name}`);
        }
        console.error(`Found UID ${uid} in ${mailbox}`);
      }

      // Get searchable mailboxes for cross-mailbox thread discovery
      const allBoxes = await listMailboxes(client);
      const searchPaths = filterSearchMailboxes(allBoxes);

      const { messages, fallback } = await findThread(client, acct.name, mailbox, uid, searchPaths, {
        limit,
        full: opts.full,
      });

      if (json) {
        console.log(JSON.stringify({ account: acct.name, threadSize: messages.length, fallback, messages }));
      } else {
        console.log(formatThreadText(messages, { full: opts.full, fallback }));
      }
    });
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
    const json = resolveJson(opts);
    const account = resolveAccount(opts);
    const accounts = requireAccounts();
    const targetAccounts = filterAccountsByName(accounts, account);

    if (account && targetAccounts.length === 0) {
      throw new Error(`Account "${account}" not found.`);
    }

    const limit = parseInt(opts.limit, 10);
    const since = opts.since ? parseDate(opts.since) : parseDate("6m");

    const sinceLabel = opts.since
      ? `since ${since.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}`
      : "last 6 months";

    const allEntries = [];

    await forEachAccount(targetAccounts, async (client, acct) => {
      if (!json) console.error(`Scanning ${acct.name}...`);

      const entries = await extractContacts(client, acct.name, {
        since,
        limit,
        sentOnly: opts.sent,
        receivedOnly: opts.received,
      });

      allEntries.push(...entries);
    });

    // Collect self addresses: config selfAddresses + each account's user address
    const selfAddresses = [...getConfigSelfAddresses()];
    for (const acct of targetAccounts) {
      if (acct.user) selfAddresses.push(acct.user);
    }

    const contacts = aggregateContacts(allEntries, {
      search: opts.search,
      limit,
      selfAddresses,
    });

    if (json) {
      console.log(JSON.stringify(contacts));
    } else {
      console.log(formatContactsText(contacts, { sinceLabel }));
    }
  }));

program.parse();
