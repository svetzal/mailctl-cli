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
mailctl folders                 # list all IMAP folders per account (list-folders is an alias)
mailctl folders --json          # JSON output for scripting
mailctl extract-attachment <uid> --list           # list attachments
mailctl extract-attachment <uid> [index]          # save attachment (PDF preferred; smime.p7s skipped)
mailctl extract-attachment <uid> -o ~/Desktop     # save to directory

# Receipt operations — grouped under `receipts` (legacy top-level names are hidden aliases)
# Mutating commands preview by default; add --apply to execute.
mailctl receipts scan                    # discover receipt senders
mailctl receipts scan --json             # JSON output
mailctl receipts sort                    # preview moves to Business/Personal folders
mailctl receipts sort --apply            # execute the moves
mailctl receipts download                # preview business receipt PDF downloads
mailctl receipts download --apply        # download them
mailctl receipts classify                # output unclassified senders
mailctl receipts extract --since 2026-01-01 -o <dir>        # preview (add --apply to write)
mailctl receipts extract --since 2026-01-01 --apply         # download + write sidecars
mailctl receipts extract --since 2026-01-01 --max 10 --apply  # cap at 10 messages
mailctl receipts extract --since 2026-01-01 --timeout 60 --apply   # 60 s per-message timeout
mailctl receipts extract --since 2026-01-01 --budget 300 --apply   # 5-minute overall cap
```

### Project Structure

```text
src/cli.js                     — Composition root only (~80 lines): wires named dep slices into per-noun registrars and does nothing else. New commands belong in the relevant src/cli/*-cli.js module, not here.
src/cli-context.js             — createCliContext() — builds the shared CliContext (resolveJson, resolveAccount, wrapAction, mutating, contextDeps, progress) from global opts and requireAccounts
src/cli-helpers.js             — resolveAccounts(), withErrorHandling(), createFormatOutput(), resolveCommandContext() — shared CLI dispatch/formatting helpers consumed by the noun-registrar modules

Noun-registrar modules (src/cli/):
Files in src/cli/ import sibling files as ./X.js and parent src/ files as ../X.js.
Adding a new command in a noun group means editing only the matching registrar file.
src/cli/receipts-cli.js        — registerReceiptsCommands(program, ctx, deps): `receipts` noun group (scan, classify, import-classifications, sort, download, extract) + hidden legacy aliases; exports receiptsDeps
src/cli/mail-cli.js            — registerMailCommands(program, ctx, deps): read-only mail nouns (search, read, folders/list-folders, extract-attachment, inbox, thread, contacts); exports mailDeps
src/cli/mutation-cli.js        — registerMutationCommands(program, ctx, deps): mutating message commands (move, flag, reply) with injected smtpGateway/editorGateway/confirmGateway; exports mutationDeps
src/cli/init-cli.js            — registerInitCommand(program, ctx, deps): skill-distribution init command; exports initDeps

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
src/receipts/download-receipts.js       — Public façade: re-exports downloadReceiptEmails, listReceiptVendors, reprocessReceipts, createReceiptRunState, and three pass-throughs; ~12 lines
src/receipts/download-receipt-emails.js — downloadReceiptEmails() orchestrator and helpers (resolveDownloadReceiptsOptions, processAccountReceipts, processReceiptMessageGroup, processOneReceiptMessage, selectAccountReceipts, toProcessContext, announceLlm)
src/receipts/list-receipt-vendors.js    — listReceiptVendors() — aggregates vendor counts from receipt search results without downloading
src/receipts/reprocess-receipts.js      — reprocessReceipts() and helpers (reprocessOneSidecar, resolveReprocessSource, persistReprocessedSidecar) — re-extract metadata from existing sidecars via LLM
src/receipts/receipt-run.js             — createReceiptWriteContext(), createReceiptRun(), createReceiptRunState() — value-object factories for ReceiptWriteContext, ReceiptRunLimits, ReceiptRun
src/receipts/receipt-gateways.js        — resolveGateways(overrides), DEFAULT_PER_MESSAGE_TIMEOUT_MS — production gateway defaults; all workflow modules import from here instead of defining their own
src/receipts/download-receipts-event-factories.js — descriptor table for download-receipts events (44 factories covering all phases) and `renderDownloadReceiptsEvent`
src/receipts/receipt-decisions.js       — Pure classification/transformation decisions, receipt filtering, PDF hash/validation helpers
src/receipts/receipt-fields.js          — extractInvoiceNumber(), extractAmount(), extractTax(), extractService(), field-length/currency constants — pure receipt field extraction primitives
src/receipts/receipt-types.js           — shared JSDoc typedefs for receipt records (no runtime exports); includes ReceiptWriteContext, ReceiptRunLimits, ReceiptRun
src/receipts/receipt-vendor-name.js     — cleanVendorForFilename(), vendorFromDomain(), extractForwardedSender() — vendor-name derivation for receipt filenames
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
src/keychain.js                — loadAccountCredentials(), loadOpenAiKey() — resolve account passwords and OpenAI key from the keychain gateway
src/m365-auth.js               — getM365AccessToken() — Microsoft 365 OAuth device-code / token-refresh flow
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
src/content-sanitizer.js       — detectInjectionPatterns(), neutralizeContent(), buildLlmEmailContext() — prompt-injection screening/sanitization for agent-facing email content
src/debug.js                   — debug() — gated diagnostic logging helper
src/download-filename.js       — vendorName(), buildFilename() — vendor-aware receipt-PDF filename construction
src/email-address.js           — getLocalPart(), getDomain() — email-address parsing helpers
src/error-event.js             — errorEvent() — structured error-event factory
src/format-date.js             — formatShortDate(), formatDatetime(), formatMessageDate() — pure date formatters
src/mailbox-filters.js         — filterScanMailboxes(), filterSearchMailboxes() — centralized mailbox-exclusion logic
src/parse-options.js           — parseIntOption(), parseSinceOption() — pure CLI option coercion/validation
src/scan-helpers.js            — buildScanResult() — pure scan-result record builder
src/sort-logic.js              — classifyMessage(), planMoves(), BIZ_FOLDER/PERSONAL_FOLDER constants — pure sort classification and move planning
src/rethrow-with-prefix.js     — rethrowWithPrefix(err, prefix) — prefixes an error message while preserving stack, cause, and code
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
src/gateways/keychain-gateway.js — KeychainGateway: reads secrets from ~/.newt/newt-keychain-db (macOS security wrapper)

src/index.js                   — Public API re-exports
src/init.js                    — initCommand() (imperative shell), buildInitResult()/warningFor() (pure) — delegates multi-platform skill install to cmx-core behind `mailctl init`
data/                          — Runtime data (gitignored): scan results, classifications, manifest
```

### Key Design Decisions

- **ES modules** (`"type": "module"` in package.json)
- **imapflow** for IMAP — handles connection pooling, search, fetch, move
- **UID range strings** for iCloud compatibility (not arrays)
- **Content-hash dedup** (SHA-256) prevents duplicate PDF downloads
- **Config-driven accounts** — account metadata (host, port, user) lives in `~/.config/mailctl/config.json`; secrets come from macOS Keychain
- **Direct keychain access** — secrets are read from `~/.newt/newt-keychain-db` at runtime via `KeychainGateway` (`src/gateways/keychain-gateway.js`); `src/keychain.js` wraps the gateway to expose `loadAccountCredentials()` and `loadOpenAiKey()`; no wrapper script or env vars needed
- **Shared helpers** — `forEachAccount()` handles connect/logout lifecycle, `filterScanMailboxes()` and `filterSearchMailboxes()` centralize mailbox exclusion logic
- **Search dedup** — search deduplicates results by message-id header to avoid showing the same email found in multiple mailboxes (e.g. Gmail All Mail + INBOX)
- **Consistent `--json`** — all commands support `--json` for machine-readable output; errors also output as JSON in that mode
- **Canonical error escalation patterns for command orchestrators:**
  - *Single-item commands* (`read`, `reply`, `search`, `extract-attachment`, `thread`, `classify`, `import-classifications`) throw on failure. The CLI layer catches these via `withErrorHandling` and formats the error for the user.
  - *Batch commands* (`move`, `flag`) accumulate per-item `{ status: "failed", error: … }` entries in their result list and never throw on item-level failure. They return `{ stats, results }` even when some items failed.
  - *Thin delegators* (`scan`, `sort`, `download`, `inbox`, `contacts`, `folders`) wrap their delegate call in try/catch and re-throw via `rethrowWithPrefix()`, which prefixes the message for user-facing display, sets `{ cause }` to preserve the original error stack, and forwards `code` so `withErrorHandling` can emit machine-readable `--json` errors (e.g. `{ error: "Scan failed: …", code: "ETIMEDOUT" }`).
  - *Per-item degradation* (`processReceiptMessage`'s caller, `walkOutputTree`, `pdfToText`, `processDownloadMessage`, `searchMailboxForReceipts`) — long-running batch traversals catch **operational** failures per item, emit a progress event, tally into `stats.errors` / `failures[]`, and continue. They **must** call `rethrowIfProgrammerError()` (from `src/programmer-error.js`) first so `TypeError`/`ReferenceError`/`RangeError`/`SyntaxError` escape to the command boundary. A non-zero `stats.errors` or `stats.timedOut` sets a non-zero exit code.

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

#### Coverage caveats (Bun-specific)

Bun's V8 coverage reporter can under-report execution in two ways:

1. **Multi-line call expressions and `await` continuations** — Bun may mark continuation lines as uncovered even when the call executed successfully. This is a tool artifact, not a real gap.

2. **`mock.module()` in test files** — When a test file calls `mock.module("../src/foo.js", ...)`, it registers a duplicate module instance under the same path. V8 tracks the mock instance with zero coverage, which can drag down the aggregate number for the original file. The fix is to use dependency injection instead of `mock.module` so no duplicate registration occurs.

**Before writing tests for a suspected gap, verify it is genuinely dead with a mutation probe:**

```bash
# Insert a throw on the suspect line in the source file:
#   throw new Error("probe");
# Then run only the tests that should exercise that code:
bun test test/foo.test.js
```

If tests fail, the line executes and the coverage report was wrong — do not add new tests for it. Only add tests when the probe confirms the line never executes.

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

The `skills/mailctl/` directory is the source of truth for the mailctl companion skill. Installation is delegated to [`cmx-core`](https://www.npmjs.com/package/cmx-core) so a single `init` reaches every agent platform the user manages — not just Claude.

### Installing the skill

```bash
mailctl init              # install across all cmx-managed platforms (user home, default)
mailctl init --local      # install into the current project instead
mailctl init --force      # overwrite drifted or newer installs
```

### Target resolution (owned by cmx-core)

`init` builds a `BundledSkill` from the embedded `SKILL.md`, a `ToolIdentity("mailctl", version)`, and an `InstallerContext` (`NodeFilesystem` + `SystemClock` + `ConfigPaths.fromEnv`), then runs `SkillInstaller.plan()` → `apply()`. cmx-core resolves which platforms to write:

1. `~/.config/context-mixer/config.json` → `platforms: [...]` if present (filtered to those supporting skills), else
2. any platform with an existing cmx lockfile (`cmx-lock*.json`), else
3. `claude`.

Each platform's install directory comes from cmx-core's platform table (e.g. claude → `.claude/skills`, codex → `.agents/skills`, hermes → `.hermes/skills`).

### Version handling & guard (owned by cmx-core)

mailctl no longer stamps its own version marker. cmx-core reconciles `metadata.version` in the installed `SKILL.md` from the binary version and records per-platform state (version + checksum) in `cmx-lock*.json`:

- **Untracked or missing on disk** → install
- **Same version, on disk matches** → up to date (skip)
- **Older tracked version** → update
- **On disk drifted (local edits)** → skip with a `--force` hint
- **Newer version installed** → refuse that platform with a `--force` hint (other platforms still install)

`init` also registers a `bundled:mailctl` managed source in `sources.json`, so `cmx` can maintain the skill alongside other artifacts.

### Release checklist note

The embedded skill content is compiled into the binary via Bun text imports — no extra steps needed. Just ensure `skills/mailctl/SKILL.md` is current before building. The `cmx-core` version is a normal npm dependency; bumping it (for new platforms or install semantics) is a regular `bun add cmx-core@latest` + rebuild.

## Local Installation

### Released version (end users)

```bash
brew tap svetzal/tap
brew install mailctl
```

To upgrade: `brew upgrade mailctl`

### Local build (development / before Homebrew catches up)

To run a freshly built binary immediately — e.g. after a change, or right after
tagging a release while CI is still building — install it to `~/.local/bin`,
never to a Homebrew-managed path:

```bash
bun run build
mkdir -p ~/.local/bin
cp build/mailctl ~/.local/bin/mailctl
codesign --force --sign - ~/.local/bin/mailctl   # macOS: re-sign after copy (see note)
mailctl init --force                              # refresh the global companion skill
hash -r; which mailctl; mailctl --version         # should report ~/.local/bin and the new version
```

- **Always install to `~/.local/bin/mailctl` — never `/opt/homebrew/bin` or
  `/usr/local/bin`.** Writing over a brew-managed path stomps Homebrew's state
  and makes the next `brew upgrade` fail to link. `~/.local/bin` must sit *ahead*
  of the Homebrew bin directory in `PATH` so the local build wins; `which mailctl`
  should report `~/.local/bin/mailctl`. If it reports a Homebrew path instead, fix
  your `PATH` ordering rather than installing elsewhere. (`/usr/local/bin` is
  typically *after* `/opt/homebrew/bin` on Apple Silicon, so it will not shadow
  the released binary — this is why it's the wrong target.)
- **The `codesign --force --sign -` step is a macOS safeguard.** Bun's `--compile`
  embeds an ad-hoc signature that can be invalidated when the file is copied
  (macOS may attach a `com.apple.provenance` xattr that desyncs the embedded
  hash); when that happens the kernel SIGKILLs the process on launch with no
  useful error (just `[1] <pid> killed mailctl …`). It doesn't always trigger,
  but re-signing is harmless and avoids a baffling silent kill.
- **This is a temporary bridge.** Once the release CI has updated the Homebrew tap
  (`brew update && brew info svetzal/tap/mailctl` shows the new version), switch
  back to the brew-managed binary and remove the shadow so it can't go stale:

  ```bash
  brew upgrade svetzal/tap/mailctl
  rm -f ~/.local/bin/mailctl
  ```

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

**To use the new version immediately** (don't wait for Homebrew), follow the
[Local build](#local-build-development--before-homebrew-catches-up) procedure
above: build, install to `~/.local/bin`, `codesign`, and `mailctl init --force`.
Once the tap has caught up, `brew upgrade svetzal/tap/mailctl` and remove the
`~/.local/bin` shadow.

## Related

- State directory: `$XDG_STATE_HOME/mailctl` (default `~/.local/state/mailctl`), resolved once in `src/data-dir.js`
- Classifications: `<state-dir>/classifications.json` (business vs personal sender mapping)
- Download manifest: `<state-dir>/download-manifest.json` (tracks downloaded PDFs with content hashes)
- Download output: Configured via `downloadDir` in config.json (defaults to `~/mailctl-receipts/`)
