---
description: Email management via the mailctl CLI — search, read, organize, and manage receipts across IMAP accounts
---

# mailctl — Email Management CLI

mailctl is a command-line tool for managing email across multiple IMAP accounts. It supports searching, reading, organizing, downloading receipt attachments, and more.

## Running Commands

All commands must be run through the `bin/run` wrapper, which injects macOS Keychain credentials securely:

```bash
bin/run <command> [options]
```

All commands support `--json` for machine-readable output and `--account <name>` to target a specific email account.

## Core Commands

### Reading & Searching Email

```bash
# Search across all accounts
bin/run search "query"
bin/run search --from "sender@example.com" "query"
bin/run search --subject "invoice" --since 2025-01-01
bin/run search --mailbox INBOX "query"
bin/run search --exclude-mailbox Trash "query"
bin/run search --months 3 "query"

# Read a specific email by UID
bin/run read <uid>
bin/run read <uid> --mailbox "Sent Messages"
bin/run read <uid> --raw          # full raw output
bin/run read <uid> --headers      # include all headers

# View recent inbox messages
bin/run inbox
bin/run inbox --unread --limit 20
bin/run inbox --since 3d

# View a conversation thread
bin/run thread <uid>
bin/run thread <uid> --full       # show full bodies
```

### Managing Messages

```bash
# Move emails to a folder
bin/run move <uid...> --to "Archive"
bin/run move icloud:123,gmail:456 --to "Archive"
bin/run move <uid> --to Trash --dry-run

# Flag messages (read/unread, star/unstar)
bin/run flag <uid...> --read
bin/run flag <uid...> --unread
bin/run flag <uid...> --star
bin/run flag <uid...> --unstar

# Reply to an email
bin/run reply <uid> --message "Thanks!"
bin/run reply <uid> --message-file response.txt
bin/run reply <uid> --edit        # open in editor
bin/run reply <uid> --dry-run     # preview without sending
```

### Folders & Contacts

```bash
# List all IMAP folders per account
bin/run list-folders

# Extract frequent contacts
bin/run contacts
bin/run contacts --sent            # from sent mail only
bin/run contacts --search "john"
```

### Attachments

```bash
# List attachments on an email
bin/run extract-attachment <uid> --list

# Save a specific attachment (by index)
bin/run extract-attachment <uid> 0
bin/run extract-attachment <uid> 0 -o ~/Desktop
```

### Receipt Management

```bash
# Scan for receipt-like messages
bin/run scan
bin/run scan --months 6

# Classify senders as business/personal
bin/run classify

# Sort receipts into Business/Personal folders
bin/run sort
bin/run sort --dry-run

# Download receipt PDF attachments
bin/run download
bin/run download --dry-run

# Advanced: LLM-based receipt extraction with metadata
bin/run download-receipts
bin/run download-receipts --vendor "Amazon"
bin/run download-receipts --list-vendors
bin/run download-receipts --dry-run
```

## Common Workflows

### Check for new important emails

```bash
bin/run inbox --unread
bin/run read <uid>                 # read a specific one
bin/run flag <uid> --read          # mark as read
```

### Find and organize emails

```bash
bin/run search "project update" --months 1
bin/run move <uid> --to "Projects/Active"
```

### Process receipts

```bash
bin/run scan --months 1            # find receipt senders
bin/run classify                   # classify new senders
bin/run sort                       # move to Business/Personal
bin/run download                   # download PDF attachments
```

### Reply to a message

```bash
bin/run read <uid>                 # review the email
bin/run reply <uid> --message "Got it, thanks!"
```

## Key Details

- **UIDs are account-scoped** — prefix with account name when targeting specific accounts: `icloud:123`, `gmail:456`
- **Mailbox auto-detection** — most commands auto-detect the mailbox for a UID; use `--mailbox` to override
- **Date filtering** — use `--since`, `--before`, or `--months` for date ranges
- **Dry run** — destructive commands (move, sort, reply) support `--dry-run` to preview
- **Multiple accounts** — commands search all configured accounts by default; use `--account` to filter
