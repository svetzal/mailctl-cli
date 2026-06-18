---
name: mailctl
description: |
  Personal email operations tool — receipt sorting, search, folder management, and more.
  Connects to email accounts via macOS Keychain credentials, provides general IMAP
  operations (search, read, folder listing), identifies receipt emails, classifies by
  business/personal, sorts into IMAP folders, and downloads business receipt PDFs
  for bookkeeping.

  Bun ES module project using imapflow for IMAP operations and commander for CLI.
  Secrets are managed via macOS Keychain — never stored in .env files or source.
---

# mailctl Agent Instructions

Why this project exists and what problem does it solve: @CHARTER.md

## Quick Reference

### Running Commands

Use the `mailctl` binary directly. All commands support `--json` for machine-readable output.

For **development** (running from the source repo), use `bun src/cli.js <command>` or the `bin/run` wrapper.

```bash
# General email operations
mailctl search "query"          # search all mailboxes across accounts
mailctl search --mailbox INBOX "query"   # search specific mailbox only
mailctl search --exclude-mailbox Trash "query"  # skip specific folders
mailctl read <uid>              # read a specific email by UID
mailctl list-folders            # list all IMAP folders per account
mailctl list-folders --json     # JSON output for scripting
mailctl extract-attachment <uid> --list           # list attachments
mailctl extract-attachment <uid> [index]          # save attachment (PDF preferred; smime.p7s skipped)
mailctl extract-attachment <uid> -o ~/Desktop     # save to directory

# Receipt operations
mailctl scan                    # discover receipt senders
mailctl scan --json             # JSON output
mailctl sort                    # move emails to Business/Personal folders
mailctl sort --dry-run          # preview without moving
mailctl download                # download business receipt PDFs
mailctl download --dry-run
mailctl classify                # output unclassified senders
mailctl download-receipts --since 2026-01-01 -o <dir>       # download with date filter
mailctl download-receipts --since 2026-01-01 --dry-run       # preview, no writes
mailctl download-receipts --since 2026-01-01 --max 10        # cap at 10 messages
mailctl download-receipts --since 2026-01-01 --timeout 60    # 60 s per-message timeout
mailctl download-receipts --since 2026-01-01 --budget 300    # 5-minute overall cap
```

### Project Structure

```text
src/cli.js                     — CLI entry point: true thin dispatcher; `buildProgram(deps)` factory is dependency-injected and unit-tested in `test/cli.test.js`; each .action() is 5–15 lines with no inline event rendering logic

Command orchestrators (testable, injected deps):
Files in src/commands/ import sibling files as ./X.js and parent src/ files as ../X.js.
src/commands/search-command.js          — Search orchestration (cross-account, date filters, dedup)
src/commands/read-command.js            — Read orchestration (fetch, parse, account detection)
src/commands/reply-command.js           — Reply orchestration (fetch original, compose, send via SMTP)
src/commands/move-command.js            — Move orchestration (multi-account, folder validation, dry-run)
src/commands/flag-command.js            — Flag orchestration (detect mailbox, apply IMAP flags)
src/commands/extract-attachment-command.js — Attachment extraction orchestration (BODYSTRUCTURE, download)
src/commands/thread-command.js          — Thread orchestration (detect mailbox, cross-mailbox discovery)
src/commands/inbox-command.js           — Inbox overview orchestration
src/commands/contacts-command.js        — Contact extraction and aggregation orchestration
src/commands/scan-command.js            — Receipt scan orchestration (scanAllAccounts + save results)
src/commands/sort-command.js            — Sort orchestration (classify, plan moves, dry-run)
src/commands/download-command.js        — Download orchestration (scan, PDF extraction, dedup)
src/commands/list-folders-command.js    — List-folders orchestration (per-account folder listing)
src/commands/classify-command.js        — Classify orchestration (load senders, filter unclassified)
src/commands/import-classifications-command.js — Import classifications orchestration (merge + write)
src/find-message.js            — Shared withMessage() helper: cross-account UID lookup lifecycle

Receipt feature cluster:
Files in src/receipts/ import sibling files as ./X.js and parent src/ files as ../X.js.
src/receipts/download-receipts-command.js — Download-receipts orchestration (list/reprocess/download routing)
src/receipts/download-receipts.js       — Receipt download orchestration: downloadReceiptEmails(), listReceiptVendors(), reprocessReceipts() — search → filter → extract metadata → write PDF+sidecar
src/receipts/download-receipts-event-factories.js — descriptor table for download-receipts events (44 factories covering all phases) and `renderDownloadReceiptsEvent`
src/receipts/receipt-decisions.js       — Pure classification/transformation decisions, receipt filtering, PDF hash/validation helpers
src/receipts/receipt-search-pipeline.js — searchMailboxForReceipts(), searchAccountForReceipts() — single-mailbox IMAP search and per-account orchestration with dedup; shared by download and list-vendors
src/receipts/receipt-output-tree.js     — walkOutputTree(), loadExistingInvoiceNumbers(), loadExistingHashes(), uniqueBaseName(), collectSidecarFiles(), writeReceiptOutput() — output directory tree and file I/O for receipt PDFs and sidecars
src/receipts/receipt-extraction.js      — Pattern-based metadata extraction (regex fallback)
src/receipts/receipt-terms.js           — Single source of truth for receipt subject terms, exclusion patterns, and billing sender patterns
src/receipts/process-download-message.js — Per-message PDF download and manifest update (used by downloader)
src/receipts/process-receipt-message.js  — Per-message receipt extraction and sidecar writing (used by download-receipts)
src/receipts/pdf-converter.js           — pdfToText(), resolveExtractionText() — docling subprocess wrapper and extraction text resolution
src/receipts/llm-receipt-extraction.js  — RECEIPT_EXTRACTION_SCHEMA, createLlmBroker(), extractMetadataWithLLM(), extractReceiptMetadata() — LLM-based receipt metadata extraction via mojentic
src/receipts/format-download-receipts.js — formatDownloadReceiptsText(), buildDownloadReceiptsJson() — pure download-receipts result formatter

Pure logic modules:
src/config.js                  — Loads ~/.config/mailctl/config.json (account metadata)
src/accounts.js                — Builds IMAP account list from config.json + env var secrets
src/imap-client.js             — IMAP connection, search, fetch, mailbox filtering, account iteration
src/imap-orchestration.js      — Shared pure helpers: groupByMailbox(), forEachMailboxGroup()
src/search.js                  — searchMailbox() — single-mailbox search with field/date filters
src/dedup.js                   — deduplicateByMessageId() — shared by search and download-receipts
src/move-logic.js              — parseUidArgs(), groupUidsByAccount() — pure UID parsing for move command
src/extract-attachment-logic.js — buildAttachmentListing(), validateAttachmentIndex() — attachment helpers
src/date-filters.js            — resolveDateFilters() — pure --months/--since/--before precedence logic
src/batch-results.js           — createBatchAccumulator(), expandPerUid() — shared stats/results accumulator for batch command orchestrators (move, flag)
src/define-event.js            — defineEvent() — shared event factory builder, eliminates type-string duplication
src/format-utils.js            — formatKB() — shared formatting utilities
src/with-timeout.js            — withTimeout(promiseFactory, ms, label) — races a promise against a timer; rejects with err.code="ETIMEDOUT" if ms elapses first; used by download-receipts for per-message timeouts
src/format-scan.js             — formatScanText(), formatUnclassifiedText(), buildScanJson(), buildClassifyJson() — pure scan/classify formatters
src/format-search.js           — formatSearchText(), buildSearchJson() — pure search result formatter
src/format-move.js             — formatMoveText(), buildMoveJson() — pure move summary formatter
src/format-sort.js             — formatSortText(), buildSortJson() — pure sort summary formatter
src/format-download.js         — formatDownloadText(), buildDownloadJson() — pure download summary formatter
src/format-flag.js             — formatFlagText(), buildFlagJson() — pure flag result formatter
src/format-reply.js            — formatReplyDryRunText(), formatReplySentText(), buildReplyDryRunJson(), buildReplySentJson() — pure reply result formatters
src/format-attachment.js       — formatAttachmentListText(), formatAttachmentSavedText(), buildAttachmentListJson(), buildAttachmentSavedJson() — pure attachment result formatters
src/format-folders.js          — formatFoldersText(), buildFoldersJson() — pure folder listing formatter
src/format-read.js             — buildReadResult(), formatReadText(), buildReadJson() — pure read command formatters
src/format-thread.js           — formatThreadText(), buildThreadJson() — pure thread result formatter
src/format-inbox.js            — formatInboxText(), buildInboxJson() — pure inbox result formatter
src/format-contacts.js         — formatContactsText(), buildContactsJson() — pure contacts result formatter
src/format-import-classifications.js — buildImportClassificationsJson() — pure import-classifications JSON builder
src/format-init.js             — formatInitText(), buildInitJson() — pure init result formatters
src/event-renderer.js          — createEventRenderer() — cycle-free renderer core; accepts optional `fallbackRenderer` injection; owns ANSI color logic
src/event-table.js             — defineEventTable() — builds event factories + co-located renderer from a single descriptor table; adding a new event = one entry, no separate renderer edit
src/command-event-table.js     — defineCommandEventTable() — thin wrapper over defineEventTable that injects renderSharedEvent as fallback; use for all command-level event tables
src/auth-event-factories.js    — descriptor table for M365 auth events; exports factories (`deviceCodePrompt`, `authWaiting`, `authSuccess`, `tokenRefreshFailed`) and `renderAuthEvent`
src/shared-event-factories.js  — descriptor table for shared IMAP events (uses defineEventTable pattern); exports factories (`mailboxStart`, `mailboxEmpty`, `mailboxMatches`, `mailboxLockFailed`, `searchFailed`) and `renderSharedEvent`
src/scan-event-factories.js    — descriptor table for scan events; exports factories (`scanAccountStart`, `scanAccountComplete`) and `renderScanEvent`
src/sort-event-factories.js    — descriptor table for sort events; exports factories (`accountStart`, `folderExists`, `folderCreated`, `scanComplete`, `moveDryRun`, `moved`) and `renderSortEvent`
src/download-event-factories.js — descriptor table for download events; exports factories (`downloadAccountStart`, `downloadBizCount`, etc.) and `renderDownloadEvent`
src/scan-data.js               — saveScanResults(), loadSenders(), loadClassificationsData(), saveClassifications() — scan file I/O via gateway
src/vendor-map.js              — Single source of truth for vendor address → display name mappings
src/scanner.js                 — Scan orchestration, sender aggregation
src/sorter.js                  — IMAP folder management, message moving
src/downloader.js              — PDF attachment download with SHA-256 dedup
src/mailbox-detect.js          — detectMailbox(), detectMailboxAcrossAll() — finds which mailbox contains a given UID
src/reply.js                   — Pure reply builders: headers, body, editor template, parser
src/thread.js                  — Thread finding logic (header search + subject fallback); formatting moved to format-thread.js
src/inbox.js                   — fetchInbox() — inbox IMAP fetch; formatting moved to format-inbox.js
src/contacts.js                — extractContacts(), aggregateContacts() — contact extraction; formatting moved to format-contacts.js
src/flag-messages.js           — computeFlagChanges() (pure), applyFlagChanges() (IMAP)
src/attachment-parts.js        — findAttachmentParts(), findPdfParts() — BODYSTRUCTURE parsing
src/html-to-text.js            — Convert HTML to plain text
src/unsubscribe.js             — Extract unsubscribe links from email
src/parse-date.js              — Parse relative dates like "7d", "6m"

Gateways (thin I/O wrappers, mockable in tests):
src/gateways/fs-gateway.js     — FileSystemGateway: thin fs/path wrapper
src/gateways/subprocess-gateway.js — SubprocessGateway: execFileSync wrapper
src/gateways/imap-gateway.js   — ImapGateway: imapflow wrapper
src/gateways/smtp-gateway.js   — SmtpGateway: nodemailer wrapper
src/gateways/editor-gateway.js — EditorGateway: temp file + $EDITOR + read-back workflow
src/gateways/confirm-gateway.js — ConfirmGateway: readline yes/no prompt wrapper

src/index.js                   — Public API re-exports
data/                          — Runtime data (gitignored): scan results, classifications, manifest
```

### Key Design Decisions

- **ES modules** (`"type": "module"` in package.json)
- **imapflow** for IMAP — handles connection pooling, search, fetch, move
- **UID range strings** for iCloud compatibility (not arrays)
- **Content-hash dedup** (SHA-256) prevents duplicate PDF downloads
- **Config-driven accounts** — account metadata (host, port, user) lives in `~/.config/mailctl/config.json`; secrets come from macOS Keychain
- **Direct keychain access** — secrets are read from `~/.newt/newt-keychain-db` at runtime via `KeychainGateway`; no wrapper script or env vars needed
- **Shared helpers** — `forEachAccount()` handles connect/logout lifecycle, `filterScanMailboxes()` and `filterSearchMailboxes()` centralize mailbox exclusion logic
- **Search dedup** — search deduplicates results by message-id header to avoid showing the same email found in multiple mailboxes (e.g. Gmail All Mail + INBOX)
- **Consistent `--json`** — all commands support `--json` for machine-readable output; errors also output as JSON in that mode
- **Two canonical error escalation patterns for command orchestrators:**
  - *Single-item commands* (`read`, `reply`, `search`, `extract-attachment`, `thread`, `classify`, `import-classifications`) throw on failure. The CLI layer catches these via `withErrorHandling` and formats the error for the user.
  - *Batch commands* (`move`, `flag`) accumulate per-item `{ status: "failed", error: … }` entries in their result list and never throw on item-level failure. They return `{ stats, results }` even when some items failed.
  - *Thin delegators* (`scan`, `sort`, `download`, `inbox`, `contacts`, `list-folders`) wrap their delegate call in try/catch and re-throw with a user-facing prefix (e.g. `"Scan failed: " + err.message`) so raw IMAP protocol errors never reach the user directly.

## Engineering Standards

### Code Style

- ES module imports, no CommonJS
- Descriptive function and variable names — code is communication
- JSDoc `@param`/`@returns` type annotations on public functions for typecheck support
- JSDoc prose descriptions only when explaining WHY — constraints, invariants, non-obvious behavior. Do not restate what the function name already communicates.
- Console output: `console.error` for progress/status, `console.log` for data output
- No magic numbers — use named constants
- **Formatting enforced by Biome** — run `bun run lint:fix` to auto-fix

### Testing

- Use `bun:test` (`describe`, `it`, `expect`) — not `node:test` / `node:assert`
- Run tests: `bun test` — test files live in `test/`
- Test behaviour, not implementation
- One expectation per test
- Small, safe increments — single-reason commits

### Branching and Merging

- Trunk-based development: `main` is the only long-lived branch.
- All work lands on `main` via direct commit.
- Feature branches are not pushed to `origin`. Pull requests are not used.
- Short-lived local working branches (e.g. hopper worktrees) are merged to `main` and deleted locally before work is considered complete.

### Quality Gates (hone)

All five must pass before shipping:

- **typecheck**: `bunx tsc --noEmit` — JSDoc type checking via `checkJs` + `@types/node`
- **lint**: `bunx biome check src/ test/` — linting and formatting (Biome)
- **test**: `bun test` — all tests green
- **build**: `bun build src/cli.js --compile --outfile=build/mailctl`
- **audit**: `bun audit` — no known dependency vulnerabilities

To auto-fix lint and formatting issues: `bun run lint:fix`

### Security Rules — CRITICAL

- **NEVER** store credentials in source files, .env files, or commit them
- **NEVER** log, print, or expose secret values
- Credentials come from macOS Keychain via `KeychainGateway` at runtime
- If adding a new secret, add it to the Newt keychain (`~/.newt/newt-keychain-db`)

### Adding a New Email Account

1. Add the account to `~/.config/mailctl/config.json`:

   ```json
   {
     "prefix": "EXAMPLE",
     "name": "Example Mail",
     "user": "you@example.com",
     "keychainService": "newt-example-imap",
     "host": "imap.example.com",
     "port": 993
   }
   ```

2. Store the password in Newt keychain:

   ```bash
   security add-generic-password -a "you@example.com" -s "newt-example-imap" -l "Example IMAP" -w ~/.newt/newt-keychain-db
   ```

3. `mailctl` automatically reads the keychainService from the Newt keychain at runtime
4. Update README.md account table

### LLM-Based Receipt Extraction

The `download-receipts` command uses gpt-5-nano via mojentic for structured receipt data extraction. The extraction source depends on the email:

1. **PDF attachment present** → extract the PDF, convert to markdown via `docling` (`~/.local/bin/docling --to md`), send the markdown to the LLM
2. **No PDF attachment** (inline receipt like Apple, Anthropic emails) → send the email body text to the LLM

This matters because real receipt details (line items, amounts, tax) are often in the attached PDF, while the email body just says "Your invoice is attached".

To enable LLM extraction:

1. Store your OpenAI API key in the Newt keychain:

   ```bash
   security add-generic-password -s "newt-openai-api" -a "openai" -l "OpenAI API Key" -w ~/.newt/newt-keychain-db
   ```

2. `mailctl` automatically reads the key from the Newt keychain at runtime
3. If the key isn't available, the command falls back to regex-based pattern matching
4. `docling` must be installed at `~/.local/bin/docling` for PDF-to-markdown conversion; if missing, falls back to email body text

### Vendor Name Mapping

All vendor address → display name mappings are configured in `~/.config/mailctl/config.json` under `vendorAddressMap` and `vendorDomainMap`.
`src/vendor-map.js` loads these from config; `downloader.js` and `receipt-extraction.js` both consume the maps.
The address map drives both display names (with spaces) and filename-safe names (spaces → hyphens).

### IMAP Gotchas

- iCloud IMAP requires UID range strings (comma-separated), not arrays
- Always release mailbox locks in `finally` blocks
- Search results may vary by term — dedup UIDs with a Set before fetching
- Large mailboxes (90k+ messages) are slow to search — be patient with timeouts
- `messageMove` removes from source (IMAP MOVE, not copy)

## Skill Distribution

The `skills/mailctl/` directory is the source of truth for the mailctl Claude Code skill.

### Installing the skill

```bash
mailctl init              # install to .claude/skills/mailctl/ in CWD
mailctl init --global     # install to ~/.claude/skills/mailctl/
mailctl init --force      # overwrite even if installed version is newer
```

### Version stamping

`mailctl init` stamps `mailctl-version: X.Y.Z` into the installed SKILL.md frontmatter from the running binary's version. This allows the version guard to detect stale or newer installations.

### Version guard

Before overwriting an existing SKILL.md, `init` compares the installed `mailctl-version` with the running binary version:

- **No version field or no existing file** → always install
- **Installed version ≤ running version** → update normally
- **Installed version > running version** → refuse with warning, unless `--force` is used

This prevents an older binary from accidentally downgrading a skill installed by a newer version.

### Release checklist note

When releasing a new version, the embedded skill content is automatically compiled into the binary via Bun text imports — no extra steps needed. Just ensure `skills/mailctl/SKILL.md` is up to date before building.

## Local Installation

```bash
brew tap svetzal/tap
brew install mailctl
```

To upgrade: `brew upgrade mailctl`

## Release Process

To create a new release:

1. **Pre-flight** — all quality gates must pass:
   - `bunx tsc --noEmit` (typecheck)
   - `bunx biome check src/ test/` (lint)
   - `bun test` (tests)
   - `bun build src/cli.js --compile --outfile=build/mailctl` (build)
   - `bun audit` (audit)
2. **Update CHANGELOG.md** — move `[Unreleased]` to `[X.Y.Z]` with today's date
3. **Bump version** in both locations (must match):
   - `package.json` → `"version": "X.Y.Z"`
   - `src/cli.js` → `.version("X.Y.Z")`
4. **Update skill files** — ensure `skills/mailctl/SKILL.md` content is current
5. **Commit, tag, and push**:

```bash
git add -A && git commit -m "Release vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

The GitHub Actions release workflow (`.github/workflows/release.yml`) handles the rest:

- Runs tests
- Builds binaries for darwin-arm64, darwin-x64, linux-x64, windows-x64
- Creates a GitHub release with tarballs
- Updates the Homebrew formula in `svetzal/homebrew-tap` with computed SHA256s

**Prerequisite**: The `HOMEBREW_TAP_TOKEN` secret must be set on this repo for the auto-update step. Without it, binaries are released on GitHub but the Homebrew formula isn't updated.

1. **Local install immediately** (don't wait for Homebrew):

```bash
bun run build && cp build/mailctl /usr/local/bin/
```

Or use `bun link` for development.

1. **Re-init skills** to pick up the new version:

```bash
mailctl init --global --force
```

After Homebrew propagates, upgrade via: `brew upgrade mailctl`

## Related

- Classifications: `data/classifications.json` (business vs personal sender mapping)
- Download manifest: `data/download-manifest.json` (tracks downloaded PDFs with content hashes)
- Download output: Configured via `downloadDir` in config.json (defaults to `~/mailctl-receipts/`)
