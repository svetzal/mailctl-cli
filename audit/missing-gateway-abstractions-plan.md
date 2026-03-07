Now I have a thorough understanding of the codebase. Here is the complete plan:

---

## Plan: Address Functional Core / Imperative Shell Violations

### Overview

The codebase has ~11 source files but only 2 test files covering pure utility modules. The orchestration layer (`scanner.js`, `sorter.js`, `downloader.js`, `download-receipts.js`, `imap-client.js`) has zero tests because business logic is interleaved with I/O (IMAP, filesystem, subprocesses, LLM calls). This plan incrementally extracts pure functions, introduces gateway abstractions, and wires up dependency injection — in small, safe steps that each leave the codebase working.

---

### Step 1: Extract `htmlToText` into a shared utility module

**Why:** `htmlToText()` and `HTML_ENTITIES` are duplicated identically in `src/cli.js` (lines 18–54) and `src/download-receipts.js` (lines 33–63). This violates "No Knowledge Duplication" — both copies must change together.

**Actions:**

1. Create `src/html-to-text.js` containing:
   - The `HTML_ENTITIES` constant
   - The `htmlToText(html)` function
   - Export both as named exports
2. Update `src/cli.js` to `import { htmlToText } from "./html-to-text.js"` and remove the local `HTML_ENTITIES` and `htmlToText` definitions (lines 18–54).
3. Update `src/download-receipts.js` to `import { htmlToText } from "./html-to-text.js"` and remove its local `HTML_ENTITIES` and `htmlToText` definitions (lines 33–63).
4. Create `test/html-to-text.test.js` with tests for:
   - Stripping `<style>` and `<script>` blocks
   - Converting `<br>`, `</p>`, `</div>` to newlines
   - Stripping remaining tags
   - Decoding named HTML entities (`&amp;`, `&lt;`, `&nbsp;`)
   - Decoding numeric entities (`&#39;`, `&#x27;`)
   - Collapsing whitespace while preserving newlines
   - Trimming output
   - Handling empty string input
5. Run `bun test` to verify all tests pass.
6. Run `bunx tsc --noEmit` to verify zero type errors.
7. Run `bun build src/cli.js --compile --outfile=build/mailctl` to verify build.

**Commit message:** "Extract htmlToText into shared utility to eliminate duplication"

---

### Step 2: Export and test pure functions from `downloader.js`

**Why:** `vendorName()` and `buildFilename()` in `src/downloader.js` (lines 53–95) are pure functions buried inside a module that also does I/O. They're not exported or tested. This is the lowest-effort, highest-value testability win.

**Actions:**

1. Add `export` to `vendorName(address, senderName)` (line 53) and `buildFilename(vendor, date, attachmentName, existingFiles)` (line 78) in `src/downloader.js`.
2. Also export `VENDOR_NAMES` for test verification if needed.
3. Create `test/downloader-pure.test.js` with tests for `vendorName`:
   - Known vendor address returns mapped name (e.g., `"noreply@github.com"` → `"GitHub"`)
   - Unknown address with sender name returns cleaned name (strips "Inc.", "LLC", etc.)
   - Unknown address without sender name returns local part of email
   - Long names get truncated at word boundary to ≤30 chars
   - Case-insensitive address matching
4. Add tests for `buildFilename`:
   - Formats date correctly as `"Vendor YYYY-MM-DD.pdf"`
   - Handles Date objects and date strings
   - Appends `_2`, `_3` suffix when filename already exists in `existingFiles` set
   - Works with empty `existingFiles` set
5. Run `bun test` — all tests pass.
6. Run `bunx tsc --noEmit` — zero errors.

**Commit message:** "Export and test pure vendorName and buildFilename from downloader"

---

### Step 3: Extract and test pure functions from `download-receipts.js`

**Why:** `download-receipts.js` is a 1200+ line god-module containing ~15 pure functions mixed with orchestration I/O. Extracting the pure functions makes them testable and reduces the module's cognitive load.

**Actions:**

1. Create `src/receipt-extraction.js` and move these pure functions from `download-receipts.js`:
   - `titleCase(s)`
   - `sanitizeFilename(str)`
   - `vendorFromDomain(domain)` (with `VENDOR_DOMAIN_MAP`, `DOMAIN_STRIP_PREFIXES`)
   - `extractVendorFromContent(subject, bodyText)`
   - `cleanVendorForFilename(address, name, bodyText, subject)` (with `VENDOR_DOMAINS`, `GENERIC_SENDER_PREFIXES`, `SELF_ADDRESSES`)
   - `extractForwardedSender(bodyText)` (with `FORWARDED_MARKERS`)
   - `formatDate(d)`
   - `inferCurrency(text)` (with `CANADIAN_DOMAINS`)
   - `isCanadianMerchant(fromAddress, bodyText)`
   - `isValidInvoiceNumber(s)` (with `MIN_INVOICE_DIGITS`, `INVOICE_BLOCKLIST`)
   - `extractInvoiceNumber(subject, bodyText)`
   - `extractAmount(text)`
   - `extractTax(text)`
   - `extractService(text)`
   - `extractMetadata(bodyText, subject, fromAddress, fromName, emailDate)`
2. Export all functions from `src/receipt-extraction.js`.
3. Update `src/download-receipts.js` to import from `./receipt-extraction.js` instead of defining locally.
4. Create `test/receipt-extraction.test.js` with tests organized by function:
   - **`titleCase`**: `"best-buy"` → `"Best-Buy"`, `"vevor"` → `"Vevor"`
   - **`sanitizeFilename`**: removes `/\:*?"<>|,`, replaces spaces with hyphens, collapses multiple hyphens
   - **`vendorFromDomain`**: known domain map lookup, subdomain stripping, TLD removal, fallback titlecasing
   - **`cleanVendorForFilename`**: exact address match, generic sender falls back to domain, corporate suffix stripping, self-sent email handling, forwarded email detection
   - **`extractForwardedSender`**: detects each forwarded marker format, extracts address and name, returns null for non-forwarded emails
   - **`formatDate`**: Date object → `"YYYY-MM-DD"`, date string → `"YYYY-MM-DD"`
   - **`inferCurrency`**: CAD for HST/GST/PST/QST, USD default, EUR/GBP detection
   - **`isCanadianMerchant`**: known domains, `.ca` TLD, parent domain matching, tax indicator detection
   - **`isValidInvoiceNumber`**: rejects too few digits, blocks tax registration numbers, blocks blocklisted values
   - **`extractInvoiceNumber`**: finds `#XXXX`, `Invoice XXXX`, `Receipt #XXXX`, `Order ID: XXXX` patterns
   - **`extractAmount`**: total keyword patterns, fallback to largest dollar amount, currency extraction
   - **`extractTax`**: HST/GST/PST/QST dollar amounts, rejects invalid formats
   - **`extractService`**: plan/product/subscription label extraction, garbage rejection
   - **`extractMetadata`**: integration test combining the above — returns correct schema structure with all fields populated
5. Run `bun test` — all tests pass.
6. Run `bunx tsc --noEmit` — zero errors.

**Commit message:** "Extract pure receipt extraction functions into testable module"

---

### Step 4: Extract and test pure classification logic from `sorter.js`

**Why:** The "classify message → determine destination folder" logic inside `sortReceipts()` (lines 94–107) is pure decision logic entangled with IMAP calls. Extracting it makes it independently testable.

**Actions:**

1. Create `src/sort-logic.js` with:
   - `classifyMessage(address, classifications)` → `"business"` | `"personal"` | `"unclassified"` — encapsulates the lookup logic at sorter.js lines 99–107
   - `planMoves(messages, classifications)` → `{ business: uid[], personal: uid[] }` — groups UIDs by classification, defaulting unclassified to personal
   - Constants: `BIZ_FOLDER = "Receipts/Business"`, `PERSONAL_FOLDER = "Receipts/Personal"` (currently in sorter.js lines 10–11)
2. Update `src/sorter.js` to import and use `classifyMessage`, `planMoves`, `BIZ_FOLDER`, `PERSONAL_FOLDER` from `./sort-logic.js`, removing duplicated logic.
3. Create `test/sort-logic.test.js` with tests:
   - **`classifyMessage`**:
     - Known business address → `"business"`
     - Known personal address → `"personal"`
     - Unknown address → `"unclassified"`
   - **`planMoves`**:
     - Mixed messages produce correct `business` and `personal` UID arrays
     - Unclassified messages go to personal
     - All business → empty personal array
     - Empty messages → empty arrays
4. Run `bun test` — all tests pass.
5. Run `bunx tsc --noEmit` — zero errors.

**Commit message:** "Extract pure sort classification logic into testable module"

---

### Step 5: Extract and test `aggregateBySender` from `scanner.js`

**Why:** `aggregateBySender()` (scanner.js lines 51–85) is already pure, but it's in a module alongside `scanAllAccounts()` which does I/O. It should be independently importable and has no tests.

**Actions:**

1. Create `test/scanner-pure.test.js` testing `aggregateBySender`:
   - Empty array → empty array
   - Single result → single sender with count 1
   - Multiple results from same address → aggregated count, merged accounts, sample subjects limited to 3
   - Sorting by count descending
   - Latest date tracking and name update
   - Sets converted to arrays in output
2. Import directly from `src/scanner.js` — no restructuring needed since `aggregateBySender` is already exported.
3. Run `bun test` — all tests pass.

**Commit message:** "Add tests for pure aggregateBySender function"

---

### Step 6: Extract and test pure CLI helpers from `cli.js`

**Why:** `cli.js` contains several pure functions (`sanitizeString`, `headerValueToString`, `collectValues`) that are untested but used in output formatting. Also, `searchMailbox` (lines 344–394) contains search dedup logic that's pure once given results.

**Actions:**

1. Create `src/cli-helpers.js` and move from `cli.js`:
   - `sanitizeString(str)` (lines 62–66)
   - `headerValueToString(value)` (lines 73–80)
   - `collectValues(value, previous)` (lines 335–338)
2. Update `src/cli.js` to import these from `./cli-helpers.js`.
3. Create `test/cli-helpers.test.js`:
   - **`sanitizeString`**: strips control characters, preserves newlines and tabs, passes through non-strings
   - **`headerValueToString`**: string passthrough, Date → ISO string, object with `.text`, object with `.value`, array handling
   - **`collectValues`**: comma splitting, trimming, appending to previous array
4. Run `bun test` — all tests pass.
5. Run `bunx tsc --noEmit` — zero errors.

**Commit message:** "Extract and test pure CLI helper functions"

---

### Step 7: Introduce IMAP Gateway abstraction

**Why:** This is the single biggest unlock for testability. Every orchestration module (`scanner.js`, `sorter.js`, `downloader.js`, `download-receipts.js`) directly calls `ImapFlow` methods via `imap-client.js` helpers. Without a gateway abstraction, none of this can be tested without a live IMAP server.

**Actions:**

1. Create `src/gateways/imap-gateway.js` as a thin wrapper class:
   ```javascript
   export class ImapGateway {
     async connect(account) { /* delegates to existing connect() */ }
     async listMailboxes(client) { /* delegates to existing listMailboxes() */ }
     async getMailboxLock(client, mailbox) { /* wraps client.getMailboxLock() */ }
     async search(client, criteria, opts) { /* wraps client.search() */ }
     async *fetch(client, range, opts, fetchOpts) { /* wraps client.fetch() */ }
     async messageMove(client, uids, destination, opts) { /* wraps client.messageMove() */ }
     async download(client, uid, part, opts) { /* wraps client.download() */ }
     async logout(client) { /* wraps client.logout() */ }
   }
   ```
   This is a **thin gateway** — no logic, just delegation. It wraps the `ImapFlow` dependency at a single boundary.
2. Refactor `forEachAccount()` in `src/imap-client.js` to accept an optional `imapGateway` parameter, defaulting to a new `ImapGateway()` instance. This preserves backward compatibility.
3. Do NOT change the calling code yet — this step just introduces the abstraction.
4. No tests for the gateway itself (it's a thin wrapper with no logic).
5. Run `bun test` — all existing tests still pass.
6. Run `bunx tsc --noEmit` — zero errors.
7. Run `bun build src/cli.js --compile --outfile=build/mailctl` — build succeeds.

**Commit message:** "Introduce ImapGateway abstraction for IMAP boundary"

---

### Step 8: Introduce FileSystem Gateway

**Why:** `sorter.js`, `downloader.js`, and `download-receipts.js` all use `readFileSync`, `writeFileSync`, `existsSync`, `mkdirSync`, `readdirSync` directly. A thin filesystem gateway lets tests inject mocks for file operations.

**Actions:**

1. Create `src/gateways/fs-gateway.js`:
   ```javascript
   export class FileSystemGateway {
     readJson(path) { /* readFileSync + JSON.parse */ }
     writeJson(path, data) { /* JSON.stringify + writeFileSync */ }
     readFile(path) { /* readFileSync */ }
     writeFile(path, data) { /* writeFileSync */ }
     exists(path) { /* existsSync */ }
     mkdir(path) { /* mkdirSync recursive */ }
     readdir(path) { /* readdirSync */ }
     rm(path, opts) { /* rmSync */ }
   }
   ```
2. No tests for the gateway (thin wrapper, no logic).
3. Run `bun test` and `bunx tsc --noEmit`.

**Commit message:** "Introduce FileSystemGateway abstraction for filesystem boundary"

---

### Step 9: Introduce Subprocess Gateway

**Why:** `download-receipts.js` calls `execFileSync` for `docling` PDF conversion (line 786). Wrapping this in a gateway enables testing the extraction orchestration without requiring `docling` to be installed.

**Actions:**

1. Create `src/gateways/subprocess-gateway.js`:
   ```javascript
   export class SubprocessGateway {
     execFileSync(cmd, args, opts) { /* wraps child_process.execFileSync */ }
   }
   ```
2. No tests for the gateway (thin wrapper).
3. Run `bun test` and `bunx tsc --noEmit`.

**Commit message:** "Introduce SubprocessGateway for subprocess boundary"

---

### Step 10: Inject gateways into `sorter.js`

**Why:** With gateways available, `sortReceipts()` can accept injected dependencies, making it testable.

**Actions:**

1. Modify `sortReceipts(opts)` signature to `sortReceipts(opts, deps)` where `deps` is optional:
   ```javascript
   export async function sortReceipts(opts = {}, deps = {}) {
     const fsGateway = deps.fsGateway ?? new FileSystemGateway();
     const imapGateway = deps.imapGateway ?? new ImapGateway();
     // ...
   }
   ```
2. Replace direct `readFileSync`/`existsSync` calls with `fsGateway.readJson()`, `fsGateway.exists()`.
3. Replace direct `loadAccounts()` with `deps.loadAccounts ?? loadAccounts` to allow test injection.
4. Replace direct IMAP calls with `imapGateway` methods.
5. Update `src/cli.js` call site — no change needed since `deps` defaults.
6. Create `test/sorter.test.js` with mock gateways:
   - Test that business-classified messages are moved to `Receipts/Business`
   - Test that personal-classified messages are moved to `Receipts/Personal`
   - Test that unclassified messages default to personal
   - Test dry-run mode doesn't call `messageMove`
   - Test error stats when `messageMove` throws
   - Test missing `classifications.json` throws appropriate error
7. Run `bun test` — all tests pass.
8. Run `bunx tsc --noEmit` — zero errors.

**Commit message:** "Inject gateways into sorter for testability"

---

### Step 11: Inject gateways into `downloader.js`

**Why:** Same pattern as sorter — makes `downloadReceipts()` testable by injecting mock IMAP and filesystem gateways.

**Actions:**

1. Modify `downloadReceipts(opts)` to accept `deps` parameter with optional `fsGateway`, `imapGateway`, `loadAccounts`.
2. Replace direct I/O calls with gateway methods.
3. Create `test/downloader.test.js` with mock gateways:
   - Test that only business-classified messages have PDFs downloaded
   - Test SHA-256 content dedup skips duplicates
   - Test manifest tracking (already-downloaded messages skipped)
   - Test dry-run mode doesn't write files
   - Test non-PDF content validation (skips files not starting with `%PDF-`)
   - Test filename building with vendor name and date
4. Run `bun test` — all tests pass.

**Commit message:** "Inject gateways into downloader for testability"

---

### Step 12: Inject gateways into `scanner.js`

**Why:** `scanAllAccounts()` directly calls `loadAccounts()` and `forEachAccount()`. Injecting these makes it testable.

**Actions:**

1. Modify `scanAllAccounts(opts)` to accept `deps` parameter with optional `imapGateway`, `loadAccounts`.
2. Create `test/scanner.test.js` with mock gateways:
   - Test that results from multiple accounts are aggregated
   - Test `months` parameter correctly calculates `since` date
   - Test `allMailboxes` flag scans all folders
   - Test empty accounts list throws error
3. Run `bun test` — all tests pass.

**Commit message:** "Inject gateways into scanner for testability"

---

### Step 13: Update `src/index.js` exports

**Why:** New modules need to be available via the public API.

**Actions:**

1. Add exports for:
   - `src/html-to-text.js`
   - `src/receipt-extraction.js`
   - `src/sort-logic.js`
   - `src/cli-helpers.js`
   - Gateway classes
2. Run `bun test` and `bunx tsc --noEmit`.

**Commit message:** "Update public API exports with new modules"

---

### Step 14: Final quality gate verification

**Why:** All four quality gates from AGENTS.md must pass before shipping.

**Actions:**

1. **Lint:** `bunx tsc --noEmit` — zero errors
2. **Test:** `bun test --coverage` — all tests pass, coverage significantly improved from baseline
3. **Build:** `bun build src/cli.js --compile --outfile=build/mailctl` — binary runs without crashing
4. **Audit:** `bun audit` (if available) — no known vulnerabilities
5. Verify the compiled binary starts: `./build/mailctl --help`
6. Review all new files for:
   - Descriptive function names
   - JSDoc comments on exported functions
   - No `any` types or `@ts-ignore` suppressions
   - No duplicated knowledge across modules

**Commit message:** "Verify all quality gates pass after refactoring"

---

### Summary of deliverables

| Step | New/Modified Files | Tests Added |
|------|-------------------|-------------|
| 1 | `src/html-to-text.js` (new), `cli.js`, `download-receipts.js` | `test/html-to-text.test.js` |
| 2 | `src/downloader.js` (add exports) | `test/downloader-pure.test.js` |
| 3 | `src/receipt-extraction.js` (new), `download-receipts.js` | `test/receipt-extraction.test.js` |
| 4 | `src/sort-logic.js` (new), `sorter.js` | `test/sort-logic.test.js` |
| 5 | — | `test/scanner-pure.test.js` |
| 6 | `src/cli-helpers.js` (new), `cli.js` | `test/cli-helpers.test.js` |
| 7 | `src/gateways/imap-gateway.js` (new), `imap-client.js` | — |
| 8 | `src/gateways/fs-gateway.js` (new) | — |
| 9 | `src/gateways/subprocess-gateway.js` (new) | — |
| 10 | `src/sorter.js` | `test/sorter.test.js` |
| 11 | `src/downloader.js` | `test/downloader.test.js` |
| 12 | `src/scanner.js` | `test/scanner.test.js` |
| 13 | `src/index.js` | — |
| 14 | — | — |

**Estimated test file count after completion:** 2 existing + 10 new = **12 test files**

**Key principle:** Steps 1–6 are zero-risk pure extractions that add tests without changing any behavior. Steps 7–9 introduce gateway infrastructure. Steps 10–12 wire up dependency injection for orchestration-level testing. Each step leaves the codebase in a working, deployable state.