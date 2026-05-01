`hone maintain` succeeded cleanly. Here's a summary of what was updated:

## Results

### Dependency Updated
| Package | Before | After | Type |
|---------|--------|-------|------|
| `imapflow` | 1.3.2 | 1.3.3 | Patch — bug fix (handles `NIL` delimiter in `NAMESPACE` response per RFC 2342) |

**All other packages were already at their latest versions:**
- `commander` 14.0.3 ✓, `mailparser` 3.9.8 ✓, `mojentic` 1.2.4 ✓, `nodemailer` 8.0.7 ✓, `@biomejs/biome` 2.4.13 ✓, `@types/bun` 1.3.13 ✓, `@types/node` 25.6.0 ✓

### Bonus Improvements (from hone's code quality pass)
While updating, hone also tightened error handling in the receipt download pipeline:
- **`pdf-converter.js` / `receipt-output-tree.js` / `download-receipts.js`** — Replaced hardcoded `console.error` calls with injectable `onError` callbacks, making these functions testable and giving callers control over error reporting
- **`downloader.js`** — Changed hash-read failures from `debug()` calls to structured `onProgress` events (`hash-read-error`) for consistency with the rest of the event system
- **New tests added** — `test/downloader.test.js`, `test/pdf-converter.test.js`, and `test/receipt-output-tree.test.js` all got new coverage for these error paths

### Quality Gates — All Passed ✅
- typecheck ✅ lint ✅ 1581 tests ✅ build ✅ audit (no vulnerabilities) ✅