# Linux secret storage and replication

The 2026-10-02 owner policy (`operations.decision.2026-10-02.mailctl-on-ops-01`)
requires privileged TPM2-only encryption and decryption on **every** supported
systemd version. `mailctl.charter.credentials-in-platform-secret-store` also
covers macOS Newt Keychain. Linux requires systemd-creds 250+, enabled TPM2,
systemd TPM2 support and noninteractive sudo. There is no host-key-only,
host+TPM2, environment-file or plaintext fallback.

## Install on linux-x64

From the reviewed source checkout, with Bun installed:

```sh
bun install --frozen-lockfile
bun run build:linux-x64
install -m 0755 dist/mailctl-linux-x64 ~/.local/bin/mailctl
mailctl --version
mailctl secrets --help
```

Create `~/.local/bin` if needed. Put it on the operator's login-shell PATH on
both local and remote hosts. No release is published by this workflow.

Ask the host administrator to install this exact sudoers rule, substituting the
operator's login for `<username>` and checking it with `visudo`:

```sudoers
<username> ALL=(root) NOPASSWD: /usr/bin/systemd-creds
```

For Stacey on ops-01 the rule is:

```sudoers
stacey ALL=(root) NOPASSWD: /usr/bin/systemd-creds
```

Check `systemd-creds --version` and `sudo -n /usr/bin/systemd-creds has-tpm2`.
The latter must return `yes`. If TPM2 is unavailable, enable it in firmware,
make its device available to the host and install the distribution's systemd
TPM2 support. If sudo is denied, install the rule above. Mailctl fails closed.

Encryption runs `sudo -n /usr/bin/systemd-creds encrypt --with-key=tpm2
--name=<service> - -`; plaintext enters only stdin, ciphertext returns only
stdout. Mailctl verifies the TPM2-only header, then atomically writes ciphertext
at `~/.config/mailctl/credstore.encrypted/<service>.cred`. Directory permissions
are 0700; temporary and final ciphertext permissions are 0600. Decryption uses
`sudo -n /usr/bin/systemd-creds decrypt --name=<service> <ciphertext-path> -`
after checking the header. Plaintext remains in memory.

## Provision and verify on a real host

These are **operator checks outside the automated tests**. They require a real
TPM2 host and an existing email account; the test suite never invokes a real
secret system. Configure non-secret account metadata in
`~/.config/mailctl/config.json` (see `config.example.json`). Use the same service
name as the account's `keychainService`.

```sh
mailctl secrets set newt-gmail-imap             # preview; no input read
mailctl secrets set newt-gmail-imap --apply     # enter password at hidden prompt
mailctl secrets list --json                    # names/statuses only
mailctl folders --account Gmail --json         # prove read-through-mailctl authentication
mailctl secrets rm newt-gmail-imap             # preview
mailctl secrets rm newt-gmail-imap --apply
mailctl secrets list --json                    # confirm missing
```

Only remove a credential you can safely reprovision. Reprovision afterward if
it belongs to an active account. Do not print a secret to verify it. `set
--stdin --apply` accepts an exact byte stream from a trusted password manager;
it rejects terminal stdin and preserves trailing newlines. Never use a shell
literal, variable, argument or plaintext file to supply the secret. Empty
values are rejected. Interactive `set --apply` hides input and ends at Enter.
`bin/store-gmail-cred` delegates to this hidden-prompt command.

## Replicate

```sh
mailctl secrets push stacey@ops-01 --json                # preview: no SSH or secret reads
mailctl secrets push stacey@ops-01 --apply --json         # provision secrets
mailctl secrets push stacey@ops-01 --config --apply --json # also install account metadata
```

Push selects `newt-openai-api` plus each configured `keychainService` and its
`-client-id`, `-tenant-id`, `-client-secret` variants. Missing local values are
reported as `missing` and never erase remote values. List also reports stored
custom services, but push only selects expected services. For OAuth2 accounts,
provision all three suffixes. For password accounts, provision the base service.

Apply opens one SSH session with `-T`, invokes the remote `$SHELL` as a login
shell and runs `mailctl secrets import --apply --json`. Mailctl must be on that
shell's PATH. The secret stream travels only through SSH stdin. Remote secrets
are decrypted locally and re-encrypted against the destination TPM2; encrypted
files are never copied between machines.

`--config` sends only validated account metadata: prefix, name, user, host,
port, keychainService and optional SMTP host/port/secure. Unknown fields,
password fields, invalid ports and control characters are rejected before
transmission or writes. Import replaces the destination account array and
preserves its validated vendor maps. It rejects unrecognized destination
configuration fields rather than copying them. Secret and configuration
updates are per-item operations, not a transaction. Failures exit nonzero;
successful names remain provisioned. Configuration has its own outcome.

## Protocol and output

Import accepts non-terminal stdin only, with a size limit of 8 MiB. The first
JSON line is `{"protocol":"mailctl-secrets","version":1}` and may contain
`accounts`. Each subsequent line has exactly `name` and `value` string fields.
A single trailing newline is permitted; blank records, malformed JSON, unknown
versions/fields, invalid service names, empty values and duplicate names are
rejected before effects. Values are never printed. Import previews by default
and requires `--apply` to write. Do not construct a stream in an agent context
or persist it to a file.

Text and JSON output report per-name `planned`, `present`, `missing`, `stored`,
`removed` or `failed` outcomes. JSON also includes `stats.failed`, and optionally
`config: stored|failed`. Secret-bearing subprocess errors are discarded; an
SSH failure with validated partial results retains those outcomes. Unexpected
remote output is rejected without echoing it. No command displays secret values.

## Deferred user mode

TPM2-only user-mode provisioning remains deferred. systemd 256 rejects
`--user --with-key=tpm2` ([upstream source](https://github.com/systemd/systemd/blob/v256/src/creds/creds.c#L1001-L1013)).
The binding policy resolves this by always using privileged TPM2-only
operations, including on 256+. No weaker storage mode is selected. Real-host
TPM2 provisioning and login-shell integration still require the operator checks
above; injected gateway tests do not establish hardware availability.
