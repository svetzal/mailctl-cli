# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.2.0] - 2026-07-06

### Changed

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
