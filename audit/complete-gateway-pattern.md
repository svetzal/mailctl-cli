Now I have a thorough view of the codebase. Let me formulate my assessment.

```json
{ "severity": 3, "principle": "Functional Core, Imperative Shell", "category": "Architecture" }
```

## Assessment

This project is in surprisingly good shape for an organically grown CLI tool. There's evidence of deliberate design: pure logic has been extracted (e.g. `sort-logic.js`, `receipt-extraction.js`, `html-to-text.js`, `attachment-parts.js`), gateway classes exist in `src/gateways/`, tests cover real behavior, and the dependency-injection pattern allows testing orchestrators without real IMAP connections. That said, the codebase has one clear structural issue that dominates the others.

### Most Violated Principle: Functional Core, Imperative Shell

The project has *started* the journey toward a clean functional core / imperative shell separation — but it's stuck halfway. The gateway pattern exists (`src/gateways/imap-gateway.js`, `src/gateways/fs-gateway.js`, `src/gateways/subprocess-gateway.js`) but **none of the orchestrators actually use them**. Instead, the orchestrators (`scanner.js`, `sorter.js`, `downloader.js`, `download-receipts.js`, `cli.js`) all directly import and call:

- `ImapFlow` methods via `imap-client.js` (a function library, not a gateway)
- `fs` functions (`readFileSync`, `writeFileSync`, `existsSync`, `mkdirSync`, `readdirSync`, `rmSync`)
- `child_process.execFileSync` directly
- `process.env` directly

The gateways are dead code — they wrap IMAP calls but nothing invokes them. The actual I/O isolation is done through **ad-hoc `deps` parameter bags** instead. Look at `downloader.js`:

```js
export async function downloadReceipts(opts = {}, deps = {}) {
  const _loadAccounts        = deps.loadAccounts        ?? loadAccounts;
  const _forEachAccount      = deps.forEachAccount      ?? forEachAccount;
  const _listMailboxes       = deps.listMailboxes        ?? listMailboxes;
  const _filterScanMailboxes = deps.filterScanMailboxes  ?? filterScanMailboxes;
  const _scanForReceipts     = deps.scanForReceipts      ?? scanForReceipts;
  const _loadClassifications = deps.loadClassifications  ?? (() => { ... });
  const _loadManifest        = deps.loadManifest         ?? loadManifest;
  const _saveManifest        = deps.saveManifest         ?? saveManifest;
  const _readOutputDir       = deps.readOutputDir        ?? null;
  const _ensureDir           = deps.ensureOutputDir      ?? ((dir) => mkdirSync(dir, ...));
  const _writeFile           = deps.writeFile            ?? ((path, data) => writeFileSync(...));
  const _readFileForHash     = deps.readFileForHash      ?? ((path) => readFileSync(path));
  // ...
```

This pattern is **duplicated** across `scanner.js`, `sorter.js`, and `downloader.js` — each with their own ad-hoc 5-12 injectable functions. And `download-receipts.js` (the newer, more complex module) doesn't use this pattern at all — it directly imports and calls I/O functions with no injection seam, making it **untestable** without hitting real IMAP servers and filesystems.

### The Consequence

1. **`download-receipts.js` has zero tests** despite being the most complex module (~640 lines) with LLM integration, PDF conversion, filesystem traversal, and IMAP operations all interleaved.

2. **Knowledge duplication**: the same "IMAP connect → list mailboxes → filter → scan → process per-mailbox with lock" choreography is repeated in `scanner.js`, `sorter.js`, `downloader.js`, and `download-receipts.js`.

3. **Vendor name maps are duplicated**: `VENDOR_NAMES` in `downloader.js` and `VENDOR_DOMAINS` in `receipt-extraction.js` are *almost* the same map with slightly different formatting (spaces vs hyphens). They can diverge silently.

### How to Correct It

**Step 1: Consolidate the vendor maps.** Merge `VENDOR_NAMES` (downloader.js) and `VENDOR_DOMAINS` (receipt-extraction.js) into a single source of truth. Derive display-name vs filename-safe formats from one map.

**Step 2: Wire up the existing gateways** (or remove them and design proper ones). Create a single `ImapGateway` and `FsGateway` that the orchestrators accept via constructor or parameter injection — not ad-hoc `deps` bags with 12 optional functions. This eliminates the boilerplate preamble in each orchestrator.

**Step 3: Extract the shared IMAP choreography** — the "for each account, connect, list, filter, scan, group by mailbox, lock/unlock" pattern — into a reusable helper that all orchestrators can compose with.

**Step 4: Make `download-receipts.js` testable** by using the same gateway injection pattern, then add tests for its core logic (metadata extraction routing, dedup, filename generation).

### Other Observations (Lower Severity)

- **Good**: Pure logic extraction (`sort-logic.js`, `receipt-extraction.js`) is well done with thorough tests
- **Good**: Tests use `bun:test`, behavior-focused, one assertion per test
- **Good**: Error handling is consistent (`withErrorHandling` wrapper, `--json` mode)
- **Minor**: `cli.js` at 769 lines is getting large; the `searchMailbox` function embedded in it should live in a separate module
- **Minor**: Some empty `catch {}` blocks silently swallow errors (especially in `download-receipts.js` with 7+ bare catch blocks)

The project shows good instincts — the separation has already begun. The main work is completing the migration so the gateway pattern is used consistently rather than existing as dead code alongside ad-hoc dependency injection.