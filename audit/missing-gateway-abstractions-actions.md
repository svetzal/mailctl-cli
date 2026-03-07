All 14 steps of the architectural improvement plan are complete. Here's the final state:

---

### What was delivered

**New pure-logic modules** (fully tested, zero I/O):
- `src/sort-logic.js` — `classifyMessage`, `planMoves`, folder constants
- `src/cli-helpers.js` — `sanitizeString`, `headerValueToString`, `collectValues`
- `src/html-to-text.js` — `htmlToText` (de-duplicated from two files)
- `src/receipt-extraction.js` — ~580 lines of extraction functions extracted from the god-module

**New gateway modules** (thin I/O wrappers, no logic to test):
- `src/gateways/imap-gateway.js`
- `src/gateways/fs-gateway.js`
- `src/gateways/subprocess-gateway.js`

**Refactored orchestrators** (now accept `deps = {}` for injection):
- `src/sorter.js` — `sortReceipts(opts, deps)`
- `src/downloader.js` — `downloadReceipts(opts, deps)`
- `src/scanner.js` — `scanAllAccounts(opts, deps)`

**New test files** (11 test files, 186 tests total):
- `test/sort-logic.test.js`, `test/cli-helpers.test.js`, `test/html-to-text.test.js`
- `test/receipt-extraction.test.js`, `test/downloader-pure.test.js`, `test/scanner-pure.test.js`
- `test/sorter.test.js`, `test/downloader.test.js`, `test/scanner.test.js`

**Quality gates** — all green:
```
bunx tsc --noEmit   → 0 errors
bun test            → 186 pass / 0 fail
bun build …         → binary in 84 ms
./build/mailctl     → starts cleanly
```