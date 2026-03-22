Now I have a comprehensive understanding of the codebase. Here is the complete plan:

---

## Plan: Address Functional Core / Imperative Shell Violations in Legacy Modules

### Overview

This plan follows the project's established refactoring trajectory — applying the same gateway injection and pure-logic extraction patterns already used in the 13 command orchestrators to the remaining legacy modules. The work is organized into 7 steps, each independently shippable and testable.

---

### Step 1: Extract pure mailbox filter functions from `imap-client.js` into `src/mailbox-filters.js`

**What:** Move `filterScanMailboxes()` and `filterSearchMailboxes()` (plus their `EXCLUDED_SPECIAL_USE` and `SEARCH_EXCLUDED_SPECIAL_USE` constants) out of `imap-client.js` into a new pure module `src/mailbox-filters.js`.

**Why:** These are pure functions with zero I/O dependencies — they take an array of mailbox objects and return filtered path arrays. They belong in a standalone module, not entangled with IMAP connection code. This improves `imap-client.js` coverage metrics and makes the filter logic independently testable.

**Specific changes:**

1. Create `src/mailbox-filters.js` containing:
   - `EXCLUDED_SPECIAL_USE` constant (currently line 133 of `imap-client.js`)
   - `SEARCH_EXCLUDED_SPECIAL_USE` constant (currently line 136 of `imap-client.js`)
   - `filterScanMailboxes(mailboxes, opts)` (currently lines 147–161)
   - `filterSearchMailboxes(mailboxes, opts)` (currently lines 172–185)
   - Full JSDoc preserved

2. Update `imap-client.js` to:
   - Remove the four moved items
   - Re-export both filter functions from `./mailbox-filters.js` for backward compatibility:
     ```js
     export { filterScanMailboxes, filterSearchMailboxes } from "./mailbox-filters.js";
     ```

3. Create `test/mailbox-filters.test.js` with tests covering:
   - Excludes Junk/Trash/Drafts by specialUse
   - Excludes Apple internal folders (paths starting with `_`)
   - Excludes Notes
   - `excludePaths` option works
   - `excludeSent` option works for scan filter
   - Search filter is less restrictive (includes Trash, Sent)
   - Empty input returns empty output

4. Verify existing tests still pass — the re-exports ensure no downstream breakage.

**Quality gate:** `bun test`, `bunx tsc --noEmit`, `bun build src/cli.js --compile --outfile=build/mailctl`

---

### Step 2: Extract pure scan result building from `imap-client.js::scanForReceipts()`

**What:** Extract the UID deduplication logic and envelope-to-result mapping from `scanForReceipts()` into pure functions in a new module or in the existing `mailbox-filters.js` (or a more aptly named `scan-helpers.js`).

**Why:** `scanForReceipts()` currently mixes IMAP I/O (mailbox locks, search, fetch) with pure data transformation (UID dedup via Set, envelope field extraction). Separating these makes the pure logic testable without mocking IMAP.

**Specific changes:**

1. Create `src/scan-helpers.js` (or add to `mailbox-filters.js` if scope is small) containing:
   - `deduplicateUids(uidArrays)` — takes multiple UID arrays, returns a single deduplicated Set
   - `buildScanResult(accountName, mailbox, msg)` — takes a raw IMAP message envelope and returns the `{ account, from, address, name, subject, date, mailbox, uid }` result object

2. Refactor `scanForReceipts()` in `imap-client.js` to call these pure functions for the data transformation parts, keeping only the IMAP lock/search/fetch I/O inline.

3. Remove the `console.error` calls from `scanForReceipts()` — move progress reporting to the callers (scanner.js already has its own progress output). If callers need per-mailbox progress, accept an optional `onProgress` callback parameter rather than hardcoding console output.

4. Create `test/scan-helpers.test.js` with tests for the extracted pure functions.

5. Verify existing tests still pass.

**Quality gate:** `bun test`, `bunx tsc --noEmit`, `bun build src/cli.js --compile --outfile=build/mailctl`

---

### Step 3: Eliminate duplicated `loadClassifications()` — consolidate on `scan-data.js`

**What:** Remove the duplicated `loadClassifications()` implementations from `sorter.js` (line 42) and `downloader.js` (line 116), and have both modules use `loadClassificationsData()` from `scan-data.js` instead.

**Why:** The same decision — "how to load classifications from disk" — is currently expressed in three places: `sorter.js`, `downloader.js`, and `scan-data.js`. The `scan-data.js` version is the canonical one, using `FileSystemGateway` injection. This is a textbook knowledge duplication violation.

**Specific changes:**

1. In `sorter.js`:
   - Remove `import { readFileSync, existsSync } from "fs"` (line 8)
   - Remove `import { fileURLToPath } from "url"` (line 10)
   - Remove `const __dirname = ...` and `const DATA_DIR = ...` (lines 14–15)
   - Remove the local `loadClassifications()` function (lines 42–48)
   - Add import: `import { loadClassificationsData } from "./scan-data.js"`
   - Add import: `import { FileSystemGateway } from "./gateways/fs-gateway.js"`
   - In `defaultGateways`, replace `loadClassifications` with a function that calls `loadClassificationsData(DATA_DIR, new FileSystemGateway())` — or better, accept `dataDir` and `fsGateway` as parameters and wire them in `sortReceipts()`
   - The gateway should throw if classifications.json doesn't exist (preserving existing behavior). Since `loadClassificationsData()` returns `{}` for missing files, wrap it: check if empty and throw.

2. In `downloader.js`:
   - Same pattern: remove the inline `loadClassifications()` at lines 116–122
   - Remove `readFileSync` and `existsSync` from the `fs` import (line 9) — only keep what's still needed for `loadManifest()` / `saveManifest()` (addressed in Step 4)
   - Use `loadClassificationsData()` from `scan-data.js`

3. Ensure the error message "No classifications.json found. Run scan + classify first." is preserved in the wrapping logic.

4. Update tests in `test/sorter.test.js` and `test/downloader.test.js` — the `loadClassifications` gateway mock stays the same shape, so minimal test changes are needed.

**Quality gate:** `bun test`, `bunx tsc --noEmit`, `bun build src/cli.js --compile --outfile=build/mailctl`

---

### Step 4: Refactor `downloader.js` to use `FileSystemGateway` consistently

**What:** Replace all direct `fs` imports in `downloader.js` with `FileSystemGateway` injection, matching the pattern used by `scan-data.js` and `download-receipts.js`.

**Why:** `downloader.js` currently imports `readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync` directly from `"fs"` (line 9) while also having a `defaultGateways` spread pattern with ad-hoc file operation lambdas (`readOutputDir`, `ensureOutputDir`, `writeFile`, `readFileForHash`). The newer `download-receipts.js` already uses a proper `FileSystemGateway` instance. Unifying on the gateway eliminates the split personality.

**Specific changes:**

1. Remove `import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs"` (line 9)

2. Replace the ad-hoc gateway entries in `defaultGateways`:
   ```js
   // BEFORE (5 separate ad-hoc lambdas)
   readOutputDir: null,
   ensureOutputDir: (dir) => mkdirSync(dir, { recursive: true }),
   writeFile: (path, data) => writeFileSync(path, data),
   readFileForHash: (path) => readFileSync(path),
   
   // AFTER (single gateway instance)
   fs: new FileSystemGateway(),
   ```

3. Update `downloadReceipts()` to use `fs.readdir()`, `fs.mkdir()`, `fs.writeFile()`, `fs.readBuffer()`, `fs.exists()`, etc.

4. Similarly refactor `loadManifest()` and `saveManifest()` to accept an `fs` gateway parameter (or fold them into the gateway pattern).

5. Update `test/downloader.test.js` — replace the ad-hoc mock lambdas with a mock `FileSystemGateway` object:
   ```js
   const mockFs = {
     readdir: mock(() => []),
     mkdir: mock(() => {}),
     writeFile: mock(() => {}),
     readBuffer: mock(() => Buffer.from("")),
     exists: mock(() => false),
     readJson: mock(() => ({})),
     writeJson: mock(() => {}),
   };
   ```

6. Remove `import { dirname } from "path"` and `import { fileURLToPath } from "url"` if no longer needed after `DATA_DIR` is parameterized.

**Quality gate:** `bun test`, `bunx tsc --noEmit`, `bun build src/cli.js --compile --outfile=build/mailctl`

---

### Step 5: Refactor `sorter.js` to push console output to the shell boundary

**What:** Remove the 11 `console.error` calls from `sortReceipts()` and `ensureFolders()`, and instead return structured data that the CLI shell can format and display.

**Why:** Console output embedded in business logic makes functions impure and impossible to test without capturing stderr. The orchestrator pattern already used by `scan-command.js` returns structured results and lets `cli.js` handle display.

**Specific changes:**

1. Modify `sortReceipts()` to accept an optional `onProgress` callback (or simply accumulate log events in an array returned alongside `stats`):
   ```js
   // Option A: callback
   export async function sortReceipts(opts = {}, gateways = {}, onProgress = () => {}) {
     // ...
     onProgress({ type: "folder-exists", folder });
     // ...
   }
   
   // Option B: return log entries with stats (simpler, preferred)
   return { stats, log: [...logEntries] };
   ```

2. Move all `console.error` calls to `cli.js` — the `.action()` handler for `sort` calls `sortReceipts()` and then iterates the returned log/stats to produce human-readable output.

3. Refactor `ensureFolders()`:
   - Currently logs "✅ Folder exists" and "📁 Created folder" via console.error
   - Instead, return a result array: `[{ folder, action: "exists" | "created" | "failed" }]`
   - Caller (`sortReceipts`) collects these results

4. Update `test/sorter.test.js` — tests no longer need to worry about console output side effects. Can now assert on returned log entries if using Option B.

5. Update `cli.js` sort handler — add display logic for the structured output.

**Quality gate:** `bun test`, `bunx tsc --noEmit`, `bun build src/cli.js --compile --outfile=build/mailctl`

---

### Step 6: Refactor `config.js` and `m365-auth.js` to use `FileSystemGateway`

**What:** Replace direct `fs` imports in `config.js` and `m365-auth.js` with `FileSystemGateway` injection.

**Why:** These are the last two source modules that bypass the established gateway. `config.js` is widely used (imported by 6+ modules), so the change needs care. `m365-auth.js` does both file I/O (token caching) and network I/O (OAuth2 token refresh) — both should go through gateways.

**Specific changes for `config.js`:**

1. Replace `import { readFileSync } from "fs"` with gateway injection:
   ```js
   import { FileSystemGateway } from "./gateways/fs-gateway.js";
   
   const _defaultFs = new FileSystemGateway();
   
   export function loadConfig(fs = _defaultFs) {
     // ...uses fs.readText() or fs.readJson() instead of readFileSync
   }
   ```

2. Because `loadConfig()` uses module-level caching (`cachedConfig`), the gateway parameter only affects the first call. This is acceptable — `resetConfigCache()` already exists for testing.

3. Alternatively, the simpler approach: since `config.js` is a thin config loader that's integration-tested by nature, and the `resetConfigCache()` + test fixture pattern already works, this may be lower priority. **Assess whether the current 69.77% coverage is acceptable given the module's simplicity.**

**Specific changes for `m365-auth.js`:**

1. Extract `loadTokens()` and `saveTokens()` to use `FileSystemGateway`:
   ```js
   function loadTokens(fs = _defaultFs) {
     try { return fs.readJson(TOKEN_PATH); }
     catch { return null; }
   }
   
   function saveTokens(tokens, fs = _defaultFs) {
     fs.mkdir(join(homedir(), ".newt"));
     fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
   }
   ```

2. The `console.error` call in `refreshAccessToken()` (line 49) should be removed or turned into a thrown error — callers should handle the display.

3. The `console.error` calls in `deviceCodeFlow()` (lines 87–89, 129) are user-facing interactive prompts that must stay, but should be injected via an `output` callback so tests can verify the flow without capturing stderr.

4. Create `test/m365-auth.test.js` if it doesn't exist — test `loadTokens()`, `saveTokens()`, and the token-validity-check logic in `getM365AccessToken()` as pure decision functions.

**Quality gate:** `bun test`, `bunx tsc --noEmit`, `bun build src/cli.js --compile --outfile=build/mailctl`

---

### Step 7: Extract LLM schema and prompt from `download-receipts.js` into dedicated modules

**What:** Move `RECEIPT_EXTRACTION_SCHEMA` (lines 32–77) and `LLM_SYSTEM_PROMPT` (lines 79–98) out of `download-receipts.js` into a new `src/receipt-llm-schema.js` module. Also move `extractMetadataWithLLM()` into this module.

**Why:** `download-receipts.js` is 934 lines — the largest module in the project. The LLM schema, system prompt, and extraction function are self-contained pure logic (no I/O dependencies) that can be tested independently. Extracting them reduces the module to ~750 lines and makes the schema/prompt independently versionable and testable.

**Specific changes:**

1. Create `src/receipt-llm-schema.js` containing:
   - `RECEIPT_EXTRACTION_SCHEMA` (the JSON schema object)
   - `LLM_SYSTEM_PROMPT` (the system prompt string)
   - `extractMetadataWithLLM(broker, bodyText, subject, fromAddress, fromName, emailDate)` — the LLM call orchestration function (currently lines 127–178)

2. Update `download-receipts.js`:
   - Import from `./receipt-llm-schema.js`
   - Remove the moved code
   - Keep `re-exports` if needed for backward compatibility (check if anything imports the schema directly)

3. Create `test/receipt-llm-schema.test.js`:
   - Test that `RECEIPT_EXTRACTION_SCHEMA` has all required fields
   - Test `extractMetadataWithLLM()` with a mock broker — verify it correctly transforms LLM output into the metadata structure
   - Test tax calculation logic (when tax_amount present)
   - Test vendor name cleaning (removal of Inc/LLC/etc.)
   - Test date fallback to email envelope date

4. Also consider extracting `searchMailboxForReceipts()` (lines 220–283) from `download-receipts.js` — it's very similar to `scanForReceipts()` in `imap-client.js` and contains its own console.error calls. This could go into a shared helper, or the two functions could be unified (they do slightly different things — the download version also fetches message-id headers and searches by sender patterns). If unification is too risky, at minimum extract its console.error calls.

5. Remove `console.error` calls from `searchMailboxForReceipts()` (lines 229, 254, 276) — use the same `onProgress` callback or structured return pattern.

**Quality gate:** `bun test`, `bunx tsc --noEmit`, `bun build src/cli.js --compile --outfile=build/mailctl`

---

### Execution Order & Dependencies

```
Step 1 (mailbox filters extraction)     — independent, safe to start
Step 2 (scan helpers extraction)        — depends on Step 1 (uses new module structure)
Step 3 (loadClassifications dedup)      — independent, safe to start in parallel with Step 1
Step 4 (downloader gateway refactor)    — depends on Step 3
Step 5 (sorter console output removal)  — depends on Step 3
Step 6 (config/m365-auth gateway)       — independent, safe to start in parallel
Step 7 (LLM schema extraction)         — independent, safe to start in parallel
```

Steps 1, 3, 6, and 7 can be done in parallel. Steps 2, 4, and 5 have sequential dependencies.

### Expected Outcomes

After all steps:
- **Zero direct `fs` imports** in non-gateway source modules
- **Zero `console.error` calls** in pure logic and orchestrator modules (all moved to CLI shell boundary)
- **No duplicated `loadClassifications()`** — single source of truth in `scan-data.js`
- **`imap-client.js` coverage** should jump from 19% to 60%+ as pure functions are separately tested
- **`download-receipts.js`** drops from 934 to ~750 lines
- **All 627+ tests** continue to pass
- **`tsc --noEmit`** remains clean
- **Build** compiles without errors

### Risk Mitigation

- Each step is independently shippable — if any step causes issues, prior steps remain valid
- Re-exports preserve backward compatibility during transition
- Existing test patterns (mock gateway spread) continue to work
- The `bin/run` wrapper and CLI entry point (`cli.js`) are not modified until Step 5 (and only to add display logic)