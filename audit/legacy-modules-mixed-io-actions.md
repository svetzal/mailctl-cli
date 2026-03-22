All changes are complete and all quality gates pass. Here's a summary of what was accomplished:

---

## Summary: Functional Core / Imperative Shell Improvements

661 tests pass (+34 new tests), `tsc --noEmit` clean, binary builds successfully.

### New pure modules created

| File | What it contains |
|---|---|
| `src/mailbox-filters.js` | `filterScanMailboxes()` + `filterSearchMailboxes()` — pure, zero I/O |
| `src/scan-helpers.js` | `buildScanResult()` — pure envelope → result object construction |

### Duplication eliminated

`requireClassificationsData()` added to `src/scan-data.js` — the single canonical implementation that throws when `classifications.json` is missing. Replaced the identical `loadClassifications()` functions duplicated in both `sorter.js` and `downloader.js`.

### Direct `fs` imports removed

- **`src/sorter.js`** — `import { readFileSync, existsSync } from "fs"` removed; replaced with `requireClassificationsData` + `FileSystemGateway`
- **`src/downloader.js`** — all five direct `fs` imports removed; file operations now go through `fs: new FileSystemGateway()` in the injectable gateway

### Console output pushed to shell boundary

**`src/sorter.js`** gained an `onProgress = () => {}` third parameter. All 11 `console.error` calls removed from business logic and replaced with typed event objects (`folder-exists`, `folder-created`, `scan-complete`, `moved`, `move-dry-run`, `move-error`, etc.).

**`src/cli.js`** sort handler now owns the display logic, translating structured events back to the original emoji-prefixed `console.error` strings. Observable behavior is identical.

### Tests updated

- `test/downloader.test.js` — four ad-hoc file-operation lambdas replaced with a single `fs` mock object
- `test/scan-data.test.js` — two new tests for `requireClassificationsData`
- `test/mailbox-filters.test.js` — 17 new tests (all filter edge cases)
- `test/scan-helpers.test.js` — 11 new tests for `buildScanResult`