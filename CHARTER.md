# mailctl Charter

## Purpose

mailctl serves Stacey Vetzal's personal and business email accounts on her Mac and her own Linux hosts. It connects to IMAP through platform secret stores to search, read, organize, and extract data from email. Its primary workflow is identifying receipt emails, classifying them as business or personal, sorting them into IMAP folders, and downloading business receipt PDFs for bookkeeping.

## Goals

- Provide fast, scriptable email search and read operations across multiple IMAP accounts
- Automate receipt discovery, classification, and sorting into organized IMAP folders
- Download and deduplicate business receipt PDF attachments for bookkeeper handoff
- Keep credentials secure via macOS Keychain or TPM2-bound systemd credentials on Linux -- no plaintext secret files or secrets in agent contexts
- Support machine-readable (--json) output on all commands for agent and pipeline integration
- Provision and replicate credentials through preview/apply CLI operations without exposing values; on Linux use privileged TPM2-only operations on every supported systemd version
- Ship as a single compiled binary installable via Homebrew on macOS or directly on Linux

## Non-Goals

- Not a general-purpose email client -- no compose, calendar, or contact sync
- Not a server-side or multi-user tool -- this is for one person's accounts on her Mac and her own Linux hosts
- Not a replacement for IMAP folder rules or server-side filtering
- No web UI or GUI -- CLI and agent integration only

## Target Users

Stacey Vetzal and agents operating on her behalf. The tool is designed for a solo operator who needs automated receipt management and email search across personal and business accounts.

## Credential policy

`mailctl.charter.credentials-in-platform-secret-store` and
`operations.decision.2026-10-02.mailctl-on-ops-01` authorize platform-neutral
credential provisioning and replication. The binding always-sudo decision
requires privileged TPM2-only Linux encryption/decryption, with no weaker
fallback. See [the operator workflow](docs/linux-secret-store.md).
