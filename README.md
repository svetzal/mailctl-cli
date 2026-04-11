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

The `mailctl` binary reads credentials directly from the macOS Keychain at runtime. Secrets are never exposed to calling processes or agent contexts.

### Currently Configured Accounts

| Account | Keychain Service | Status |
|---------|-----------------|--------|
| iCloud | `newt-icloud-imap` | ✅ Connected |
| Gmail | — | ⬜ Not configured |
| Microsoft 365 | — | ⬜ Not configured |

## Usage

```bash
mailctl <command> [options]
```

For development (running from the source repo), use `bin/run` instead to inject keychain credentials.

### General Email Operations

#### Search — Find emails across accounts

Searches **all mailboxes** by default (excluding Junk and Drafts). Results include which mailbox each email was found in. Duplicates are removed via message-id dedup.

```bash
mailctl search "John"                          # search all mailboxes for "John"
mailctl search -f "Jane" "Jane"                 # search by sender name
mailctl search -s "invoice" ""                 # search by subject
mailctl search --mailbox INBOX "keyword"       # search only INBOX
mailctl search --mailbox INBOX --mailbox Sent "keyword"  # search specific folders
mailctl search --mailbox "INBOX,Sent" "keyword"          # comma-separated also works
mailctl search --exclude-mailbox Trash "keyword"         # skip Trash
mailctl search -l 5 "term"                     # limit to 5 results per mailbox per account
```

#### Read — Display a specific email

```bash
mailctl read 12345                  # read email by UID from INBOX
mailctl read 12345 --mailbox Archive
mailctl read 12345 --account iCloud
mailctl read 12345 --max-body 5000
```

#### List Folders — Show all IMAP folders

```bash
mailctl list-folders                # list folders for all accounts
```

### Receipt Operations

#### Scan — Discover receipt senders

```bash
mailctl scan              # last 12 months
mailctl scan -m 24        # last 24 months
mailctl scan -a           # all mailboxes (slower)
```

Outputs:
- `data/scan-results.json` — every receipt email found
- `data/senders.json` — aggregated by sender with counts
- Human-readable summary to stdout

#### Classify — Tag senders as business or personal

```bash
mailctl classify
```

Outputs unclassified senders as JSON. Set `"classification"` to `"business"` or `"personal"` for each, then import:

```bash
mailctl import-classifications classified.json
```

Classifications stored in `data/classifications.json`.

#### Sort — Move emails into receipt folders

```bash
mailctl sort              # move emails
mailctl sort --dry-run    # preview without moving
mailctl sort -m 6         # only last 6 months
```

Creates and populates two IMAP folders:
- 📁 `Receipts/Business`
- 📁 `Receipts/Personal`

Skips Sent, Junk, Trash, Drafts. Unclassified senders default to personal.

#### Extract Attachment — Save or list email attachments

```bash
mailctl extract-attachment 12345                  # save first attachment from UID 12345
mailctl extract-attachment 12345 2                # save attachment at index 2
mailctl extract-attachment 12345 --list           # list all attachments
mailctl extract-attachment 12345 --account iCloud --mailbox Archive
mailctl extract-attachment 12345 -o ~/Desktop     # save to custom directory
```

Lists or extracts individual attachments from a specific email. Prints the saved file path to stdout for piping to downstream tools.

#### Download — Get business receipt PDFs

```bash
mailctl download          # download to OneDrive
mailctl download --dry-run
mailctl download -m 6
mailctl download -o ~/Desktop/test  # custom output dir
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
src/
├── cli.js              # CLI interface (commander)
├── index.js            # Public API exports
├── accounts.js         # Account loading with keychain credentials
├── keychain.js         # Keychain credential resolution logic
├── gateways/
│   └── keychain-gateway.js  # Thin wrapper for macOS security CLI
├── imap-client.js      # IMAP connection, search, fetch, folder listing
├── scanner.js          # Scan orchestration & sender aggregation
├── sorter.js           # IMAP folder creation & message moving
├── downloader.js       # PDF attachment download with content dedup

data/                   # (gitignored) scan results, classifications, manifest
```

## Security Model

```
User / Agent
  → invokes mailctl (cannot see secrets)
    → reads keychain password from login keychain
      → unlocks ~/.newt/newt-keychain-db
        → reads IMAP credentials via security CLI
          → credentials exist only in process memory
```

Secrets never appear in agent context, command history, or on disk.

## License

MIT
