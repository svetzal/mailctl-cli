The dependency update is complete. Here's what changed:

## Dependency Updates

| Package | Before | After | Type |
|---------|--------|-------|------|
| `imapflow` | 1.3.2 | 1.3.3 | Patch |

The `imapflow` patch fixes handling of `NIL` delimiters in `NAMESPACE` responses per RFC 2342 — a real-world correctness fix for IMAP folder listing.

**All other packages were already at their latest versions**: `commander` 14.0.3, `mailparser` 3.9.8, `mojentic` 1.2.4, `nodemailer` 8.0.7, `@biomejs/biome` 2.4.13, `@types/bun` 1.3.13, `@types/node` 25.6.0.

## Bonus Improvements

While running, hone also tightened error handling in the receipt download pipeline:
- **`pdf-converter.js` / `receipt-output-tree.js` / `download-receipts.js`** — Replaced hardcoded `console.error` calls with injectable `onError` callbacks (more testable, callers control error reporting)
- **`downloader.js`** — Hash-read failures now emit structured `hash-read-error` progress events instead of raw `debug()` calls
- **New test coverage** added for these error paths in `downloader`, `pdf-converter`, and `receipt-output-tree`

## Quality Gates — All Passed ✅

`typecheck` ✅ `lint` ✅ `test` (1581 tests) ✅ `build` ✅ `audit` (no vulnerabilities) ✅