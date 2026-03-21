# mailctl Charter

## Purpose

mailctl is a personal email operations CLI that connects to IMAP accounts via secure macOS Keychain credentials to search, read, organize, and extract data from email. Its primary workflow is identifying receipt emails, classifying them as business or personal, sorting them into IMAP folders, and downloading business receipt PDFs for bookkeeping.

## Goals

- Provide fast, scriptable email search and read operations across multiple IMAP accounts
- Automate receipt discovery, classification, and sorting into organized IMAP folders
- Download and deduplicate business receipt PDF attachments for bookkeeper handoff
- Keep credentials secure via macOS Keychain -- no secrets on disk or in agent contexts
- Support machine-readable (--json) output on all commands for agent and pipeline integration
- Ship as a single compiled binary installable via Homebrew

## Non-Goals

- Not a general-purpose email client -- no compose, calendar, or contact sync
- Not a server-side or multi-user tool -- this is for one person's accounts on macOS
- Not a replacement for IMAP folder rules or server-side filtering
- No web UI or GUI -- CLI and agent integration only

## Target Users

Stacey Vetzal and Claude Code agents operating on her behalf. The tool is designed for a solo operator who needs automated receipt management and email search across personal and business accounts.
