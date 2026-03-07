Now I have a thorough understanding of the codebase. Here is the complete plan:

---

## Plan: Complete the Functional Core / Imperative Shell Migration

### Summary

The codebase has gateway classes (`ImapGateway`, `FileSystemGateway`, `SubprocessGateway`) that are never used, while orchestrators (`scanner.js`, `sorter.js`, `downloader.js`, `download-receipts.js`) use ad-hoc `deps` bags or direct imports for I/O. This plan consolidates the vendor maps, wires up gateways properly, extracts shared IMAP choreography, and makes `download-receipts.js` testable.

---

### Step 1: Consolidate the Vendor Name Maps

**Problem:** `VENDOR_NAMES` in `downloader.js` and `VENDOR_DOMAINS` in `receipt-extraction.js` are nearly identical maps with different formatting (spaces in `downloader.js` vs hyphens in `receipt-extraction.js`). They can diverge silently and represent duplicated knowledge.

**Actions:**

1. Create a new file `src/vendor-map.js` containing a single canonical vendor map as the source of truth. Each entry maps a sender email address to a vendor identifier object or a single canonical name (e.g., `"Anthropic"`).

2. Export two derived views from `src/vendor-map.js`:
   - `VENDOR_DISPLAY_NAMES` — with spaces for human-readable use (used by `downloader.js`'s `vendorName()` function): `"Anthropic"`, `"Microsoft M365"`, `"Springer Nature"`
   - `VENDOR_FILENAME_NAMES` — with hyphens for filesystem-safe use (used by `receipt-extraction.js`'s `cleanVendorForFilename()` function): `"Anthropic"`, `"Microsoft-M365"`, `"Springer-Nature"`
   - Derive both from a single source map using a simple transform (replace spaces with hyphens for filename variant).

3. Also move `VENDOR_DOMAIN_MAP` (the domain-level fallback map in `receipt-extraction.js`) into `src/vendor-map.js` since it's closely related.

4. Update `downloader.js` to import `VENDOR_DISPLAY_NAMES` from `src/vendor-map.js` instead of defining its own `VENDOR_NAMES`.

5. Update `receipt-extraction.js` to import `VENDOR_FILENAME_NAMES` and `VENDOR_DOMAIN_MAP` from `src/vendor-map.js` instead of defining its own `VENDOR_DOMAINS` and `VENDOR_DOMAIN_MAP`.

6. **Run tests:** `bun test` to confirm no regressions. Existing tests for `vendorName()` in `test/downloader-pure.test.js` and `cleanVendorForFilename()` in `test/receipt-extraction.test.js` should still pass.

7. **Run quality gates:** `bunx tsc --noEmit`, `bun build src/cli.js --compile --outfile=build/mailctl`.

**Commit message:** "Consolidate vendor name maps into single source of truth"

---

### Step 2: Redesign the Gateway Interfaces for Actual Use

**Problem:** The existing gateway classes (`ImapGateway`, `FileSystemGateway`, `SubprocessGateway`) exist but nothing uses them. Meanwhile, the orchestrators use ad-hoc `deps` bags with 5–12 optional function overrides each, duplicating the "preamble destructure" pattern.

**Actions:**

1. **Redesign `src/gateways/fs-gateway.js`** to add a `readJson`/`writeJson` convenience and keep it as-is (it's already well-designed). No changes needed — it's ready to use.

2. **Redesign `src/gateways/imap-gateway.js`** to absorb the shared functions from `imap-client.js` that represent I/O boundaries:
   - `connect(account)` — already present
   - `listMailboxes(client)` — move from `imap-client.js`
   - `getMailboxLock(client, mailbox)` — already present
   - `search(client, criteria, opts)` — already present
   - `fetch(client, range, opts, fetchOpts)` — already present
   - `messageMove(client, uids, destination, opts)` — already present
   - `download(client, uid, part, opts)` — already present
   - `logout(client)` — already present
   
   Keep `filterScanMailboxes()` and `filterSearchMailboxes()` in `imap-client.js` — they are pure functions (no I/O), so they belong in the core.

3. **Keep `SubprocessGateway`** as-is for `download-receipts.js`'s `docling` calls.

4. **Do NOT change the orchestrators in this step** — only prepare the gateways. This keeps the step small and safe.

5. **Run tests and quality gates** to ensure nothing breaks.

**Commit message:** "Prepare gateway classes for orchestrator wiring"

---

### Step 3: Extract Shared IMAP Choreography into a Reusable Helper

**Problem:** The pattern "load accounts → for each account connect → list mailboxes → filter → scan → group by mailbox → lock/unlock" is repeated verbatim in `scanner.js`, `sorter.js`, `downloader.js`, and `download-receipts.js`. This is knowledge duplication — the IMAP lifecycle choreography is the same decision repeated four times.

**Actions:**

1. Create `src/imap-orchestration.js` with a helper function:

   ```js
   /**
    * Run an operation across all configured accounts' receipt mailboxes.
    * Handles: load accounts → connect → list → filter → scan → group by mailbox → callback per mailbox group.
    *
    * @param {object} opts - { months, since, filterOpts, ... }
    * @param {object} gateways - { imap, fs } gateway instances
    * @param {Function} perMailboxFn - async (client, account, mailbox, messages, lock) => void
    * @returns {Promise<Array>} aggregated results from perMailboxFn
    */
   export async function forEachReceiptMailbox(opts, gateways, perMailboxFn) { ... }
   ```

2. This helper encapsulates:
   - Loading accounts (via gateway or passed in)
   - `forEachAccount` connect/logout lifecycle
   - Listing and filtering mailboxes
   - Scanning for receipts
   - Grouping results by mailbox
   - Acquiring/releasing mailbox locks with `try/finally`
   - Calling the provided callback with `(client, account, mailbox, messages)` for each group

3. **Do NOT refactor the orchestrators to use this helper yet** — just create it with tests. Write tests that verify the choreography using mock gateways.

4. **Run tests and quality gates.**

**Commit message:** "Extract shared IMAP receipt-mailbox choreography"

---

### Step 4: Wire Up `scanner.js` to Use Gateways and Shared Choreography

**Problem:** `scanner.js`'s `scanAllAccounts()` uses a 5-function `deps` bag.

**Actions:**

1. Refactor `scanAllAccounts()` to accept gateways (or use the `forEachReceiptMailbox` helper from Step 3) instead of the ad-hoc `deps` bag. The function signature becomes:

   ```js
   export async function scanAllAccounts(opts = {}, gateways = defaultGateways) { ... }
   ```

   Where `defaultGateways` provides production implementations (importing from gateway classes).

2. Update `test/scanner.test.js` to pass mock gateway objects instead of the ad-hoc deps bag. The test structure stays the same — just the injection mechanism changes.

3. Verify `aggregateBySender()` remains a pure function with no changes needed.

4. Update `src/cli.js` to pass gateways when calling `scanAllAccounts()` (or let it use defaults).

5. **Run all tests and quality gates.**

**Commit message:** "Wire scanner.js to use gateway injection"

---

### Step 5: Wire Up `sorter.js` to Use Gateways and Shared Choreography

**Problem:** `sorter.js`'s `sortReceipts()` uses a 6-function `deps` bag and directly calls `client.messageMove()` and `client.mailboxOpen()`.

**Actions:**

1. Refactor `sortReceipts()` similarly to scanner — accept gateway objects instead of `deps` bag.

2. The `ensureFolders()` helper uses `client.mailboxOpen`/`client.mailboxClose`/`client.mailboxCreate` directly — route these through the IMAP gateway.

3. Update `test/sorter.test.js` to use mock gateways.

4. Update `src/cli.js` call site.

5. **Run all tests and quality gates.**

**Commit message:** "Wire sorter.js to use gateway injection"

---

### Step 6: Wire Up `downloader.js` to Use Gateways

**Problem:** `downloader.js`'s `downloadReceipts()` has a 12-function `deps` bag — the worst case of ad-hoc injection.

**Actions:**

1. Refactor `downloadReceipts()` to accept `{ imap, fs }` gateway objects. Replace:
   - `deps.loadManifest` / `deps.saveManifest` → `fs.readJson()` / `fs.writeJson()`
   - `deps.loadClassifications` → `fs.readJson()`
   - `deps.writeFile` → `fs.writeFile()`
   - `deps.readFileForHash` → `fs.readBuffer()`
   - `deps.ensureOutputDir` → `fs.mkdir()`
   - `deps.readOutputDir` → `fs.readdir()`
   - IMAP operations → `imap` gateway methods

2. Use the shared choreography helper from Step 3 for the account/mailbox iteration.

3. Update `test/downloader.test.js` to use mock gateway objects. The existing test structure (mock client, `makeReceipt`, `makeBaseDeps`) maps cleanly to gateway mocks.

4. Update `src/cli.js` call site.

5. **Run all tests and quality gates.**

**Commit message:** "Wire downloader.js to use gateway injection"

---

### Step 7: Make `download-receipts.js` Testable with Gateway Injection

**Problem:** `download-receipts.js` is ~640 lines with zero tests. It directly imports `fs`, `child_process`, `loadAccounts`, IMAP functions, and `process.env` with no injection seam. It has 11+ empty `catch {}` blocks.

**Actions:**

1. **Add gateway injection** to `downloadReceiptEmails()`:
   ```js
   export async function downloadReceiptEmails(opts = {}, gateways = defaultGateways) { ... }
   ```

2. **Route all I/O through gateways:**
   - `readFileSync`/`writeFileSync`/`existsSync`/`mkdirSync`/`readdirSync`/`rmSync` → `gateways.fs`
   - `execFileSync` (docling) → `gateways.subprocess`
   - `client.getMailboxLock`/`client.download`/`client.search`/`client.fetch` → `gateways.imap`
   - `loadAccounts()` → `gateways.accounts` or passed via opts
   - `process.env.OPENAI_API_KEY` / `process.env.HOME` / `process.env.TMPDIR` → `gateways.env` or passed as config

3. **Extract pure logic** from `download-receipts.js` into testable functions:
   - `loadExistingInvoiceNumbers(outputDir)` — currently reads filesystem directly; refactor to accept a `readdir`/`readFile` gateway
   - `loadExistingHashes(outputDir)` — same pattern
   - `uniqueBaseName(dir, base, usedPaths)` — currently calls `existsSync` directly; refactor to accept a gateway
   - `searchMailboxForReceipts()` — local IMAP search function; route through gateway

4. **Extract `pdfToText()`** to use `SubprocessGateway` and `FileSystemGateway` instead of direct `execFileSync`/`mkdirSync`/`readFileSync`/`rmSync` calls.

5. **Extract `createLlmBroker()`** — make it injectable so tests can provide a mock LLM broker without needing `OPENAI_API_KEY`.

6. **Address empty `catch {}` blocks:** Add at minimum a comment explaining why the error is intentionally swallowed. For the filesystem traversal functions (`loadExistingInvoiceNumbers`, `loadExistingHashes`), the empty catches are defensible (skip unreadable files) but should log at debug level or have a comment.

7. **Run quality gates.**

**Commit message:** "Add gateway injection to download-receipts.js for testability"

---

### Step 8: Add Tests for `download-receipts.js` Core Logic

**Problem:** `download-receipts.js` has zero test coverage despite being the most complex module.

**Actions:**

1. Create `test/download-receipts.test.js` with tests covering:
   - **`loadExistingInvoiceNumbers()`** — reads year/month directory tree, extracts invoice numbers from JSON sidecars
   - **`loadExistingHashes()`** — reads year/month directory tree, hashes PDF files
   - **`uniqueBaseName()`** — generates unique filenames with `_2`, `_3` suffixes
   - **`searchMailboxForReceipts()`** — searches mailbox by subject terms and sender patterns, deduplicates UIDs
   - **Metadata extraction routing** — when PDF attachments exist, uses docling output; otherwise uses email body
   - **Invoice number dedup** — skips emails whose invoice number already exists in output
   - **Content hash dedup** — skips PDFs whose SHA-256 hash matches existing files
   - **Dry run mode** — no files written, no directories created
   - **End-to-end orchestration** — mock gateways verify correct sequence of calls

2. Use mock gateways (not ad-hoc deps) for all tests.

3. **Run `bun test --coverage`** and verify `download-receipts.js` coverage is meaningful (target >60% on the core logic paths).

4. **Run all quality gates.**

**Commit message:** "Add tests for download-receipts.js core logic"

---

### Step 9: Remove Dead Gateway Code and Clean Up

**Problem:** After Steps 4–7, the old gateway files may have unused methods, and `imap-client.js` may have functions that have been absorbed into the gateway or choreography helper.

**Actions:**

1. **Audit `src/imap-client.js`:**
   - `connect()` — should only be called from `ImapGateway`. If it is, keep it as the underlying implementation.
   - `forEachAccount()` — should be absorbed into the choreography helper or gateway. If no longer imported elsewhere, remove from exports.
   - `scanForReceipts()` — if fully replaced by the shared choreography + per-mailbox callbacks, move to gateway or remove.
   - `listMailboxes()` — if moved to gateway, remove from `imap-client.js`.
   - Keep `filterScanMailboxes()` and `filterSearchMailboxes()` — they're pure functions.

2. **Clean up any remaining direct `fs` imports** in orchestrators that should go through `FileSystemGateway`.

3. **Clean up any remaining direct `child_process` imports** that should go through `SubprocessGateway`.

4. **Verify no orchestrator still uses the `deps = {}` pattern.** All should use gateway injection.

5. **Run all tests and quality gates.**

**Commit message:** "Remove dead code and clean up after gateway migration"

---

### Step 10: Extract `searchMailbox` from `cli.js`

**Problem:** `cli.js` is 769 lines. The `search` command implementation contains a full `searchMailbox()` function that handles IMAP mailbox locking, message-id dedup, and envelope fetching — logic that belongs in its own module.

**Actions:**

1. Extract the `searchMailbox()` function (and any related helpers like the search dedup logic) from `cli.js` into a new module `src/search.js`.

2. Have `search.js` accept gateways for IMAP operations (consistent with the new pattern).

3. Update `cli.js` to import from `src/search.js`.

4. Optionally add a test for the search dedup logic in `test/search.test.js`.

5. **Run all tests and quality gates.**

**Commit message:** "Extract search logic from cli.js into src/search.js"

---

### Step 11: Final Quality Gate Pass

**Actions:**

1. **Run `bun test --coverage`** — verify overall coverage is healthy and no module has dropped.
2. **Run `bunx tsc --noEmit`** — zero errors.
3. **Run `bun build src/cli.js --compile --outfile=build/mailctl`** — verify binary starts without crashing.
4. **Run `bun audit`** — no known vulnerabilities.
5. Review `AGENTS.md` and update the Project Structure section if file locations have changed (e.g., new `src/vendor-map.js`, `src/imap-orchestration.js`, `src/search.js`).
6. Update JSDoc comments on any changed public APIs.

**Commit message:** "Update docs and verify all quality gates pass"

---

### Summary of New/Changed Files

| Action | File |
|--------|------|
| **New** | `src/vendor-map.js` — single source of truth for vendor names |
| **New** | `src/imap-orchestration.js` — shared IMAP choreography helper |
| **New** | `src/search.js` — search logic extracted from cli.js |
| **New** | `test/download-receipts.test.js` — tests for the most complex module |
| **New** | `test/search.test.js` — tests for search dedup logic |
| **Modified** | `src/receipt-extraction.js` — imports from vendor-map.js |
| **Modified** | `src/downloader.js` — imports from vendor-map.js, uses gateways |
| **Modified** | `src/scanner.js` — uses gateways instead of deps bag |
| **Modified** | `src/sorter.js` — uses gateways instead of deps bag |
| **Modified** | `src/download-receipts.js` — uses gateways, testable |
| **Modified** | `src/cli.js` — search logic extracted, gateway wiring |
| **Modified** | `src/gateways/imap-gateway.js` — absorbs listMailboxes |
| **Modified** | `src/imap-client.js` — pure functions remain, I/O functions moved |
| **Modified** | `AGENTS.md` — updated project structure |

### Risk Mitigation

- **Each step is independently committable and shippable.** If any step introduces risk, it can be paused without leaving the codebase in a broken state.
- **Existing tests are the safety net.** Steps 1–6 all have existing test suites that must remain green throughout.
- **Step 8 (new tests) provides the regression safety** needed before Step 9 (cleanup) removes old code paths.
- **The `deps` bag pattern continues to work during migration** — old code paths are replaced incrementally, not all at once.