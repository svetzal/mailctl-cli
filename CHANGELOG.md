# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- **BREAKING: commands now exit non-zero when any operational failure occurred, even if the overall command otherwise "completed."** Previously, a total IMAP account outage during `search`/`inbox`/`contacts`/`folders` printed an empty result and exited 0 — indistinguishable from "no matches." Per-account connect failures now surface as `accountFailures` in the result (and, in `--json` mode, in the payload), a `⚠` warning prints in text mode, and the process exits 1. `move`/`flag` now fold connect failures into `stats.failed` the same way they already fold per-UID failures. `receipts extract`'s `download`, `reprocess`, and `--list-vendors` modes previously only checked `stats.errors`/`stats.timedOut` for the `download` mode and silently ignored search failures and dedup-index load failures elsewhere; all three modes now escalate consistently via a shared `src/exit-status.js` contract. Scripts that previously treated exit 0 as "ran clean" should now check the exit code instead of (or in addition to) parsing stdout/stderr for warnings.
- **Consolidated per-command month-lookback defaults into `src/receipt-defaults.js`.** Each of `scan` (12), `sort` (24), `download` (24), and `extract` (12) previously had its default declared three times — once in the CLI option, once in the command orchestrator, once in the library function — with no single place to change it. All three layers now import from the shared constants.
- **PDF content hashing now goes through the single `contentHash()` helper** (`src/receipts/receipt-decisions.js`) everywhere; `src/receipts/receipt-output-tree.js` previously computed the same SHA-256 digest inline in two places that had to stay in sync for PDF dedup to work correctly.
- **The `receipts extract` run summary is now rendered in exactly one place** (`formatDownloadReceiptsText()`), instead of also being narrated mid-run by a `download-summary` progress event that had drifted from the final formatter (missing `skipped`, `skippedEmpty`, and `timedOut`). A non-JSON `extract` run now prints one summary block, not two.
- **Extracted a shared receipt-search core** (`src/receipts/receipt-mailbox-search.js`) used by both `scanForReceipts` and `searchMailboxForReceipts`, which previously reimplemented the same lock/search-terms/UID-dedup/fetch-envelopes/tally-failures algorithm independently and had drifted on programmer-error escalation. `scanForReceipts` now escalates programmer errors (bare `TypeError`/`ReferenceError`/`RangeError`/`SyntaxError`) instead of swallowing them as ordinary search/fetch failures, matching `searchMailboxForReceipts`'s existing behavior. No change to command output or the public `{ results, failures }` shape.
- **Deduplicated several small pieces of drifted knowledge:** the `Account "X" not found.` and `No accounts configured…` error messages now each have a single home in `src/cli-helpers.js` (`accountNotFoundMessage()`, `NO_ACCOUNTS_CONFIGURED_MESSAGE`) instead of four and two independently-typed copies; the `--json` account-failure envelope rule (`{ [key]: payload, accountFailures }` vs. object-merge) used by `search`/`folders`/`inbox`/`contacts` is now one function (`attachAccountFailures()` in `src/format-mail.js`); filename truncation across vendor-name and receipt-basename derivation now shares one token-boundary rule (`truncateAtTokenBoundary()` in `src/truncate-name.js`, previously four independently-drifted regexes with three different boundary characters) and one forbidden-character set (`FILENAME_FORBIDDEN_PATTERN` in `src/receipts/receipt-vendor-name.js`, previously two sets that disagreed on commas).
- **Removed a dead 42-event (and 9-event) typedef/union layer** (`DownloadReceiptsEvent`, `DownloadEvent`, and the per-event `@typedef` blocks backing them) that existed solely to feed `AppEvent` in `src/event-types.js`, which had zero consumers. `src/download-event-factories.js` and `src/receipts/download-receipts-event-factories.js` now export a single `downloadEvents` / `receiptEvents` factory map each instead of a long individually-named destructured export list, so adding a new event is one `TABLE` entry with no companion typedef, union, or export-list edit. No behavior change — same event objects, same renderers.

### Fixed

- **`scan`, `sort`, and `download` no longer exclude messages received earlier today.** They previously computed their lookback date inline with unnormalized `new Date()` arithmetic; a message that arrived at, say, 8am today could fall just outside the `--months` window computed later the same day. All three now route through `monthsAgo()` (`src/parse-date.js`), which normalizes to local midnight, matching `receipts extract`'s existing behavior.
- **`listReceiptVendors()` (the `--list-vendors` library entry point) now defaults to a 12-month lookback, not 3.** Its only caller (`receipts extract --list-vendors`) has always passed 12 explicitly, so the 3-month library default was dead unless the function was called directly — but it was wrong, and is now corrected to match.

## [1.3.0] - 2026-07-07

### Changed

- **`init` now installs the companion skill across every cmx-managed agent platform, not just Claude.** Skill installation is delegated to [`cmx-core`](https://www.npmjs.com/package/cmx-core), which resolves target platforms from `~/.config/context-mixer/config.json` (`platforms: [...]`) — falling back to any platform with an existing cmx lockfile, then to `claude`. On a typical setup with `claude`, `codex`, and `hermes` managed, a single `mailctl init` now lands the skill in all three (`~/.claude/skills`, `~/.agents/skills`, `~/.hermes/skills`). Output is per-platform, showing what happened on each (installed / updated / up to date / skipped).
- **Version stamping and the newer-install guard are now owned by cmx-core's lockfiles** rather than mailctl's own frontmatter field. cmx-core reconciles `metadata.version` in the installed `SKILL.md` from the binary version and tracks per-platform state (version + checksum) in `cmx-lock*.json`, giving idempotent re-runs and drift detection. The old `mailctl-version:` frontmatter marker is gone.
- **`init` registers mailctl as a managed cmx source** (`bundled:mailctl`), so `cmx` sees the bundled skill and can update it alongside other managed artifacts.
- `--local` now installs into the current project's platform directories (via cmx scope) rather than a single `.claude/` dir.

## [1.2.0] - 2026-07-06

### Changed

- **Receipt commands are now grouped under a `receipts` noun:** `receipts scan`, `receipts classify`, `receipts import-classifications`, `receipts sort`, `receipts download`, and `receipts extract` (the last was `download-receipts`). This resolves the two overlapping top-level "download" verbs. The pre-1.2 top-level names all still work as hidden aliases, so existing scripts and muscle memory keep working.
- **BREAKING (safe-by-default): mutating commands now preview by default and require `--apply` to execute.** `sort`, `download`, `download-receipts`, `move`, `flag`, and `reply` no longer act on their first run — they show what *would* happen and print a hint to re-run with `--apply`. The workflow is now: run the command, read the plan, re-run the same command with `--apply`. The legacy `-n, --dry-run` flag is still accepted (hidden) and, since preview is the default, is now redundant; it forces preview even alongside `--apply`. Help text marks these commands `[Mutates with --apply]`.
- **`list-folders` renamed to `folders`** for grammar consistency with `contacts`/`inbox`. The old name still works as an alias.
- **`init` now installs the companion skill globally by default** (`~/.claude`). Use the new `--local` flag to install into `.claude/` in the current directory instead. The previous `-g, --global` flag is removed (global is the default).
- `read` now prints the resolved mailbox in its `=== account / mailbox ===` header and, when the mailbox was auto-detected, a note on how to pin it with `--account`/`--mailbox`. UIDs are per-mailbox, so a bare `read <uid>` can otherwise land on a different message than intended without any signal.

### Fixed

- Receipt-pipeline data now lives in a user-writable state directory (`$XDG_STATE_HOME/mailctl` or `~/.local/state/mailctl`). Previously the `classify`/`import-classifications` defaults and the `scan` output pointed next to the binary, which in a compiled build resolves into the read-only `$bunfs` virtual filesystem — so the defaults were unusable.
- `move`'s summary line no longer prints a hardcoded `(dry-run)` suffix on real moves.

## [1.1.2] - 2026-06-07

### Fixed

- `search` now includes the screening quarantine folder (`_lma-shield/screened`, created by the Leave Me Alone unsubscribe service) instead of silently skipping it. The underscore-prefix exclusion (meant for tool-internal folders like Apple Mail's) was hiding legitimately screened mail — e.g. a vendor invoice that Leave Me Alone parked in the screening folder was invisible to `search` from every mailbox. Other `_`-prefixed folders remain excluded; only `*/screened` is now searchable.

## [1.1.1] - 2026-06-07

### Fixed

- `formatDatetime` now builds its output string deterministically from `formatShortDate` plus zero-padded hours/minutes instead of relying on `toLocaleString('en-US')`, whose date/time separator varies across ICU versions (local: `at`, CI: `,`).

## [1.1.0] - 2026-06-07

### Fixed

- `extract-attachment` now saves the PDF (or first non-signature attachment) instead of `smime.p7s` on S/MIME-signed emails (e.g. Anthropic, Paddle receipts). The BODYSTRUCTURE walker now skips `application/pkcs7-signature` parts; the no-index default selects the document attachment rather than the first part.
- `download-receipts` no longer hangs indefinitely on a stuck IMAP fetch or LLM call. Each message is now wrapped in a per-message timeout (default 120 s); timed-out messages are skipped with a warning and the run continues. Incremental progress (`[i/total] vendor — subject`) is emitted to stderr immediately as each message begins, so liveness is visible and `--dry-run` runs no longer appear frozen.

### Added

- `download-receipts --max <n>` — stop after processing at most N messages.
- `download-receipts --timeout <seconds>` — per-message timeout (default 120 s).
- `download-receipts --budget <seconds>` — overall wall-clock cap for the run.
- `download-receipts` summary now includes a `Timed out:` count line.

## [1.0.4] - 2026-05-25

### Added

- `download-receipts` now skips writing JSON sidecars when LLM extraction produces no useful data (no amount, no invoice number, no PDF). Use `--include-empty` to restore the previous behavior and write sidecars for all processed emails.

## [1.0.3] - 2026-04-13

### Security

- Updated dependencies to address known CVE vulnerabilities (automated nightly maintenance patch)

## [0.7.2] - 2026-03-17

### Fixed

- Version string in cli.js now stays in sync with package.json
- Added local installation instructions to AGENTS.md

## [0.7.1] - 2026-03-17

### Added

- Skill distribution infrastructure (`mailctl init` command)

### Updated

- imapflow to 1.2.15
- @types/node to 25.5.0

## [0.7.0] and earlier

See git history for previous changes.
