import { describe, expect, it } from "bun:test";
import { loadAccounts } from "../src/accounts.js";
import { buildProgram, createDefaultDeps } from "../src/cli.js";

// Existing vendor tests replace the config module namespace; use a fresh real boundary.
const { getConfigAccounts, loadConfig, resetConfigCache } = await import(
  `../src/config.js?secret-store-integration=${Date.now()}`
);

import { createSecretStore } from "../src/secret-store.js";

import { CIPHERTEXT, CONFIG, DIRECTORY, fixture, SECRET, SERVICE } from "./secret-store-fixture.js";

// Inspect every argument, environment option, filesystem payload and captured
// console call. Only explicitly designated pipe inputs may carry a secret.
function exposureReport(fixture, logging = []) {
  return JSON.stringify({
    calls: fixture.calls.map(({ command, args, options }) => ({
      command,
      args,
      options: { ...options, input: undefined },
    })),
    io: fixture.io,
    logging,
  });
}

for (const version of [250, 255, 256, 257, 259]) {
  describe(`Linux systemd ${version}`, () => {
    it("round-trips exact names and secrets using only TPM2 stdin and secured ciphertext", () => {
      const f = fixture({ version });
      f.store.writeSecret(SERVICE, SECRET);
      const value = f.store.readSecret(SERVICE);
      const names = f.store.listNames();
      f.store.deleteSecret(SERVICE);
      const prefix = ["-n", "/usr/bin/systemd-creds"];
      expect({
        value,
        names,
        missing: f.store.readSecret(SERVICE),
        calls: f.calls.map(({ command, args, options }) => ({ command, args, input: options.input })),
        io: f.io,
        disclosed: exposureReport(f).includes("CREDENTIAL_SENTINEL"),
      }).toEqual({
        value: SECRET,
        names: [SERVICE],
        missing: null,
        calls: [
          { command: "/usr/bin/systemd-creds", args: ["--version"], input: undefined },
          {
            command: "/usr/bin/sudo",
            args: [...prefix, "has-tpm2"],
            input: undefined,
          },
          {
            command: "/usr/bin/sudo",
            args: [...prefix, "encrypt", "--with-key=tpm2", `--name=${SERVICE}`, "-", "-"],
            input: SECRET,
          },
          {
            command: "/usr/bin/sudo",
            args: [...prefix, "decrypt", `--name=${SERVICE}`, `${DIRECTORY}/${SERVICE}.cred`, "-"],
            input: undefined,
          },
        ],
        io: [
          ["mkdir", DIRECTORY, 0o700],
          ["chmod", DIRECTORY, 0o700],
          ["write", `${DIRECTORY}/${SERVICE}.cred.tmp`, CIPHERTEXT, 0o600],
          ["rename", `${DIRECTORY}/${SERVICE}.cred.tmp`, `${DIRECTORY}/${SERVICE}.cred`],
          ["chmod", `${DIRECTORY}/${SERVICE}.cred`, 0o600],
          ["rm", `${DIRECTORY}/${SERVICE}.cred.tmp`],
          ["chmod", `${DIRECTORY}/${SERVICE}.cred`, 0o600],
          ["rm", `${DIRECTORY}/${SERVICE}.cred`],
        ],
        disclosed: false,
      });
    });
  });
}

it("rejects absent TPM2 with a remedy and never attempts encryption", () => {
  const f = fixture({ tpm: "partial" });
  let message;
  try {
    f.store.writeSecret(SERVICE, SECRET);
  } catch (error) {
    message = error.message;
  }
  expect({ message, calls: f.calls.map((call) => call.args), io: f.io }).toEqual({
    message:
      "TPM2 is unavailable. Enable TPM2 and install systemd TPM2 support; no host-key or plaintext fallback is permitted.",
    calls: [["--version"], ["-n", "/usr/bin/systemd-creds", "has-tpm2"]],
    io: [],
  });
});

for (const fail of ["--version", "has-tpm2", "encrypt", "decrypt"]) {
  it(`sanitizes ${fail} failure without falling back`, () => {
    const f = fixture({ fail, secrets: { [SERVICE]: SECRET } });
    let error;
    try {
      if (fail === "decrypt") f.store.readSecret(SERVICE);
      else f.store.writeSecret(SERVICE, SECRET);
    } catch (caught) {
      error = caught;
    }
    expect({
      safe: !`${error?.stack}${exposureReport(f)}`.includes("CREDENTIAL_SENTINEL"),
      failed: error instanceof Error,
      wrotePlaintext: f.io.some((operation) => operation[0] === "write"),
      downgraded: f.calls.some((call) => call.args.some((arg) => arg.includes("host") || arg.includes("auto"))),
    }).toEqual({ safe: true, failed: true, wrotePlaintext: false, downgraded: false });
  });
}

it("provides the exact sudoers remedy when noninteractive sudo is denied", () => {
  const f = fixture({ version: 255, fail: "has-tpm2" });
  expect(() => f.store.readSecret(SERVICE)).toThrow("stacey ALL=(root) NOPASSWD: /usr/bin/systemd-creds");
});

it("rejects path traversal without touching subprocesses or files", () => {
  const f = fixture();
  try {
    f.store.writeSecret("../escape", SECRET);
  } catch {}
  expect({ calls: f.calls, io: f.io }).toEqual({ calls: [], io: [] });
});

it("lists names without decrypting secrets or exposing unrelated files", () => {
  const f = fixture({ secrets: { "newt-openai-api": SECRET, [SERVICE]: SECRET } });
  f.files.set(`${DIRECTORY}/notes.txt`, Buffer.from("unrelated"));
  expect({ names: f.store.listNames(), calls: f.calls.map((call) => call.args) }).toEqual({
    names: [SERVICE, "newt-openai-api"],
    calls: [["--version"], ["-n", "/usr/bin/systemd-creds", "has-tpm2"]],
  });
});

for (const platform of ["linux", "darwin"]) {
  for (const path of ["standalone", "cli"]) {
    it(`${platform} ${path} resolves OAuth2 before password with exact services`, () => {
      const secrets = {
        [`${SERVICE}-client-id`]: "client",
        [`${SERVICE}-tenant-id`]: "tenant",
        [`${SERVICE}-client-secret`]: SECRET,
        [SERVICE]: "unused-password",
        "newt-openai-api": SECRET,
      };
      const f = fixture({ platform, secrets });
      const deps = createDefaultDeps(f.store, () => CONFIG);
      const accounts = path === "standalone" ? loadAccounts(f.store, () => CONFIG) : deps.requireAccounts();
      const key = deps.receipts.getOpenAiKey();
      const reads = f.calls.filter(
        (call) =>
          call.args.includes("decrypt") || (call.args[0] === "find-generic-password" && !call.args.includes("-a")),
      );
      expect({
        accounts,
        key,
        services: reads.map((call) =>
          platform === "linux"
            ? call.args.find((arg) => arg.startsWith("--name=")).slice(7)
            : call.args[call.args.indexOf("-s") + 1],
        ),
        disclosed: exposureReport(f).includes("CREDENTIAL_SENTINEL"),
        unlockBeforeRead:
          platform === "linux" ||
          f.calls.findIndex((call) => call.command === "/usr/bin/osascript") < f.calls.indexOf(reads[0]),
      }).toEqual({
        accounts: [
          {
            name: "Microsoft 365",
            user: "stacey@example.com",
            host: "imap.example.com",
            port: 993,
            smtp: null,
            oauth2: { clientId: "client", tenantId: "tenant", clientSecret: SECRET },
          },
        ],
        key: SECRET,
        services: [`${SERVICE}-client-id`, `${SERVICE}-tenant-id`, `${SERVICE}-client-secret`, "newt-openai-api"],
        disclosed: false,
        unlockBeforeRead: true,
      });
    });
  }

  it(`${platform} falls back to the original password service when OAuth2 is incomplete`, () => {
    const f = fixture({ platform, secrets: { [SERVICE]: SECRET, [`${SERVICE}-client-id`]: "client" } });
    expect(loadAccounts(f.store, () => CONFIG)[0].pass).toBe(SECRET);
  });
}

it("validates config through the real read boundary before resolving credentials", () => {
  resetConfigCache();
  const f = fixture();
  let failed = false;
  try {
    loadAccounts(f.store, () => getConfigAccounts(loadConfig({ readJson: () => ({ accounts: "invalid" }) })));
  } catch (error) {
    failed = error.code === "INVALID_INPUT";
  }
  resetConfigCache();
  expect({ failed, calls: f.calls }).toEqual({ failed: true, calls: [] });
});

for (const platform of ["win32", "freebsd"]) {
  it(`${platform} remains usable for help but rejects all store operations`, () => {
    const store = createSecretStore({ platform });
    const program = buildProgram(createDefaultDeps(store, () => CONFIG));
    const errors = [
      () => store.unlockNewtKeychain(),
      () => store.readSecret(SERVICE),
      () => store.writeSecret(SERVICE, SECRET),
      () => store.deleteSecret(SERVICE),
      () => store.listNames(),
    ].map((action) => {
      try {
        action();
        return "unexpected success";
      } catch (error) {
        return error.message;
      }
    });
    expect({ help: program.helpInformation().includes("Usage: mailctl"), errors }).toEqual({
      help: true,
      errors: Array(5).fill("no secret store on this platform"),
    });
  });
}

for (const json of [false, true]) {
  it(`CLI ${json ? "JSON" : "text"} hides subprocess errors containing secret values`, async () => {
    const f = fixture({ fail: "decrypt", secrets: { [SERVICE]: SECRET } });
    const logging = [];
    const originalLog = console.log;
    const originalError = console.error;
    const exitCode = process.exitCode;
    console.log = (...args) => logging.push(args);
    console.error = (...args) => logging.push(args);
    try {
      await buildProgram(createDefaultDeps(f.store, () => CONFIG)).parseAsync(
        ["search", "test", ...(json ? ["--json"] : [])],
        { from: "user" },
      );
      expect({
        output: logging.flat().join("\n"),
        exitCode: process.exitCode,
        disclosed: exposureReport(f, logging).includes("CREDENTIAL_SENTINEL"),
      }).toEqual({
        output: json
          ? JSON.stringify({
              error:
                "TPM2 decryption failed. Check TPM2 availability and credential binding. If noninteractive sudo is denied, install sudoers rule: stacey ALL=(root) NOPASSWD: /usr/bin/systemd-creds",
              code: "DECRYPT_FAILED",
            })
          : "Error: TPM2 decryption failed. Check TPM2 availability and credential binding. If noninteractive sudo is denied, install sudoers rule: stacey ALL=(root) NOPASSWD: /usr/bin/systemd-creds",
        exitCode: 1,
        disclosed: false,
      });
    } finally {
      console.log = originalLog;
      console.error = originalError;
      process.exitCode = exitCode ?? 0;
    }
  });
}

it("rejects obsolete systemd rather than selecting an unbound store", () => {
  const f = fixture({ version: 249 });
  expect(() => f.store.writeSecret(SERVICE, SECRET)).toThrow("systemd-creds version 250 or newer");
});

it("rejects a symlink credential directory before encryption", () => {
  const f = fixture();
  f.filesystem.lstat = () => ({ isDirectory: () => true, isFile: () => false, isSymbolicLink: () => true });
  expect(() => f.store.writeSecret(SERVICE, SECRET)).toThrow("Unsafe credential directory.");
});

it("rejects symlink ciphertext before decrypting", () => {
  const f = fixture();
  f.store.unlockNewtKeychain();
  f.filesystem.lstat = () => ({ isDirectory: () => false, isFile: () => true, isSymbolicLink: () => true });
  expect(() => f.store.readSecret(SERVICE)).toThrow("Unsafe credential file.");
});

it("does not downgrade when ciphertext permission handling fails", () => {
  const f = fixture();
  f.filesystem.writeCiphertext = () => {
    throw new Error("unwritable ciphertext");
  };
  let message;
  try {
    f.store.writeSecret(SERVICE, SECRET);
  } catch (error) {
    message = error.message;
  }
  expect({ message, writes: f.io.filter((op) => op[0] === "write"), invocation: f.calls.at(-1).args }).toEqual({
    message: "Unable to secure TPM2 ciphertext at mode 0600; check credential-directory ownership.",
    writes: [],
    invocation: ["-n", "/usr/bin/systemd-creds", "encrypt", "--with-key=tpm2", `--name=${SERVICE}`, "-", "-"],
  });
});

it("OpenAI-only Mac resolution unlocks first and caches the resolved value", () => {
  const f = fixture({ platform: "darwin", secrets: { "newt-openai-api": SECRET } });
  const deps = createDefaultDeps(f.store, () => []);
  expect({
    first: deps.receipts.getOpenAiKey(),
    second: deps.receipts.getOpenAiKey(),
    commands: f.calls.map(({ command, args }) => ({ command, args })),
  }).toEqual({
    first: SECRET,
    second: SECRET,
    commands: [
      {
        command: "/usr/bin/security",
        args: ["find-generic-password", "-a", "newt", "-s", "newt-keychain-password", "-w"],
      },
      { command: "/usr/bin/osascript", args: ["-l", "JavaScript", "-"] },
      {
        command: "/usr/bin/security",
        args: ["find-generic-password", "-s", "newt-openai-api", "-w", "/home/stacey/.newt/newt-keychain-db"],
      },
    ],
  });
});

it("preserves environment discovery without requesting an unsupported platform store", () => {
  const previous = { ...process.env };
  try {
    for (const prefix of ["ICLOUD", "GMAIL", "M365", "LIVE", "MOJILITY"]) {
      for (const suffix of ["USER", "HOST", "PORT", "PASS", "CLIENT_ID", "TENANT_ID", "CLIENT_SECRET"])
        delete process.env[`${prefix}_${suffix}`];
    }
    Object.assign(process.env, {
      ICLOUD_USER: "stacey@example.com",
      ICLOUD_HOST: "imap.example.com",
      ICLOUD_PORT: "995",
      ICLOUD_PASS: SECRET,
      ICLOUD_CLIENT_ID: "client",
      ICLOUD_TENANT_ID: "tenant",
      ICLOUD_CLIENT_SECRET: SECRET,
    });
    expect(loadAccounts(createSecretStore({ platform: "win32" }), () => [])).toEqual([
      {
        name: "ICLOUD",
        user: "stacey@example.com",
        host: "imap.example.com",
        port: 995,
        oauth2: { clientId: "client", tenantId: "tenant", clientSecret: SECRET },
      },
    ]);
  } finally {
    process.env = previous;
  }
});

it("preserves CLI account selection after platform-store resolution", async () => {
  const f = fixture({ secrets: { [SERVICE]: SECRET, "newt-icloud-imap": SECRET } });
  const config = [
    ...CONFIG,
    {
      prefix: "ICLOUD",
      name: "iCloud",
      user: "stacey@icloud.example",
      host: "imap.icloud.example",
      keychainService: "newt-icloud-imap",
    },
  ];
  const deps = createDefaultDeps(f.store, () => config);
  let selected;
  deps.mail = {
    ...deps.mail,
    searchCommand: async (_query, _opts, { targetAccounts }) => {
      selected = targetAccounts;
      return { allResults: [], warnings: [] };
    },
  };
  await buildProgram(deps).parseAsync(["--account", "icloud", "search", "test"], { from: "user" });
  expect(selected).toEqual([
    { name: "iCloud", user: "stacey@icloud.example", host: "imap.icloud.example", port: 993, smtp: null, pass: SECRET },
  ]);
});

it("avoids rejected user-scoped TPM2 encryption on current systemd", () => {
  const f = fixture({ version: 256, rejectUserTpm2: true });
  f.store.writeSecret(SERVICE, SECRET);
  expect(f.calls.find((call) => call.args.includes("encrypt")).args).toEqual([
    "-n",
    "/usr/bin/systemd-creds",
    "encrypt",
    "--with-key=tpm2",
    `--name=${SERVICE}`,
    "-",
    "-",
  ]);
});

it("refuses host-only ciphertext before invoking decrypt", () => {
  const f = fixture();
  f.files.set(
    `${DIRECTORY}/${SERVICE}.cred`,
    Buffer.from(
      Buffer.concat([
        Buffer.from("5a1c6a86df9d4096b1d5a65e0862f19a", "hex"),
        Buffer.from("HOST_ONLY_PAYLOAD"),
      ]).toString("base64"),
    ),
  );
  let message;
  try {
    f.store.readSecret(SERVICE);
  } catch (error) {
    message = error.message;
  }
  expect({ message, calls: f.calls.map((call) => call.args) }).toEqual({
    message: "Refusing credential without a TPM2-only encrypted header.",
    calls: [["--version"], ["-n", "/usr/bin/systemd-creds", "has-tpm2"]],
  });
});

it("refuses plaintext masquerading as encryption output before any filesystem write", () => {
  const f = fixture();
  const execute = f.subprocess.execFileSync;
  f.subprocess.execFileSync = (command, args, options) =>
    args.includes("encrypt") ? SECRET : execute(command, args, options);
  let message;
  try {
    f.store.writeSecret(SERVICE, SECRET);
  } catch (error) {
    message = error.message;
  }
  expect({
    message,
    writes: f.io.filter((operation) => operation[0] === "write"),
    leaked: exposureReport(f).includes("CREDENTIAL_SENTINEL"),
  }).toEqual({
    message: "Refusing credential without a TPM2-only encrypted header.",
    writes: [],
    leaked: false,
  });
});
