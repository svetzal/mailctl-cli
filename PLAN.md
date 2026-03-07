# PLAN.md — Evolution from receipt-sorter to mailctl

## Vision

A personal email operations tool that manages inboxes across multiple accounts. Not just receipts — spam control, unsubscribes, subscription auditing, and expense trimming.

## New Name: `mailctl`

- Package: `mailctl`
- Binary: `mailctl`
- Repo rename: `receipt-sorter` → `mailctl` (GitHub)
- Skill rename: `receipt-sorter` → `mailctl`

## Current Capabilities (receipt-sorter)

- ✅ IMAP connect via secure keychain credentials (iCloud, Gmail configured)
- ✅ Scan for receipt-like emails, aggregate by sender
- ✅ Classify senders as business/personal
- ✅ Sort emails into IMAP folders (Receipts/Business, Receipts/Personal)
- ✅ Download business receipt PDFs with content dedup
- ✅ Ad-hoc search/read utilities (search-mail, read-email, find-email)

## Planned Capabilities

### Phase 1 — Rename & Restructure

- [ ] Rename package, binary, repo, skill references
- [ ] Update README for broader scope
- [ ] Consolidate ad-hoc scripts (search-mail, read-email, find-email) into proper CLI subcommands
- [ ] Add `mailctl search` — general-purpose email search across accounts
- [ ] Add `mailctl read` — fetch and display a specific email by UID/message-id
- [ ] Add `mailctl list-folders` — show all IMAP folders per account

### Phase 2 — Spam & Unsubscribe

- [ ] `mailctl spam` — flag/report/delete obvious spam
- [ ] `mailctl unsubscribe` — parse List-Unsubscribe headers, hit mailto/URL unsubscribe endpoints
- [ ] `mailctl senders` — show sender frequency/volume to identify noise
- [ ] Archive/delete/move operations with dry-run by default

### Phase 3 — Subscription Audit

- [ ] `mailctl subscriptions` — detect recurring payment/invoice/renewal emails
- [ ] Build a subscription summary: service name, frequency, amount (when parseable), last seen
- [ ] Flag subscriptions not seen recently (cancelled?) or new ones
- [ ] Export subscription list as markdown or JSON for review

### Phase 4 — Ongoing Ops

- [ ] Cron-friendly mode: scan new mail since last run, auto-sort, flag anomalies
- [ ] Integration with gilt for expense cross-referencing
- [ ] Additional account setup via config.json

## Architecture Notes

- Keep the secure keychain wrapper (`bin/run`) — it's solid
- All destructive operations dry-run by default, `--write` to persist (gilt pattern)
- Output JSON for agent consumption, human-readable summaries to stdout
- Maintain the existing security model: secrets never in agent context

## Open Questions

- Do we want `mailctl` installable via homebrew-tap like hopper/hone?
- Should unsubscribe actions that require browser clicks integrate with OpenClaw browser tooling?
