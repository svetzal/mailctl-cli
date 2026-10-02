# Delivered trunk verification evidence

Verified source commit: `4d4eb3d6518a11e5af4759990ae644127d6bee85`. This isolated writable worktree records evidence only; application source, tests, dependencies, and delivered behavior are unchanged. No commit, release, or real credential-system operation was performed.

Run started: 2026-10-02T10:43:52.778432+00:00. Runtime: Bun 1.4.2 (744846f84), linux-x64. Temporary storage: `.foundry/tmp`; dependency cache: `.foundry/tmp/bun-cache`. Installed existing dependencies using `bun install --frozen-lockfile`; the tracked lockfile and manifest did not change.

The direct acceptance probe ran before the full suite: `bun test test/secret-policy.test.js`, exit 0. It exercises the production LinuxSecretStore with injected I/O gateways and verifies privileged TPM2-only decryption on systemd 256. [Proof](../.foundry/proof.json) and [complete probe log](../.foundry/logs/corrected.log).

All verbose commands were run through `foundry capture`. The verified commands below were prefixed inside capture with `env TMPDIR=<worktree>/.foundry/tmp BUN_INSTALL_CACHE_DIR=<worktree>/.foundry/tmp/bun-cache` so the capture process received writable locations. [Machine-readable evidence](../.foundry/verification.json) records timestamps, commands, exit codes, and full stream logs.

| Command | Exit | Complete stdout | Complete stderr |
| --- | ---: | --- | --- |
| `bun test --coverage` | 0 | [stdout](../.foundry/logs/verified-coverage/3-1790937832781532748.stdout.log) | [stderr](../.foundry/logs/verified-coverage/3-1790937832781532748.stderr.log) |
| `bunx tsc --noEmit` | 0 | [stdout](../.foundry/logs/verified-typecheck/46-1790937835244334490.stdout.log) | [stderr](../.foundry/logs/verified-typecheck/46-1790937835244334490.stderr.log) |
| `bunx biome check src/ test/` | 0 | [stdout](../.foundry/logs/verified-lint/81-1790937835879618265.stdout.log) | [stderr](../.foundry/logs/verified-lint/81-1790937835879618265.stderr.log) |
| `bun test` | 0 | [stdout](../.foundry/logs/verified-test/111-1790937836145910874.stdout.log) | [stderr](../.foundry/logs/verified-test/111-1790937836145910874.stderr.log) |
| `bun build src/cli.js --compile --outfile=build/mailctl` | 0 | [stdout](../.foundry/logs/verified-build/154-1790937837916881464.stdout.log) | [stderr](../.foundry/logs/verified-build/154-1790937837916881464.stderr.log) |
| `bun audit` | 0 | [stdout](../.foundry/logs/verified-audit/173-1790937838228661128.stdout.log) | [stderr](../.foundry/logs/verified-audit/173-1790937838228661128.stderr.log) |
| `build/mailctl --version` | 0 | [stdout](../.foundry/logs/verified-version/187-1790937838457276226.stdout.log) | [stderr](../.foundry/logs/verified-version/187-1790937838457276226.stderr.log) |
| `build/mailctl secrets --help` | 0 | [stdout](../.foundry/logs/verified-secrets-help/209-1790937838743456411.stdout.log) | [stderr](../.foundry/logs/verified-secrets-help/209-1790937838743456411.stderr.log) |

Full unfiltered `bun test --coverage` summary:

```text
2477 pass
 0 fail
 2636 expect() calls
Ran 2477 tests across 118 files. [2.43s]
```

Aggregate coverage: **90.53% functions, 96.92% lines** (the reporter’s “All files” row, including any non-source rows it reports). No configured coverage threshold was found in package.json, repository/CI instructions, or Bun configuration; repository and user Bun configuration files are absent. These are measured results, with no invented threshold or claim that every module is fully covered.

Campaign-module coverage, copied from the same unfiltered report:

| Module | Functions % | Lines % |
| --- | ---: | ---: |
| `src/secret-store.js` | 95.24 | 100.00 |
| `src/secret-diagnostics.js` | 100.00 | 100.00 |
| `src/secrets-protocol.js` | 100.00 | 100.00 |
| `src/commands/secrets-command.js` | 100.00 | 98.44 |
| `src/cli/secrets-cli.js` | 100.00 | 100.00 |
| `src/accounts.js` | 100.00 | 100.00 |
| `src/keychain.js` | 100.00 | 100.00 |
| `src/config.js` | 18.18 | 58.70 |
| `src/gateways/credential-filesystem-gateway.js` | 0.00 | 57.89 |
| `src/gateways/keychain-gateway.js` | 100.00 | 100.00 |
| `src/gateways/secret-config-gateway.js` | 33.33 | 45.45 |
| `src/gateways/secret-input-gateway.js` | 0.00 | 10.20 |
| `src/gateways/subprocess-gateway.js` | 50.00 | 100.00 |

“Not reported” means Bun emitted no row for that module; no metric is inferred. No tests were excluded, assertions weakened, or coverage suppressions added. Repository instructions document Bun coverage artifacts; no fixtures or tests were expanded to alter these results.

The separate `bun test` run also passed 2,477 tests with zero failures. Typecheck produced zero errors; Biome checked 241 files with no fixes or warnings. Audit found no vulnerabilities in 84 packages. The compiled binary returned `1.3.0` for `--version` and displayed list/set/rm/push/import help successfully.

Initial attempts are retained separately in [initial results](../.foundry/initial-results.json) with complete logs. Coverage/test/build initially failed because dependencies were unavailable; bunx also failed with `EROFS` when capture did not receive the writable temporary path. Binary probes could not start before the failed build. Those runs are failed evidence, not passing verification. The successful rerun above followed frozen-lockfile installation and explicit writable environment settings; no substantive application defect was found.

Reviewed `docs/linux-secret-store.md` against the credential policy and CLI help. Its examples remain aligned. Hardware availability, real-host TPM2 provisioning, and SSH login-shell integration remain operator checks; these automated results do not establish them.
