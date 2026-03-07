```json
{ "severity": 4, "principle": "Functional Core, Imperative Shell", "category": "Architecture" }
```

## Assessment: `cli.js` is a 714-line God Module Mixing Shell and Core Logic

### The Violation

The project's most significant violation is the **Functional Core, Imperative Shell** principle — specifically, the `cli.js` file at **714 lines** is a monolithic imperative shell that contains untested business logic interleaved with I/O, presentation, and orchestration.

Look at the `read`, `search`, `move`, and `extract-attachment` command handlers. Each one:

1. **Performs direct I/O** — `writeFileSync`, `readFileSync`, `mkdirSync`, `simpleParser()` — all inline
2. **Contains business logic** — UID parsing with account prefixes (`move`), deduplication by message-id (`search`), attachment indexing (`extract-attachment`)
3. **Formats output** — both JSON and human-readable paths, interleaved with the logic
4. **Is completely untested** — there are 0 test files for `cli.js`, and the coverage report doesn't even list it (it's the entry point, never imported by tests)

The project has *already demonstrated* it knows how to do this correctly. The `scanner.js`, `sorter.js`, `downloader.js`, and `search.js` modules all extract testable logic out of the CLI. The `sort-logic.js` and `imap-orchestration.js` modules are beautiful examples of pure functional cores — no I/O, 100% coverage. Even the gateway pattern is well-applied with `FileSystemGateway` and `SubprocessGateway`.

**But `cli.js` is where the pattern breaks down.** Specifically:

- **`move` command** (lines 574–712): 138 lines of UID parsing, account grouping, folder validation, lock management, and move execution — all inline in the action handler. The UID parsing logic (`account:uid` prefix handling, comma splitting) is pure logic that should be extracted and tested.
- **`read` command** (lines 334–429): 95 lines mixing IMAP download, MIME parsing, body truncation, header extraction, unsubscribe link extraction, and dual-format output.
- **`extract-attachment` command** (lines 461–571): 110 lines of BODYSTRUCTURE fetching, attachment listing, binary download, and file writing.
- **`search` command** (lines 270–332): Deduplication logic by message-id is duplicated here AND in `download-receipts.js` (lines 462–469) — the same `mid:${messageId}` pattern appears in both places.

### Evidence of Impact

| Area | Observation |
|------|------------|
| **Testability** | `move`, `read`, `extract-attachment` have **zero tests**. The search dedup in `cli.js` is untested. |
| **Knowledge Duplication** | Message-id deduplication pattern (`mid:${messageId}`) appears in both `cli.js:312-315` and `download-receipts.js:465`. |
| **Function length** | Multiple command handlers exceed 100 lines — well past the 15-20 line guideline. |
| **Coverage gap** | `imap-client.js` is at 12% line coverage because `connect()`, `scanForReceipts()`, and `forEachAccount()` mix I/O with logic and can only be tested via integration. |

### How to Correct It

The fix follows the same pattern the project already uses successfully in `scanner.js`/`sorter.js`/`search.js`:

1. **Extract pure logic from `move` command** → new `src/move-logic.js`:
   - `parseUidArgs(uids, defaultAccount)` — parse and validate UID arguments with account prefixes
   - `groupByAccount(parsed)` — group UIDs by account name
   - Both are pure functions, trivially testable

2. **Extract `read` email processing** → new `src/read-email.js`:
   - `formatEmailResult(parsed, opts)` — build the structured result object
   - Separates MIME parsing concerns from IMAP download

3. **Extract message-id deduplication** → shared utility:
   - `deduplicateByMessageId(results)` — used by both `search` and `download-receipts`
   - Eliminates the knowledge duplication

4. **Slim `cli.js` to pure shell**: After extraction, each command handler should be ~15-25 lines: parse options → call extracted function → format output. No business logic remains in the shell.

5. **Wrap `imap-client.js` connection logic** in the existing `ImapGateway` (which exists at `src/gateways/imap-gateway.js` but isn't used by the main code paths), making `connect()` and `forEachAccount()` mockable without integration tests.

This would bring `cli.js` from 714 lines to roughly 300-350 lines of pure orchestration, with all business logic testable in isolation. The project's own `sort-logic.js` (46 lines, 100% coverage) is the blueprint.