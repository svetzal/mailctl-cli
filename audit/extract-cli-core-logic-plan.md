Now I have a thorough understanding of the codebase. Here is the complete step-by-step plan:

---

## Plan: Extract Core Logic from `cli.js` to Follow Functional Core, Imperative Shell

### Overview

`cli.js` is a 714-line God Module mixing I/O, business logic, and presentation. The project already has excellent blueprints for the correct pattern (`sort-logic.js`, `imap-orchestration.js`, `search.js`). This plan extracts pure logic into testable modules, eliminates knowledge duplication, and slims `cli.js` to a thin orchestration shell.

Work is ordered in small, safe increments — each step produces a shippable commit with passing tests.

---

### Step 1: Extract message-id deduplication into a shared utility

**Why:** The `mid:${messageId}` deduplication pattern is duplicated in `cli.js:312-315` (search command) and `download-receipts.js:464-468`. This is knowledge duplication — both must change together for the same reason.

**Create `src/dedup.js`:**
- Export a pure function `deduplicateByMessageId(results)` that takes an array of objects with `{ messageId, account, mailbox, uid }` fields and returns a new array with duplicates removed.
- The dedup key logic: if `messageId` exists, use `mid:${messageId}`, otherwise fall back to `${account}:${mailbox}:${uid}`.
- This is a pure function — no I/O, no side effects.

**Create `test/dedup.test.js`:**
- Test: returns all items when no duplicates exist.
- Test: removes duplicates with the same `messageId`.
- Test: keeps items with different `messageId` values.
- Test: falls back to account:mailbox:uid key when `messageId` is empty/falsy.
- Test: preserves order (first occurrence wins).
- Test: handles empty array input.

**Update `cli.js` search command (~lines 285-316):**
- Import `deduplicateByMessageId` from `./dedup.js`.
- Replace the inline `seen` Set and dedup loop with a call to `deduplicateByMessageId(allResults)`.

**Update `download-receipts.js` (~lines 461-469):**
- Import `deduplicateByMessageId` from `./dedup.js`.
- Replace the inline `seen` Set and dedup loop with `const unique = deduplicateByMessageId(allResults)`.

**Quality gate:** Run `bun test`, `bunx tsc --noEmit`, `bun build src/cli.js --compile --outfile=build/mailctl`.

**Commit:** `Extract message-id deduplication into shared dedup.js module`

---

### Step 2: Extract UID parsing logic from the `move` command

**Why:** The `move` command handler (lines 588-607) contains 20 lines of pure parsing logic — splitting comma-separated UIDs, detecting account prefixes, validating inputs. This is testable logic buried in the imperative shell.

**Create `src/move-logic.js`:**

Export two pure functions:

1. `parseUidArgs(uidArgs, defaultAccount)`:
   - Takes `uidArgs` (array of strings from CLI) and `defaultAccount` (string or null from `--account` option).
   - For each arg, splits on commas, trims whitespace, filters empties.
   - For each part, detects `account:uid` prefix format (colon present, prefix is not all digits).
   - If no prefix and `defaultAccount` is null, throws an error with a helpful message.
   - Returns an array of `{ account: string, uid: string }` objects.

2. `groupUidsByAccount(parsed)`:
   - Takes the array from `parseUidArgs`.
   - Returns a `Map<string, string[]>` grouping UIDs by lowercase account name.

**Create `test/move-logic.test.js`:**
- Test `parseUidArgs`:
  - Parses simple UIDs with `--account` default: `["123", "456"]` with default `"icloud"` → `[{account:"icloud", uid:"123"}, ...]`
  - Parses account-prefixed UIDs: `["icloud:123", "gmail:456"]` → correct objects.
  - Expands comma-separated values: `["icloud:1,icloud:2,icloud:3"]` → 3 entries.
  - Throws when UID has no prefix and no default account.
  - Handles mixed prefixed and unprefixed with default account.
  - Filters empty strings from splitting.
  - Treats all-digit prefix as a UID (not an account name): `"12345:6789"` where `12345` is all digits should not be split as account:uid — wait, actually check the existing logic. Looking at line 593: `!/^\d+$/.test(part.substring(0, colonIdx))` — if the part before the colon is all digits, it's treated as a plain UID needing `--account`. Test this edge case.

- Test `groupUidsByAccount`:
  - Groups by lowercase account name.
  - Collects multiple UIDs per account.
  - Handles single account.

**Update `cli.js` move command (~lines 588-619):**
- Import `parseUidArgs` and `groupUidsByAccount` from `./move-logic.js`.
- Replace the inline parsing loop and grouping Map with calls to these functions.
- The remaining move command handler should focus on IMAP operations only.

**Quality gate:** Run `bun test`, `bunx tsc --noEmit`, `bun build src/cli.js --compile --outfile=build/mailctl`.

**Commit:** `Extract UID parsing and grouping into move-logic.js`

---

### Step 3: Extract email reading/formatting logic from the `read` command

**Why:** The `read` command (lines 344-429) has 85 lines mixing IMAP download, MIME parsing, body extraction, and dual-format output. The formatting logic (building the JSON result object, building the human-readable output) is pure once you have the parsed email data.

**Create `src/read-email.js`:**

Export two pure functions:

1. `buildReadResult(parsed, acctName, uid, opts)`:
   - Takes a parsed email object (from `simpleParser`) with fields: `date`, `from.text`, `to.text`, `subject`, `attachments`, `text`, `html`, `headers`.
   - Takes `acctName` (string), `uid` (string/number), and `opts` with `{ maxBody, includeHeaders, includeRawHtml }`.
   - Uses `htmlToText` for body conversion (import from `./html-to-text.js`).
   - Uses `sanitizeString` from `./cli-helpers.js`.
   - Uses `extractUnsubscribeLinks` from `./unsubscribe.js`.
   - Uses `headerValueToString` from `./cli-helpers.js`.
   - Returns a structured result object: `{ account, uid, date, from, to, subject, attachments, body, bodyHtml?, headers?, unsubscribeLinks }`.
   - This function is pure — same inputs, same outputs.

2. `formatReadResultText(parsed, opts)`:
   - Takes the same parsed email data plus `{ maxBody, showRaw }`.
   - Returns a formatted string for human-readable terminal output.
   - Pure string formatting function.

**Create `test/read-email.test.js`:**
- Test `buildReadResult`:
  - Maps parsed email fields to result object correctly.
  - Truncates body to `maxBody` characters.
  - Includes `bodyHtml` only when HTML is present.
  - Includes `headers` only when `includeHeaders` is true.
  - Extracts unsubscribe links.
  - Sanitizes string fields.
  - Handles missing optional fields (no attachments, no HTML, no text).

- Test `formatReadResultText`:
  - Includes date, from, to, subject lines.
  - Lists attachment filenames when present.
  - Truncates body text.
  - Shows raw HTML when `showRaw` is true and HTML exists.
  - Shows "(no text body)" when body is empty.

**Update `cli.js` read command (~lines 344-429):**
- Import `buildReadResult` and `formatReadResultText` from `./read-email.js`.
- The handler becomes: acquire lock → download → parse with simpleParser → call `buildReadResult` or `formatReadResultText` → output. Should be ~25-30 lines.

**Quality gate:** Run `bun test`, `bunx tsc --noEmit`, `bun build src/cli.js --compile --outfile=build/mailctl`.

**Commit:** `Extract email read formatting into read-email.js`

---

### Step 4: Extract attachment listing logic from `extract-attachment` command

**Why:** The `extract-attachment` command (lines 461-571) contains attachment listing/mapping logic that is pure once you have the BODYSTRUCTURE data. The `findAttachmentParts` function already exists in `attachment-parts.js`, but the listing format construction (lines 512-518) and validation (lines 535-541) are inline.

**Create `src/extract-attachment-logic.js`:**

Export pure functions:

1. `buildAttachmentListing(attachments)`:
   - Takes the array from `findAttachmentParts(bodyStructure)`.
   - Returns an array of `{ index, filename, contentType, size, part }` objects.
   - Pure mapping function.

2. `validateAttachmentIndex(attachments, index, uid)`:
   - Validates index is in range.
   - Returns `{ ok: true, attachment }` or `{ ok: false, error: string }`.

**Create `test/extract-attachment-logic.test.js`:**
- Test `buildAttachmentListing`:
  - Maps attachment parts to listing format.
  - Handles unnamed attachments with "(unnamed)" default.
  - Handles unknown content type.
  - Returns empty array for empty input.

- Test `validateAttachmentIndex`:
  - Returns ok for valid index.
  - Returns error for negative index.
  - Returns error for index beyond array length.
  - Returns error when attachments array is empty.

**Update `cli.js` extract-attachment command:**
- Import and use these functions, reducing the handler to IMAP fetch + format output.

**Quality gate:** Run `bun test`, `bunx tsc --noEmit`, `bun build src/cli.js --compile --outfile=build/mailctl`.

**Commit:** `Extract attachment listing logic into extract-attachment-logic.js`

---

### Step 5: Extract account filtering helper

**Why:** The pattern of filtering accounts by name appears three times in `cli.js` — in `read` (lines 351-353), `extract-attachment` (lines 475-477), and `move` (lines 625-627). While the code is small, it's the same decision repeated.

**Add to `src/cli-helpers.js`:**

Export a new pure function:

1. `filterAccountsByName(accounts, name)`:
   - If `name` is null/undefined, returns all accounts.
   - Otherwise filters by case-insensitive name match.
   - Returns the filtered array (may be empty).

**Add tests to `test/cli-helpers.test.js`:**
- Returns all accounts when name is null.
- Filters case-insensitively.
- Returns empty array when no match.

**Update `cli.js`:**
- Replace the three inline filter patterns with calls to `filterAccountsByName`.

**Quality gate:** Run `bun test`, `bunx tsc --noEmit`, `bun build src/cli.js --compile --outfile=build/mailctl`.

**Commit:** `Extract account filtering into cli-helpers.js`

---

### Step 6: Final cleanup and verification

**Review `cli.js`:**
- Verify every command handler is now ≤30 lines of orchestration code.
- Verify no business logic remains inline — only: parse options → call extracted function → format output → write to console.
- Verify all imports are used and no dead code remains.
- Estimated final size: ~350-400 lines (down from 714).

**Run full quality gate:**
1. `bun test` — all tests pass.
2. `bun test --coverage` — verify new modules have high coverage; check that overall coverage has improved.
3. `bunx tsc --noEmit` — zero type errors.
4. `bun build src/cli.js --compile --outfile=build/mailctl` — binary builds and runs without crashing.

**Update documentation:**
- Add new modules to the project structure in `AGENTS.md`:
  - `src/dedup.js` — Message-id deduplication (shared by search and download-receipts)
  - `src/move-logic.js` — UID parsing and account grouping for move command
  - `src/read-email.js` — Email read formatting (JSON and text output)
  - `src/extract-attachment-logic.js` — Attachment listing and validation
- Verify the "Key Design Decisions" section still reflects reality.

**Commit:** `Update AGENTS.md with new module documentation`

---

### Summary of Deliverables

| New Module | Lines (est.) | Functions | Test Count (est.) |
|---|---|---|---|
| `src/dedup.js` | ~20 | `deduplicateByMessageId` | 6 |
| `src/move-logic.js` | ~40 | `parseUidArgs`, `groupUidsByAccount` | 9 |
| `src/read-email.js` | ~60 | `buildReadResult`, `formatReadResultText` | 10 |
| `src/extract-attachment-logic.js` | ~30 | `buildAttachmentListing`, `validateAttachmentIndex` | 7 |

| Changed File | Impact |
|---|---|
| `cli.js` | Reduced from ~714 to ~350-400 lines; all handlers ≤30 lines |
| `download-receipts.js` | Dedup replaced with shared `deduplicateByMessageId` |
| `cli-helpers.js` | Added `filterAccountsByName` |
| `AGENTS.md` | Updated project structure |

### Principles Applied

- **Functional Core, Imperative Shell**: All extracted modules are pure functions with no I/O.
- **No Knowledge Duplication**: Message-id dedup consolidated; account filtering consolidated.
- **Reveals Intent**: Function names describe what they do (`parseUidArgs`, `buildReadResult`).
- **Minimal Entities**: No unnecessary abstractions — just functions, no classes needed.
- **Small, Safe Increments**: Each step is independently shippable with its own tests and commit.