```json
{ "severity": 3, "principle": "Functional Core, Imperative Shell", "category": "Architecture" }
```

## Assessment: Functional Core / Imperative Shell Violation in Legacy Modules

### Overall Impression

This project is genuinely well-engineered. 627 tests pass, `tsc --noEmit` is clean, 91% line coverage overall, and the recent commit history shows systematic, disciplined refactoring. The gateway pattern, command orchestrator extraction, and pure logic modules demonstrate strong architectural awareness. The violations I'm flagging are concentrated in a few **older modules that predate the refactoring wave** — they're not symptoms of negligence, but of a codebase mid-migration.

### The Violation

Three legacy modules — `downloader.js` (316 lines), `sorter.js` (160 lines), and `imap-client.js` (208 lines) — violate the Functional Core / Imperative Shell boundary. Together with `download-receipts.js` (934 lines, 42 console calls), they represent ~1,600 lines of mixed I/O and business logic that resist unit testing.

**Specific symptoms:**

**1. Direct `fs` imports bypassing the established gateway:**
```
src/sorter.js      → import { readFileSync, existsSync } from "fs"
src/downloader.js  → import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs"
src/config.js      → import { readFileSync } from "fs"
src/m365-auth.js   → import { readFileSync, writeFileSync, mkdirSync } from "fs"
```
Meanwhile, `FileSystemGateway` exists at `src/gateways/fs-gateway.js` and newer modules (`scan-command.js`, `classify-command.js`, `scan-data.js`) properly inject it. Two dependency injection styles coexist in the same codebase.

**2. Console output embedded in business logic:**

`imap-client.js::scanForReceipts()` has 6 `console.error` calls interleaved with UID deduplication and envelope parsing. `sorter.js::sortReceipts()` has 11. `downloader.js::downloadReceipts()` has 8. These side effects make it impossible to test the pure logic independently.

**3. Pure functions trapped inside I/O modules:**

`imap-client.js` exports both pure functions (`filterScanMailboxes`, `filterSearchMailboxes`) and I/O functions (`connect`, `forEachAccount`, `scanForReceipts`). The pure functions are testable, but they live in a module with **19.18% line coverage** because the I/O functions around them drag the number down. The coverage report tells the story:

| Module | % Lines | Root Cause |
|---|---|---|
| `imap-client.js` | **19.18%** | Pure logic entangled with IMAP I/O |
| `init.js` | **23.00%** | Direct fs operations, no gateway injection |
| `config.js` | **69.77%** | Direct fs import, no gateway injection |
| `downloader.js` | **90.24%** | Has test coverage but uses old gateway spread pattern |
| `sorter.js` | **87.27%** | Same old pattern, duplicated I/O |

**4. Knowledge duplication (secondary violation):**

`loadClassifications()` is implemented identically in both `sorter.js` (line 42) and `downloader.js` (line 116) — same path, same error message, same logic. Meanwhile, `scan-data.js::loadClassificationsData()` already does this through the gateway. This is the same decision expressed in three places.

### How to Correct It

The project is already on the right trajectory — the recent extraction of 13 command orchestrators proves the pattern works. The fix is to apply the **same refactoring pass** to the remaining legacy modules:

**Phase 1: Extract pure logic from `imap-client.js`**
- Move `filterScanMailboxes()` and `filterSearchMailboxes()` to a pure `mailbox-filters.js` module (they have zero I/O dependencies)
- Extract the UID dedup and envelope-result-building logic from `scanForReceipts()` into pure functions
- Leave `connect()`, `forEachAccount()`, `listMailboxes()` as the thin I/O shell

**Phase 2: Refactor `sorter.js` and `downloader.js` to the orchestrator pattern**
- Replace direct `fs` imports with `FileSystemGateway` injection (matching `scan-command.js` style)
- Eliminate the duplicated `loadClassifications()` — use `scan-data.js::loadClassificationsData()` through the gateway
- Push `console.error` progress reporting to the CLI shell boundary (callback or event pattern)
- Extract the `sortReceipts` pure planning logic from the IMAP move execution

**Phase 3: Address `download-receipts.js` (the 934-line module)**
- This is the biggest module in the project. It combines LLM schema definitions, system prompts, PDF conversion, metadata extraction, and orchestration in a single file
- Extract the LLM receipt schema and prompt into their own module
- Separate the "decide what to do" (pure) from "execute the download" (I/O)

### Why Severity 3 (Moderate), Not Higher

- The violations are **concentrated**, not pervasive — newer code follows the pattern correctly
- The project is **actively migrating** (13 orchestrators already extracted)
- All 627 tests pass, `tsc` is clean, overall coverage is 91%
- The affected modules have functional test coverage through the `defaultGateways` spread pattern — it's not untested, just harder to test purely
- This is a single-user CLI tool, not a multi-tenant service — the blast radius is contained

The project demonstrates engineering maturity. The principle is understood and applied to new code. What remains is finishing the migration of the older modules to the same standard.