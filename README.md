# mailctl

Personal email operations tool — receipt sorting, search, folder management, and more. Connects to email accounts via secure keychain credentials, manages receipts, searches mail, and provides general IMAP operations across multiple accounts.

- **Created:** 2026-01-31

## Setup

```bash
npm install
```

### Credential Storage (macOS Keychain)

Credentials are stored in `~/.newt/newt-keychain-db` — an encrypted macOS Keychain file. **No `.env` files, no plaintext secrets on disk.**

To add an IMAP account:

```bash
security unlock-keychain ~/.newt/newt-keychain-db
read -rs "pw?Password: " && security add-generic-password \
  -a "you@example.com" \
  -s "newt-<account>-imap" \
  -l "<Account> IMAP" \
  -w "$pw" ~/.newt/newt-keychain-db && unset pw && echo " ✅"
```

The `bin/run` wrapper script handles keychain unlock and credential injection at runtime. Secrets are never exposed to calling processes or agent contexts.

### Currently Configured Accounts

| Account | Keychain Service | Status |
|---------|-----------------|--------|
| iCloud | `newt-icloud-imap` | ✅ Connected |
| Gmail | — | ⬜ Not configured |
| Microsoft 365 | — | ⬜ Not configured |

## Usage

All commands go through the secure wrapper:

```bash
bin/run <command> [options]
```

### General Email Operations

#### Search — Find emails across accounts

Searches **all mailboxes** by default (excluding Junk and Drafts). Results include which mailbox each email was found in. Duplicates are removed via message-id dedup.

```bash
bin/run search "John"                          # search all mailboxes for "John"
bin/run search -f "Jane" "Jane"                 # search by sender name
bin/run search -s "invoice" ""                 # search by subject
bin/run search --mailbox INBOX "keyword"       # search only INBOX
bin/run search --mailbox INBOX --mailbox Sent "keyword"  # search specific folders
bin/run search --mailbox "INBOX,Sent" "keyword"          # comma-separated also works
bin/run search --exclude-mailbox Trash "keyword"         # skip Trash
bin/run search -l 5 "term"                     # limit to 5 results per mailbox per account
```

#### Read — Display a specific email

```bash
bin/run read 12345                  # read email by UID from INBOX
bin/run read 12345 --mailbox Archive
bin/run read 12345 --account iCloud
bin/run read 12345 --max-body 5000
```

#### List Folders — Show all IMAP folders

```bash
bin/run list-folders                # list folders for all accounts
```

### Receipt Operations

#### Scan — Discover receipt senders

```bash
bin/run scan              # last 12 months
bin/run scan -m 24        # last 24 months
bin/run scan -a           # all mailboxes (slower)
```

Outputs:
- `data/scan-results.json` — every receipt email found
- `data/senders.json` — aggregated by sender with counts
- Human-readable summary to stdout

#### Classify — Tag senders as business or personal

```bash
bin/run classify
```

Outputs unclassified senders as JSON. Set `"classification"` to `"business"` or `"personal"` for each, then import:

```bash
bin/run import-classifications classified.json
```

Classifications stored in `data/classifications.json`.

#### Sort — Move emails into receipt folders

```bash
bin/run sort              # move emails
bin/run sort --dry-run    # preview without moving
bin/run sort -m 6         # only last 6 months
```

Creates and populates two IMAP folders:
- 📁 `Receipts/Business`
- 📁 `Receipts/Personal`

Skips Sent, Junk, Trash, Drafts. Unclassified senders default to personal.

#### Extract Attachment — Save or list email attachments

```bash
bin/run extract-attachment 12345                  # save first attachment from UID 12345
bin/run extract-attachment 12345 2                # save attachment at index 2
bin/run extract-attachment 12345 --list           # list all attachments
bin/run extract-attachment 12345 --account iCloud --mailbox Archive
bin/run extract-attachment 12345 -o ~/Desktop     # save to custom directory
```

Lists or extracts individual attachments from a specific email. Prints the saved file path to stdout for piping to downstream tools.

#### Download — Get business receipt PDFs

```bash
bin/run download          # download to OneDrive
bin/run download --dry-run
bin/run download -m 6
bin/run download -o ~/Desktop/test  # custom output dir
```

Downloads PDF attachments from business receipt emails. Output directory is configurable via `downloadDir` in `~/.config/mailctl/config.json` (defaults to `~/mailctl-receipts/`).

**Filename convention:** `Vendor YYYY-MM-DD.pdf` with `_2`, `_3` suffixes for multiple attachments on the same date.

**Dedup:** SHA-256 content hashing — never downloads the same PDF twice, even across runs. State tracked in `data/download-manifest.json`.

## Typical Workflow

1. **Search** to find specific emails across accounts
2. **Scan** to find new receipt senders
3. **Classify** new senders as business or personal
4. **Sort** to move emails into the right folders
5. **Download** to grab business PDFs for the bookkeeper

## Architecture

```
bin/
└── run                 # Secure wrapper — keychain → env → tool process

src/
├── cli.js              # CLI interface (commander)
├── index.js            # Public API exports
├── accounts.js         # Account config from environment variables
├── imap-client.js      # IMAP connection, search, fetch, folder listing
├── scanner.js          # Scan orchestration & sender aggregation
├── sorter.js           # IMAP folder creation & message moving
├── downloader.js       # PDF attachment download with content dedup

data/                   # (gitignored) scan results, classifications, manifest
```

## Security Model

```
User / Agent
  → invokes bin/run (cannot see secrets)
    → wrapper reads keychain password from login keychain
      → unlocks ~/.newt/newt-keychain-db
        → reads IMAP credentials
          → injects into child process environment
            → Node.js tool runs with credentials
              → credentials exist only in process memory
```

Secrets never appear in agent context, command history, or on disk.

## License

MIT
