All six steps complete. Here's a summary of everything shipped:

---

## What was done

### New pure modules (all at 100% coverage)

| Module | Functions | Purpose |
|---|---|---|
| `src/dedup.js` | `deduplicateByMessageId` | Shared dedup logic — eliminates duplication between `cli.js` and `download-receipts.js` |
| `src/move-logic.js` | `parseUidArgs`, `groupUidsByAccount` | UID parsing/grouping for the `move` command |
| `src/read-email.js` | `buildReadResult`, `formatReadResultText` | Email read formatting (JSON and terminal modes) |
| `src/extract-attachment-logic.js` | `buildAttachmentListing`, `validateAttachmentIndex` | Attachment listing and index validation |

### Extended existing modules

- **`src/cli-helpers.js`** — added `filterAccountsByName`, eliminating the repeated inline `accounts.filter(a => a.name.toLowerCase() === ...)` pattern used in `read`, `extract-attachment`, and `move` commands.

### `cli.js` changes

- **714 → 630 lines** — all business logic moved to testable pure modules
- Removed 5 now-redundant imports (`connect`, `extractUnsubscribeLinks`, `htmlToText`, `sanitizeString`, `headerValueToString`)
- Every command handler is now thin orchestration: parse options → call pure function → write output

### Quality gate results

| Check | Result |
|---|---|
| `bun test` | **286 pass, 0 fail** (was 235 — +51 new tests) |
| `bunx tsc --noEmit` | **0 errors** |
| `bun build --compile` | **Builds in 89ms** |
| Binary smoke test | `mailctl --version` → `0.4.1` ✓ |
| New module coverage | **100% lines, 100% functions** across all 5 new/extended modules |

### Commit message suggestion

```
Extract business logic from cli.js into testable pure modules

Pull five cohesive pieces of logic out of the 714-line cli.js God Module
into dedicated, fully-tested pure modules: dedup.js (message-id dedup),
move-logic.js (UID parsing/grouping), read-email.js (email read
formatting), extract-attachment-logic.js (attachment listing/validation),
and filterAccountsByName in cli-helpers.js. Each extracted function has
100% test coverage. cli.js is reduced to thin imperative orchestration:
parse options → call core function → output result.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```