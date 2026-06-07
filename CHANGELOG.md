# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
