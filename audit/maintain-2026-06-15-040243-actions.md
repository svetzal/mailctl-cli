All dependencies are up to date. Here's the summary:

**Updated:**
- `nodemailer` `8.0.11` → `9.0.0` (major bump, but the only breaking change — TLS certificate validation now on by default for HTTPS requests — doesn't apply here since `SmtpGateway` connects to real SMTP servers with valid certs)

**Already current:** `commander`, `imapflow`, `mailparser`, `mojentic`, `@biomejs/biome`, `@types/bun`, `@types/node`

All 5 quality gates passed ✅ (typecheck, lint, 2058 tests, build, audit).