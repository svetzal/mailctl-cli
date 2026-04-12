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

Why this project exists and what problem does it solve: @CHARTER.md

# mailctl Agent Instructions

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
mailctl extract-attachment <uid> [index]          # save attachment
mailctl extract-attachment <uid> -o ~/Desktop     # save to directory

# Receipt operations
mailctl scan                    # discover receipt senders
mailctl scan --json             # JSON output
mailctl sort                    # move emails to Business/Personal folders
mailctl sort --dry-run          # preview without moving
mailctl download                # download business receipt PDFs
mailctl download --dry-run
mailctl classify                # output unclassified senders
```

### Project Structure

```text
src/cli.js                     — CLI entry point: true thin dispatcher (~400 lines), each .action() is 5–15 lines with no inline event rendering logic

Command orchestrators (testable, injected deps):
src/search-command.js          — Search orchestration (cross-account, date filters, dedup)
src/read-command.js            — Read orchestration (fetch, parse, account detection)
src/reply-command.js           — Reply orchestration (fetch original, compose, send via SMTP)
src/move-command.js            — Move orchestration (multi-account, folder validation, dry-run)
src/flag-command.js            — Flag orchestration (detect mailbox, apply IMAP flags)
src/extract-attachment-command.js — Attachment extraction orchestration (BODYSTRUCTURE, download)
src/thread-command.js          — Thread orchestration (detect mailbox, cross-mailbox discovery)
src/inbox-command.js           — Inbox overview orchestration
src/contacts-command.js        — Contact extraction and aggregation orchestration
src/scan-command.js            — Receipt scan orchestration (scanAllAccounts + save results)
src/classify-command.js        — Classify orchestration (load senders, filter unclassified)
src/import-classifications-command.js — Import classifications orchestration (merge + write)
src/download-receipts-command.js — Download-receipts orchestration (list/reprocess/download routing)
src/find-message.js            — Shared withMessage() helper: cross-account UID lookup lifecycle

Pure logic modules:
src/config.js                  — Loads ~/.config/mailctl/config.json (account metadata)
src/accounts.js                — Builds IMAP account list from config.json + env var secrets
src/imap-client.js             — IMAP connection, search, fetch, mailbox filtering, account iteration
src/imap-orchestration.js      — Shared pure helpers: groupByMailbox(), forEachMailboxGroup()
src/search.js                  — searchMailbox() — single-mailbox search with field/date filters
src/dedup.js                   — deduplicateByMessageId() — shared by search and download-receipts
src/move-logic.js              — parseUidArgs(), groupUidsByAccount() — pure UID parsing for move command
src/read-email.js              — buildReadResult(), formatReadResultText() — pure email read formatting
src/extract-attachment-logic.js — buildAttachmentListing(), validateAttachmentIndex() — attachment helpers
src/date-filters.js            — resolveDateFilters() — pure --months/--since/--before precedence logic
src/format-bytes.js            — formatKB() — shared byte-to-KB formatter
src/format-scan.js             — formatScanSummaryText(), formatUnclassifiedText() — pure scan output formatters
src/format-search.js           — formatSearchResultsText() — pure search result formatter
src/format-move.js             — formatMoveResultText() — pure move summary formatter
src/format-sort.js             — formatSortResultText() — pure sort summary formatter
src/format-download.js         — formatDownloadResultText() — pure download summary formatter
src/format-download-receipts.js — formatDownloadReceiptsResultText() — pure download-receipts result formatter
src/render-auth-events.js      — renderAuthEvent() — pure auth progress event renderer
src/render-scan-events.js      — renderScanEvent() — pure scan progress event renderer
src/render-sort-events.js      — renderSortEvent() — pure sort progress event renderer
src/render-download-events.js  — renderDownloadEvent() — pure download progress event renderer
src/render-download-receipts-events.js — renderDownloadReceiptsEvent() — pure download-receipts progress event renderer
src/scan-data.js               — saveScanResults(), loadSenders(), loadClassificationsData(), saveClassifications() — scan file I/O via gateway
src/receipt-terms.js           — Single source of truth for receipt subject terms, exclusion patterns, and billing sender patterns
src/receipt-search-pipeline.js — searchMailboxForReceipts(), searchAccountForReceipts() — single-mailbox IMAP search and per-account orchestration with dedup; shared by download and list-vendors
src/receipt-filters.js         — applyReceiptFilters() — pure vendor and subject-exclusion filtering
src/receipt-output-tree.js     — walkOutputTree(), loadExistingInvoiceNumbers(), loadExistingHashes(), uniqueBaseName(), collectSidecarFiles(), writeReceiptOutput() — output directory tree and file I/O for receipt PDFs and sidecars
src/llm-receipt-extraction.js  — RECEIPT_EXTRACTION_SCHEMA, createLlmBroker(), extractMetadataWithLLM(), extractReceiptMetadata() — LLM-based receipt metadata extraction via mojentic
src/pdf-converter.js           — pdfToText(), resolveExtractionText() — docling subprocess wrapper and extraction text resolution
src/vendor-map.js              — Single source of truth for vendor address → display name mappings
src/scanner.js                 — Scan orchestration, sender aggregation
src/sorter.js                  — IMAP folder management, message moving
src/downloader.js              — PDF attachment download with SHA-256 dedup
src/download-receipts.js       — Receipt download orchestration: downloadReceiptEmails(), listReceiptVendors(), reprocessReceipts() — search → filter → extract metadata → write PDF+sidecar
src/receipt-extraction.js      — Pattern-based metadata extraction (regex fallback)
src/mailbox-detect.js          — detectMailbox() — finds which mailbox contains a given UID
src/reply.js                   — Pure reply builders: headers, body, editor template, parser
src/thread.js                  — Thread finding and formatting (header search + subject fallback)
src/inbox.js                   — fetchInbox(), formatInboxText() — inbox overview
src/contacts.js                — extractContacts(), aggregateContacts(), formatContactsText()
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

## Engineering Standards

### Code Style

- ES module imports, no CommonJS
- Descriptive function and variable names — code is communication
- JSDoc comments on public functions
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

6. **Local install immediately** (don't wait for Homebrew):

```bash
bun run build && cp build/mailctl /usr/local/bin/
```

Or use `bun link` for development.

7. **Re-init skills** to pick up the new version:

```bash
mailctl init --global --force
```

After Homebrew propagates, upgrade via: `brew upgrade mailctl`

## Related

- Classifications: `data/classifications.json` (business vs personal sender mapping)
- Download manifest: `data/download-manifest.json` (tracks downloaded PDFs with content hashes)
- Download output: Configured via `downloadDir` in config.json (defaults to `~/mailctl-receipts/`)
