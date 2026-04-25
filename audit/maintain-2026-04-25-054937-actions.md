All five quality gates pass. Here's a summary of what was done:

---

## Dependency Update Summary

**Packages audited:** 5 runtime + 3 dev = 8 total

| Package | Was | Now | Note |
|---|---|---|---|
| `nodemailer` | 8.0.5 (pinned) | **8.0.6** | Bug fix: restores correct base64 wrap trim behaviour to prevent trailing CRLF |
| `commander` | ^14.0.3 | — | Already at latest (14.0.3) |
| `imapflow` | ^1.3.2 | — | Already at latest (1.3.2) |
| `mailparser` | ^3.9.8 | — | Already at latest (3.9.8) |
| `mojentic` | ^1.2.4 | — | Already at latest (1.2.4) |
| `@biomejs/biome` | ^2.4.13 | — | Already at latest |
| `@types/bun` | ^1.3.13 | — | Already at latest |
| `@types/node` | ^25.6.0 | — | Already at latest |

**Quality gates:** ✅ typecheck · ✅ lint · ✅ test (1539 pass) · ✅ build · ✅ audit