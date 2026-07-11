import { join } from "node:path";
import { Command } from "commander";
import { emitPlanHint, resolvePlanApply } from "../cli-helpers.js";
import { classifyCommand } from "../commands/classify-command.js";
import { downloadCommand } from "../commands/download-command.js";
import { importClassificationsCommand } from "../commands/import-classifications-command.js";
import { scanCommand } from "../commands/scan-command.js";
import { sortCommand } from "../commands/sort-command.js";
import { DATA_DIR } from "../data-dir.js";
import { renderDownloadEvent } from "../download-event-factories.js";
import { formatDownloadOutput } from "../format-download.js";
import { formatImportClassificationsOutput } from "../format-import-classifications.js";
import { formatClassifyOutput, formatScanOutput } from "../format-scan.js";
import { formatSortOutput } from "../format-sort.js";
import { FileSystemGateway } from "../gateways/fs-gateway.js";
import { downloadReceiptsCommand } from "../receipts/download-receipts-command.js";
import { renderDownloadReceiptsEvent } from "../receipts/download-receipts-event-factories.js";
import { formatDownloadReceiptsOutput } from "../receipts/format-download-receipts.js";
import { renderScanEvent } from "../scan-event-factories.js";
import { renderSortEvent } from "../sort-event-factories.js";

// Default lookback periods (strings match Commander's option contract)
const SCAN_DEFAULT_MONTHS = "12";
const SORT_DEFAULT_MONTHS = "24";
const DOWNLOAD_DEFAULT_MONTHS = "24";
const DOWNLOAD_RECEIPTS_DEFAULT_MONTHS = "12";

/**
 * @typedef {object} ReceiptsCliDeps
 * @property {Function} scanCommand
 * @property {Function} classifyCommand
 * @property {Function} importClassificationsCommand
 * @property {Function} sortCommand
 * @property {Function} downloadCommand
 * @property {Function} downloadReceiptsCommand
 * @property {Function} formatScanOutput
 * @property {Function} formatClassifyOutput
 * @property {Function} formatImportClassificationsOutput
 * @property {Function} formatSortOutput
 * @property {Function} formatDownloadOutput
 * @property {Function} formatDownloadReceiptsOutput
 * @property {(event: any) => string|null} renderScanEvent
 * @property {(event: any) => string|null} renderSortEvent
 * @property {(event: any) => string|null} renderDownloadEvent
 * @property {(event: any) => string|null} renderDownloadReceiptsEvent
 * @property {string} DATA_DIR
 * @property {{ mkdir: (path: string) => void }} _fs
 * @property {() => string|null} getOpenAiKey
 * @property {() => Promise<any>} importDownloadReceipts
 * @property {() => Promise<any>} importVendorMap
 */

/**
 * Production default deps for the receipts noun-group.
 * `getOpenAiKey` is a placeholder stub replaced by the composition root with the
 * real keychain-backed getter via `makeGetOpenAiKey`.
 *
 * @type {ReceiptsCliDeps}
 */
export const receiptsDeps = {
  scanCommand,
  classifyCommand,
  importClassificationsCommand,
  sortCommand,
  downloadCommand,
  downloadReceiptsCommand,
  formatScanOutput,
  formatClassifyOutput,
  formatImportClassificationsOutput,
  formatSortOutput,
  formatDownloadOutput,
  formatDownloadReceiptsOutput,
  renderScanEvent,
  renderSortEvent,
  renderDownloadEvent,
  renderDownloadReceiptsEvent,
  DATA_DIR,
  _fs: new FileSystemGateway(),
  getOpenAiKey: () => null,
  importDownloadReceipts: () => import("../receipts/download-receipts.js"),
  importVendorMap: () => import("../vendor-map.js"),
};

/**
 * Register the `receipts` noun-group plus hidden legacy top-level aliases.
 *
 * Adding a new receipts sub-command means editing this file only.
 *
 * @param {import("commander").Command} program
 * @param {import("../cli-context.js").CliContext} ctx
 * @param {ReceiptsCliDeps} [deps]
 */
export function registerReceiptsCommands(program, ctx, deps = receiptsDeps) {
  const { resolveJson, resolveAccount, wrapAction, mutating, progress } = ctx;
  const renderScanProgress = progress(deps.renderScanEvent);
  const renderSortProgress = progress(deps.renderSortEvent);
  const renderDownloadProgress = progress(deps.renderDownloadEvent);
  const renderDownloadReceiptsProgress = progress(deps.renderDownloadReceiptsEvent);

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

          // Ensure the state dir exists before writing the default output path.
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
        // --list-vendors is a read-only query; skip plan/apply gating.
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
}
