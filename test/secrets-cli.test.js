import { expect, it } from "bun:test";
import { buildProgram, createDefaultDeps } from "../src/cli.js";
import { createSecretStore } from "../src/secret-store.js";
import { encodeSecretProtocol } from "../src/secrets-protocol.js";
import { CONFIG, fixture, SECRET, SERVICE } from "./secret-store-fixture.js";

const NAMES = [SERVICE, `${SERVICE}-client-id`, `${SERVICE}-client-secret`, `${SERVICE}-tenant-id`, "newt-openai-api"];

for (const withConfig of [false, true]) {
  for (const json of [false, true]) {
    it(`identifies exact push preview destinations and names without effects: config=${withConfig}, JSON=${json}`, async () => {
      const effects = [];
      const rejectEffect = () => {
        effects.push("forbidden effect");
        throw new Error("Preview attempted an effect.");
      };
      const d = dependencies(fixture());
      d.deps.secrets = {
        store: {
          readSecret: rejectEffect,
          unlockNewtKeychain: rejectEffect,
          writeSecret: rejectEffect,
          deleteSecret: rejectEffect,
          listNames: rejectEffect,
        },
        input: { isTerminal: rejectEffect, readStdin: rejectEffect, prompt: rejectEffect },
        config: {
          directory: "/unused",
          path: "/unused/config.json",
          read: () => ({ accounts: CONFIG }),
          write: rejectEffect,
        },
        subprocess: { execFileSync: rejectEffect },
      };
      const destinations = ["ops-01", "ops-02", "stacey@ops-01", "opsuser@ops-01"];
      const previews = [];
      for (const destination of destinations) {
        previews.push(
          await run(d.deps, [
            "push",
            destination,
            ...(withConfig ? ["--with-config"] : []),
            ...(json ? ["--json"] : []),
          ]),
        );
      }
      expect({ previews, effects }).toEqual({
        previews: destinations.map((destination) => ({
          code: 0,
          output: json
            ? JSON.stringify({
                results: NAMES.map((name) => ({ name, status: "planned" })),
                stats: { failed: 0 },
                destination,
              })
            : [`destination: ${destination}`, ...NAMES.map((name) => `${name}: planned`)].join("\n"),
        })),
        effects: [],
      });
    });
  }
}

for (const target of ["ops-01", "opsuser@ops-01"]) {
  for (const json of [false, true]) {
    for (const sshExit of [0, 1]) {
      it(`retains destination-user diagnostics and stored names from a real partial import: ${target}, JSON=${json}, SSH=${sshExit}`, async () => {
        const destination = fixture();
        const exec = destination.subprocess.execFileSync;
        destination.subprocess.execFileSync = (command, args, options) => {
          if (args.includes("encrypt") && args.includes(`--name=${SERVICE}`)) throw new Error(SECRET);
          return exec(command, args, options);
        };
        destination.store = createSecretStore({
          platform: "linux",
          username: "opsuser",
          home: "/home/stacey",
          subprocess: destination.subprocess,
          filesystem: destination.filesystem,
        });
        const entries = [SERVICE, "newt-openai-api"].map((name) => ({ name, value: SECRET }));
        const receiver = dependencies(destination, { input: encodeSecretProtocol(entries) });
        const imported = await run(receiver.deps, ["import", "--apply", "--json"]);
        const source = fixture({ secrets: Object.fromEntries(entries.map(({ name, value }) => [name, value])) });
        const transport = [];
        const sender = dependencies(source, {
          subprocess: {
            execFileSync(command, args, options) {
              transport.push({ command, args, options });
              if (sshExit)
                throw Object.assign(new Error(SECRET), {
                  stdout: Buffer.from(imported.output),
                  stderr: SECRET,
                  status: sshExit,
                });
              return imported.output;
            },
          },
        });
        const pushed = await run(sender.deps, ["push", target, "--apply", ...(json ? ["--json"] : [])]);
        const diagnostic = {
          code: "ENCRYPT_FAILED",
          username: "opsuser",
          remedy:
            "TPM2 encryption failed. Check TPM2 availability and credential binding. If noninteractive sudo is denied, install sudoers rule: opsuser ALL=(root) NOPASSWD: /usr/bin/systemd-creds",
        };
        const results = NAMES.map((name) =>
          name === SERVICE
            ? { name, status: "failed", diagnostic }
            : { name, status: name === "newt-openai-api" ? "stored" : "missing" },
        );
        expect({
          imported: imported.code,
          pushed: pushed.code,
          output: pushed.output,
          transport: transport.map(({ command, args }) => ({ command, args })),
          leaked:
            exposure(source, pushed.output, transport, sender.writes) ||
            exposure(destination, imported.output, [], receiver.writes),
        }).toEqual({
          imported: 1,
          pushed: 1,
          output: json
            ? JSON.stringify({ results, stats: { failed: 1 } })
            : results
                .map(
                  ({ name, status, diagnostic }) =>
                    `${name}: ${status}${diagnostic ? ` [${diagnostic.code}] ${diagnostic.remedy}` : ""}`,
                )
                .join("\n"),
          transport: [
            {
              command: "ssh",
              args: ["-T", "--", target, "exec \"$SHELL\" -lc 'exec mailctl secrets import --apply --json'"],
            },
          ],
          leaked: false,
        });
      });
    }
  }
}

/** @param {ReturnType<typeof fixture>} f
 * @param {{input?: string, terminal?: boolean, config?: unknown, subprocess?: import("../src/gateways/subprocess-gateway.js").SubprocessGateway}} [options] */
function dependencies(
  f,
  { input = "", terminal = false, config = { accounts: CONFIG }, subprocess = { execFileSync: () => "" } } = {},
) {
  const writes = [];
  const reads = [];
  const deps = createDefaultDeps(f.store, () => CONFIG);
  deps.secrets = {
    store: f.store,
    input: {
      isTerminal: () => terminal,
      readStdin: async () => {
        reads.push("stdin");
        return input;
      },
      prompt: async () => {
        reads.push("prompt");
        return input;
      },
    },
    config: {
      directory: "/unused",
      path: "/unused/config.json",
      read: () => config,
      write: (value) => {
        writes.push(value);
      },
    },
    subprocess,
  };
  return { deps, writes, reads };
}

async function run(deps, args) {
  const logging = [];
  const previous = { log: console.log, error: console.error, exitCode: process.exitCode };
  console.log = (...values) => logging.push(values.join(" "));
  console.error = (...values) => logging.push(values.join(" "));
  process.exitCode = 0;
  try {
    await buildProgram(deps).parseAsync(["secrets", ...args], { from: "user" });
    return { output: logging.join("\n"), code: process.exitCode };
  } finally {
    console.log = previous.log;
    console.error = previous.error;
    process.exitCode = previous.exitCode ?? 0;
  }
}

function exposure(f, output, transport = [], writes = []) {
  return JSON.stringify({
    calls: f.calls.map(({ command, args, options }) => ({ command, args, options: { ...options, input: undefined } })),
    io: f.io,
    output,
    transport: transport.map(({ options, ...call }) => ({ ...call, options: { ...options, input: undefined } })),
    writes,
  }).includes("CREDENTIAL_SENTINEL");
}

it("tells the operator to pass --stdin when a value is piped without it, and stores nothing", async () => {
  const f = fixture();
  const d = dependencies(f, { input: SECRET, terminal: false });
  const set = await run(d.deps, ["set", SERVICE, "--apply", "--json"]);
  expect({
    code: set.code,
    error: JSON.parse(set.output).error,
    reads: d.reads,
    encrypted: f.calls.some((call) => call.args.includes("encrypt")),
    leaked: exposure(f, set.output),
  }).toEqual({
    code: 1,
    error: "Standard input is not a terminal. Pass --stdin to read the secret from standard input.",
    reads: [],
    encrypted: false,
    leaked: false,
  });
});

it("lists exact expected password, OAuth2 and OpenAI names with availability and no reads", async () => {
  const f = fixture({ secrets: { [SERVICE]: SECRET } });
  const { deps } = dependencies(f);
  const result = await run(deps, ["list", "--json"]);
  expect({
    response: JSON.parse(result.output),
    decrypts: f.calls.filter((call) => call.args.includes("decrypt")),
    leaked: exposure(f, result.output),
  }).toEqual({
    response: {
      results: NAMES.map((name) => ({ name, status: name === SERVICE ? "present" : "missing" })),
      stats: { failed: 0 },
    },
    decrypts: [],
    leaked: false,
  });
});

it("lists names for a configuration with a dormant account that has no user, without expecting its secrets", async () => {
  const f = fixture({ secrets: { [SERVICE]: SECRET } });
  const dormant = {
    prefix: "dormant",
    name: "Dormant",
    host: "imap.example.com",
    port: 993,
    keychainService: "newt-dormant-imap",
  };
  const { deps } = dependencies(f, { config: { accounts: [...CONFIG, dormant] } });
  const result = await run(deps, ["list", "--json"]);
  expect({ response: JSON.parse(result.output), code: result.code }).toEqual({
    response: {
      results: NAMES.map((name) => ({ name, status: name === SERVICE ? "present" : "missing" })),
      stats: { failed: 0 },
    },
    code: 0,
  });
});

for (const configOption of ["--with-config", "--config"]) {
  it(`previews push ${configOption} without transport or secret reads`, async () => {
    const f = fixture({ secrets: { [SERVICE]: SECRET } });
    const transport = [];
    const d = dependencies(f, {
      subprocess: {
        execFileSync: (...args) => {
          transport.push(args);
          return "";
        },
      },
    });
    const result = await run(d.deps, ["push", "ops-01", configOption, "--json"]);
    expect({ result, calls: f.calls, io: f.io, reads: d.reads, writes: d.writes, transport }).toEqual({
      result: {
        code: 0,
        output: JSON.stringify({
          results: NAMES.map((name) => ({ name, status: "planned" })),
          stats: { failed: 0 },
          destination: "ops-01",
        }),
      },
      calls: [],
      io: [],
      reads: [],
      writes: [],
      transport: [],
    });
  });
}

for (const verb of ["set", "rm", "push"]) {
  it(`previews ${verb} without input, store operations, config writes or SSH`, async () => {
    const f = fixture();
    const transport = [];
    const d = dependencies(f, {
      input: SECRET,
      subprocess: {
        execFileSync: (...args) => {
          transport.push(args);
          return "";
        },
      },
    });
    const result = await run(d.deps, [verb, verb === "push" ? "ops-01" : SERVICE, "--json"]);
    expect({
      response: JSON.parse(result.output),
      calls: f.calls,
      reads: d.reads,
      writes: d.writes,
      transport,
    }).toEqual({
      response: {
        results: (verb === "push" ? NAMES : [SERVICE]).map((name) => ({ name, status: "planned" })),
        stats: { failed: 0 },
        ...(verb === "push" ? { destination: "ops-01" } : {}),
      },
      calls: [],
      reads: [],
      writes: [],
      transport: [],
    });
  });
}

for (const stdin of [false, true]) {
  it(`sets exact bytes through ${stdin ? "stdin" : "hidden prompt"} and removes via registered actions`, async () => {
    const f = fixture();
    // A hidden prompt needs a terminal; --stdin needs piped input.
    const d = dependencies(f, { input: SECRET, terminal: !stdin });
    const set = await run(d.deps, ["set", SERVICE, "--apply", "--json", ...(stdin ? ["--stdin"] : [])]);
    const rm = await run(d.deps, ["rm", SERVICE, "--apply", "--json"]);
    expect({
      set: JSON.parse(set.output),
      rm: JSON.parse(rm.output),
      bytes: f.calls.find((call) => call.args.includes("encrypt")).options.input,
      reads: d.reads,
      files: [...f.files.keys()],
      leaked: exposure(f, set.output + rm.output),
    }).toEqual({
      set: { results: [{ name: SERVICE, status: "stored" }], stats: { failed: 0 } },
      rm: { results: [{ name: SERVICE, status: "removed" }], stats: { failed: 0 } },
      bytes: SECRET,
      reads: [stdin ? "stdin" : "prompt"],
      files: [],
      leaked: false,
    });
  });
}

for (const configOption of ["--with-config", "--config"]) {
  it(`replicates exact sentinel bytes from macOS to Linux using one SSH login shell and validated account metadata via ${configOption}`, async () => {
    const source = fixture({ platform: "darwin", secrets: Object.fromEntries(NAMES.map((name) => [name, SECRET])) });
    const receiver = fixture({ version: 257 });
    const receiverWrites = [];
    const transport = [];
    const sender = dependencies(source, {
      subprocess: {
        execFileSync(command, args, options) {
          transport.push({ command, args, options });
          return JSON.stringify({
            results: NAMES.map((name) => ({ name, status: "stored" })),
            stats: { failed: 0 },
            config: "stored",
          });
        },
      },
    });
    const sent = await run(sender.deps, ["push", "stacey@ops-01", configOption, "--apply", "--json"]);
    const remote = dependencies(receiver, { input: String(transport[0].options.input) });
    const received = await run(remote.deps, ["import", "--apply", "--json"]);
    receiverWrites.push(...remote.writes);
    expect({
      sent: JSON.parse(sent.output),
      received: JSON.parse(received.output),
      writes: receiverWrites,
      receivingBytes: receiver.calls
        .filter((call) => call.args.includes("encrypt"))
        .map((call) => [call.args.find((arg) => arg.startsWith("--name=")), call.options.input]),
      ssh: transport.map(({ command, args }) => ({ command, args })),
      leaked: exposure(source, sent.output, transport) || exposure(receiver, received.output, [], receiverWrites),
    }).toEqual({
      sent: { results: NAMES.map((name) => ({ name, status: "stored" })), stats: { failed: 0 }, config: "stored" },
      received: { results: NAMES.map((name) => ({ name, status: "stored" })), stats: { failed: 0 }, config: "stored" },
      writes: [{ accounts: CONFIG }],
      receivingBytes: NAMES.map((name) => [`--name=${name}`, SECRET]),
      ssh: [
        {
          command: "ssh",
          args: ["-T", "--", "stacey@ops-01", "exec \"$SHELL\" -lc 'exec mailctl secrets import --apply --json'"],
        },
      ],
      leaked: false,
    });
  });
}

it("previews a valid import without touching the receiving store or configuration", async () => {
  const f = fixture();
  const d = dependencies(f, { input: encodeSecretProtocol([{ name: SERVICE, value: SECRET }], CONFIG) });
  const result = await run(d.deps, ["import", "--json"]);
  expect({
    response: JSON.parse(result.output),
    calls: f.calls,
    writes: d.writes,
    leaked: exposure(f, result.output),
  }).toEqual({
    response: { results: [{ name: SERVICE, status: "planned" }], stats: { failed: 0 } },
    calls: [],
    writes: [],
    leaked: false,
  });
});

for (const input of [
  SECRET,
  JSON.stringify({ protocol: "mailctl-secrets", version: 2, value: SECRET }),
  encodeSecretProtocol([
    { name: SERVICE, value: SECRET },
    { name: SERVICE, value: SECRET },
  ]),
  encodeSecretProtocol([{ name: `../${SECRET}`, value: SECRET }]),
  `${JSON.stringify({ protocol: "mailctl-secrets", version: 1 })}\n${JSON.stringify({ name: SERVICE, value: SECRET, malicious: SECRET })}\n`,
  `${JSON.stringify({ protocol: "mailctl-secrets", version: 1, accounts: [{ ...CONFIG[0], pass: SECRET }] })}\n`,
  `${JSON.stringify({ protocol: "mailctl-secrets", version: 1, accounts: [{ ...CONFIG[0], port: SECRET }] })}\n`,
  `${JSON.stringify({ protocol: "mailctl-secrets", version: 1, accounts: [{ ...CONFIG[0], smtp: { host: "smtp.example.com", port: 465, secure: true, password: SECRET } }] })}\n`,
]) {
  it("rejects malformed or malicious protocol before effects without leaking input", async () => {
    const f = fixture();
    const d = dependencies(f, { input });
    const result = await run(d.deps, ["import", "--apply", "--json"]);
    expect({
      code: result.code,
      rejected: Boolean(JSON.parse(result.output).error),
      leaked: exposure(f, result.output),
      calls: f.calls,
      writes: d.writes,
    }).toEqual({
      code: 1,
      rejected: true,
      leaked: false,
      calls: [],
      writes: [],
    });
  });
}

for (const verb of ["import", "set"]) {
  it(`rejects terminal stdin for ${verb} before input or effects`, async () => {
    const f = fixture();
    const d = dependencies(f, { terminal: true, input: SECRET });
    const result = await run(d.deps, [verb, ...(verb === "set" ? [SERVICE, "--stdin"] : []), "--apply", "--json"]);
    expect({ code: result.code, reads: d.reads, calls: f.calls, leaked: exposure(f, result.output) }).toEqual({
      code: 1,
      reads: [],
      calls: [],
      leaked: false,
    });
  });
}

for (const json of [false, true]) {
  it(`sanitizes secret-bearing SSH errors in ${json ? "JSON" : "text"} output with per-name outcomes`, async () => {
    const f = fixture({ secrets: { [SERVICE]: SECRET } });
    const d = dependencies(f, {
      subprocess: {
        execFileSync() {
          throw Object.assign(new Error(SECRET), { stdout: SECRET, stderr: SECRET });
        },
      },
    });
    const result = await run(d.deps, ["push", "ops-01", "--apply", ...(json ? ["--json"] : [])]);
    expect({ code: result.code, output: result.output, leaked: exposure(f, result.output) }).toEqual({
      code: 1,
      output: json
        ? JSON.stringify({
            results: NAMES.map((name) => ({ name, status: name === SERVICE ? "failed" : "missing" })),
            stats: { failed: 1 },
          })
        : NAMES.map((name) => `${name}: ${name === SERVICE ? "failed" : "missing"}`).join("\n"),
      leaked: false,
    });
  });
}

it("continues importing after a secret-bearing store failure with exact per-name outcomes", async () => {
  const f = fixture();
  const execute = f.subprocess.execFileSync;
  f.subprocess.execFileSync = (command, args, options) => {
    if (args.includes("encrypt") && args.includes(`--name=${SERVICE}`)) {
      f.calls.push({ command, args, options });
      throw Object.assign(new Error(SECRET), { stdout: SECRET, stderr: SECRET });
    }
    return execute(command, args, options);
  };
  const d = dependencies(f, {
    input: encodeSecretProtocol([
      { name: SERVICE, value: SECRET },
      { name: "newt-openai-api", value: SECRET },
    ]),
  });
  const result = await run(d.deps, ["import", "--apply", "--json"]);
  expect({ code: result.code, response: JSON.parse(result.output), leaked: exposure(f, result.output) }).toEqual({
    code: 1,
    response: {
      results: [
        {
          name: SERVICE,
          status: "failed",
          diagnostic: {
            code: "ENCRYPT_FAILED",
            username: "stacey",
            remedy:
              "TPM2 encryption failed. Check TPM2 availability and credential binding. If noninteractive sudo is denied, install sudoers rule: stacey ALL=(root) NOPASSWD: /usr/bin/systemd-creds",
          },
        },
        { name: "newt-openai-api", status: "stored" },
      ],
      stats: { failed: 1 },
    },
    leaked: false,
  });
});

it("validates outgoing configuration before SSH even when malicious fields contain secrets", async () => {
  const f = fixture({ secrets: { [SERVICE]: SECRET } });
  const transport = [];
  const d = dependencies(f, {
    config: { accounts: [{ ...CONFIG[0], pass: SECRET }] },
    subprocess: {
      execFileSync: (...args) => {
        transport.push(args);
        return "";
      },
    },
  });
  const result = await run(d.deps, ["push", "ops-01", "--config", "--apply", "--json"]);
  expect({ code: result.code, transport, calls: f.calls, leaked: exposure(f, result.output) }).toEqual({
    code: 1,
    transport: [],
    calls: [],
    leaked: false,
  });
});

it("retains remote per-name outcomes on a nonzero SSH exit without exposing stderr", async () => {
  const f = fixture({ secrets: { [SERVICE]: SECRET, "newt-openai-api": SECRET } });
  const remote = [
    { name: SERVICE, status: "stored" },
    { name: "newt-openai-api", status: "failed" },
  ];
  const d = dependencies(f, {
    subprocess: {
      execFileSync() {
        throw Object.assign(new Error(SECRET), {
          stdout: JSON.stringify({ results: remote, stats: { failed: 1 } }),
          stderr: SECRET,
        });
      },
    },
  });
  const result = await run(d.deps, ["push", "ops-01", "--apply", "--json"]);
  expect({ code: result.code, response: JSON.parse(result.output), leaked: exposure(f, result.output) }).toEqual({
    code: 1,
    response: {
      results: NAMES.map((name) => ({
        name,
        status: name === SERVICE ? "stored" : name === "newt-openai-api" ? "failed" : "missing",
      })),
      stats: { failed: 1 },
    },
    leaked: false,
  });
});

for (const response of [
  SECRET,
  JSON.stringify({ results: [{ name: SECRET, status: "stored" }] }),
  JSON.stringify({ results: [{ name: SERVICE, status: SECRET }] }),
  JSON.stringify({ results: [{ name: SERVICE, status: "stored", value: SECRET }] }),
]) {
  it("rejects unexpected remote output and fields without echoing values", async () => {
    const f = fixture({ secrets: { [SERVICE]: SECRET } });
    const d = dependencies(f, { subprocess: { execFileSync: () => response } });
    const result = await run(d.deps, ["push", "ops-01", "--apply", "--json"]);
    expect({ code: result.code, response: JSON.parse(result.output), leaked: exposure(f, result.output) }).toEqual({
      code: 1,
      response: {
        results: NAMES.map((name) => ({ name, status: name === SERVICE ? "failed" : "missing" })),
        stats: { failed: 1 },
      },
      leaked: false,
    });
  });
}

it("reports failed configuration even when no local secret is available to send", async () => {
  const f = fixture();
  const d = dependencies(f, {
    subprocess: {
      execFileSync() {
        throw new Error(SECRET);
      },
    },
  });
  const result = await run(d.deps, ["push", "ops-01", "--config", "--apply", "--json"]);
  expect({ code: result.code, response: JSON.parse(result.output), leaked: exposure(f, result.output) }).toEqual({
    code: 1,
    response: { results: NAMES.map((name) => ({ name, status: "missing" })), stats: { failed: 1 }, config: "failed" },
    leaked: false,
  });
});

it("reports an import configuration write failure while retaining successful secret outcomes", async () => {
  const f = fixture();
  const d = dependencies(f, { input: encodeSecretProtocol([{ name: SERVICE, value: SECRET }], CONFIG) });
  d.deps.secrets.config.write = () => {
    throw new Error(SECRET);
  };
  const result = await run(d.deps, ["import", "--apply", "--json"]);
  expect({ code: result.code, response: JSON.parse(result.output), leaked: exposure(f, result.output) }).toEqual({
    code: 1,
    response: { results: [{ name: SERVICE, status: "stored" }], stats: { failed: 1 }, config: "failed" },
    leaked: false,
  });
});

it("preserves validated destination vendor maps when importing accounts", async () => {
  const f = fixture();
  const d = dependencies(f, {
    input: encodeSecretProtocol([], CONFIG),
    config: {
      accounts: [],
      vendorAddressMap: { "billing@example.com": "Example" },
      vendorDomainMap: { "example.com": "Example" },
    },
  });
  const result = await run(d.deps, ["import", "--apply", "--json"]);
  expect({ response: JSON.parse(result.output), writes: d.writes }).toEqual({
    response: { results: [], stats: { failed: 0 }, config: "stored" },
    writes: [
      {
        accounts: CONFIG,
        vendorAddressMap: { "billing@example.com": "Example" },
        vendorDomainMap: { "example.com": "Example" },
      },
    ],
  });
});

it("does not contact SSH when all expected secrets are missing and configuration is not requested", async () => {
  const f = fixture();
  const transport = [];
  const d = dependencies(f, {
    subprocess: {
      execFileSync: (...args) => {
        transport.push(args);
        return "";
      },
    },
  });
  const result = await run(d.deps, ["push", "ops-01", "--apply", "--json"]);
  expect({ response: JSON.parse(result.output), transport }).toEqual({
    response: { results: NAMES.map((name) => ({ name, status: "missing" })), stats: { failed: 0 } },
    transport: [],
  });
});

it("honors the legacy dry-run flag even with --apply", async () => {
  const f = fixture();
  const d = dependencies(f, { input: SECRET });
  const result = await run(d.deps, ["set", SERVICE, "--apply", "--dry-run", "--json"]);
  expect({ response: JSON.parse(result.output), reads: d.reads, calls: f.calls }).toEqual({
    response: { results: [{ name: SERVICE, status: "planned" }], stats: { failed: 0 } },
    reads: [],
    calls: [],
  });
});

it("preserves destination TPM2 diagnostics through a nonzero SSH import response", async () => {
  const destination = fixture();
  const execute = destination.subprocess.execFileSync;
  destination.subprocess.execFileSync = (command, args, options) => {
    if (args.includes("encrypt") && args.includes(`--name=${SERVICE}`)) {
      destination.calls.push({ command, args, options });
      throw Object.assign(new Error(SECRET), { stdout: SECRET, stderr: SECRET, status: 1 });
    }
    return execute(command, args, options);
  };
  const imported = dependencies(destination, {
    input: encodeSecretProtocol([
      { name: SERVICE, value: SECRET },
      { name: "newt-openai-api", value: SECRET },
    ]),
  });
  const remote = await run(imported.deps, ["import", "--apply", "--json"]);
  const local = fixture({ secrets: { [SERVICE]: SECRET, "newt-openai-api": SECRET } });
  const transport = [];
  const pushed = dependencies(local, {
    subprocess: {
      execFileSync(command, args, options) {
        transport.push({ command, args, options });
        throw Object.assign(new Error(SECRET), { stdout: remote.output, stderr: SECRET, status: 1 });
      },
    },
  });
  const result = await run(pushed.deps, ["push", "stacey@ops-01", "--apply", "--json"]);
  expect({
    code: result.code,
    remoteCode: remote.code,
    response: JSON.parse(result.output),
    leaked: exposure(local, result.output + remote.output, transport, [...imported.writes, ...destination.io]),
  }).toEqual({
    code: 1,
    remoteCode: 1,
    response: {
      results: NAMES.map((name) =>
        name === SERVICE
          ? {
              name,
              status: "failed",
              diagnostic: {
                code: "ENCRYPT_FAILED",
                username: "stacey",
                remedy:
                  "TPM2 encryption failed. Check TPM2 availability and credential binding. If noninteractive sudo is denied, install sudoers rule: stacey ALL=(root) NOPASSWD: /usr/bin/systemd-creds",
              },
            }
          : { name, status: name === "newt-openai-api" ? "stored" : "missing" },
      ),
      stats: { failed: 1 },
    },
    leaked: false,
  });
});

const SUDO_REMEDY =
  " If noninteractive sudo is denied, install sudoers rule: stacey ALL=(root) NOPASSWD: /usr/bin/systemd-creds";
const FAILURE_CASES = [
  {
    fixtureOptions: { tpm: "no" },
    code: "TPM2_UNAVAILABLE",
    remedy:
      "TPM2 is unavailable. Enable TPM2 and install systemd TPM2 support; no host-key or plaintext fallback is permitted.",
  },
  {
    fixtureOptions: { fail: "has-tpm2" },
    code: "TPM2_CHECK_FAILED",
    username: "stacey",
    remedy: `TPM2 availability check failed. Enable TPM2 and install systemd TPM2 support.${SUDO_REMEDY}`,
  },
  {
    fixtureOptions: { fail: "encrypt" },
    code: "ENCRYPT_FAILED",
    username: "stacey",
    remedy: `TPM2 encryption failed. Check TPM2 availability and credential binding.${SUDO_REMEDY}`,
  },
];
for (const json of [false, true]) {
  for (const { fixtureOptions, ...diagnostic } of FAILURE_CASES) {
    it(`reports exact ${diagnostic.code} diagnostics for registered set in ${json ? "JSON" : "text"}`, async () => {
      const f = fixture(fixtureOptions);
      const d = dependencies(f, { input: SECRET });
      const result = await run(d.deps, ["set", SERVICE, "--stdin", "--apply", ...(json ? ["--json"] : [])]);
      expect({ code: result.code, output: result.output, leaked: exposure(f, result.output, [], d.writes) }).toEqual({
        code: 1,
        output: json
          ? JSON.stringify({ results: [{ name: SERVICE, status: "failed", diagnostic }], stats: { failed: 1 } })
          : `${SERVICE}: failed [${diagnostic.code}] ${diagnostic.remedy}`,
        leaked: false,
      });
    });
  }
  it(`reports local decryption failure and preserves missing names in ${json ? "JSON" : "text"}`, async () => {
    const f = fixture({ fail: "decrypt", secrets: { [SERVICE]: SECRET } });
    const d = dependencies(f);
    const result = await run(d.deps, ["push", "stacey@ops-01", "--apply", ...(json ? ["--json"] : [])]);
    const diagnostic = {
      code: "DECRYPT_FAILED",
      username: "stacey",
      remedy: `TPM2 decryption failed. Check TPM2 availability and credential binding.${SUDO_REMEDY}`,
    };
    expect({ code: result.code, output: result.output, leaked: exposure(f, result.output) }).toEqual({
      code: 1,
      output: json
        ? JSON.stringify({
            results: NAMES.map((name) =>
              name === SERVICE ? { name, status: "failed", diagnostic } : { name, status: "missing" },
            ),
            stats: { failed: 1 },
          })
        : NAMES.map((name) =>
            name === SERVICE ? `${name}: failed [${diagnostic.code}] ${diagnostic.remedy}` : `${name}: missing`,
          ).join("\n"),
      leaked: false,
    });
  });
}

for (const diagnostic of [
  { code: SECRET, remedy: SECRET },
  { code: "ENCRYPT_FAILED", username: "stacey", remedy: SECRET },
  {
    code: "ENCRYPT_FAILED",
    username: "CREDENTIAL_SENTINEL",
    remedy:
      "TPM2 encryption failed. Check TPM2 availability and credential binding. If noninteractive sudo is denied, install sudoers rule: CREDENTIAL_SENTINEL ALL=(root) NOPASSWD: /usr/bin/systemd-creds",
  },
  { code: "TPM2_UNAVAILABLE", remedy: FAILURE_CASES[0].remedy, error: SECRET },
]) {
  it("rejects forged remote diagnostics without echoing fields or losing local missing outcomes", async () => {
    const f = fixture({ secrets: { [SERVICE]: SECRET } });
    const transport = [];
    const d = dependencies(f, {
      subprocess: {
        execFileSync(command, args, options) {
          transport.push({ command, args, options });
          return JSON.stringify({ results: [{ name: SERVICE, status: "failed", diagnostic }] });
        },
      },
    });
    const result = await run(d.deps, ["push", "stacey@ops-01", "--apply", "--json"]);
    expect({
      code: result.code,
      response: JSON.parse(result.output),
      leaked: exposure(f, result.output, transport, d.writes),
    }).toEqual({
      code: 1,
      response: {
        results: NAMES.map((name) => ({ name, status: name === SERVICE ? "failed" : "missing" })),
        stats: { failed: 1 },
      },
      leaked: false,
    });
  });
}

for (const target of ["ops-01", "opsuser@ops-01", "different@ops-01"]) {
  for (const diagnostic of [
    { code: "ENCRYPT_FAILED", username: "opsuser", remedy: SECRET },
    { code: "ENCRYPT_FAILED", username: "opsuser\nALL=(ALL) ALL", remedy: SECRET },
    { code: "ENCRYPT_FAILED", username: "opsuser", remedy: SECRET, stderr: SECRET },
  ]) {
    it(`rejects hostile destination diagnostics on ${target} without leaking values`, async () => {
      const f = fixture({ secrets: { [SERVICE]: SECRET, "newt-openai-api": SECRET } });
      const d = dependencies(f, {
        subprocess: {
          execFileSync: () =>
            JSON.stringify({
              results: [
                { name: SERVICE, status: "failed", diagnostic },
                { name: "newt-openai-api", status: "stored" },
              ],
            }),
        },
      });
      const result = await run(d.deps, ["push", target, "--apply", "--json"]);
      expect({ result, leaked: exposure(f, result.output) }).toEqual({
        result: {
          code: 1,
          output: JSON.stringify({
            results: NAMES.map((name) => ({
              name,
              status: name === SERVICE || name === "newt-openai-api" ? "failed" : "missing",
            })),
            stats: { failed: 2 },
          }),
        },
        leaked: false,
      });
    });
  }
}

it("rejects a canonical remote diagnostic belonging to a different explicit SSH login", async () => {
  const destination = fixture({ fail: "encrypt" });
  const remote = await run(
    dependencies(destination, { input: encodeSecretProtocol([{ name: SERVICE, value: SECRET }]) }).deps,
    ["import", "--apply", "--json"],
  );
  const source = fixture({ secrets: { [SERVICE]: SECRET } });
  const sender = dependencies(source, { subprocess: { execFileSync: () => remote.output } });
  const result = await run(sender.deps, ["push", "different@ops-01", "--apply", "--json"]);
  expect({ result, leaked: exposure(source, result.output) }).toEqual({
    result: {
      code: 1,
      output: JSON.stringify({
        results: NAMES.map((name) => ({ name, status: name === SERVICE ? "failed" : "missing" })),
        stats: { failed: 1 },
      }),
    },
    leaked: false,
  });
});

it("preserves classified thrown list failures while sanitizing unknown thrown errors", async () => {
  const f = fixture({ fail: "has-tpm2" });
  const d = dependencies(f);
  const known = await run(d.deps, ["list", "--json"]);
  f.subprocess.execFileSync = () => {
    throw new Error(SECRET);
  };
  d.deps.secrets.config.read = () => {
    throw Object.assign(new Error(SECRET), { code: "ENCRYPT_FAILED", diagnostic: { remedy: SECRET } });
  };
  const unknown = await run(d.deps, ["list", "--json"]);
  expect({ known, unknown, leaked: exposure(f, known.output + unknown.output) }).toEqual({
    known: { code: 1, output: JSON.stringify({ error: FAILURE_CASES[1].remedy, code: "TPM2_CHECK_FAILED" }) },
    unknown: {
      code: 1,
      output: JSON.stringify({
        error:
          "Secret operation rejected. Check input/configuration, protocol version, TPM2 support and noninteractive sudo permissions; values are never reported.",
      }),
    },
    leaked: false,
  });
});

it("sanitizes forged filesystem diagnostics for every affected import name", async () => {
  const f = fixture();
  f.filesystem.mkdir = () => {
    throw Object.assign(new Error(SECRET), { code: "ENCRYPT_FAILED", diagnostic: { remedy: SECRET } });
  };
  const d = dependencies(f, {
    input: encodeSecretProtocol([
      { name: SERVICE, value: SECRET },
      { name: "newt-openai-api", value: SECRET },
    ]),
  });
  const result = await run(d.deps, ["import", "--apply", "--json"]);
  expect({
    code: result.code,
    response: JSON.parse(result.output),
    leaked: exposure(f, result.output, [], d.writes),
  }).toEqual({
    code: 1,
    response: {
      results: [
        { name: SERVICE, status: "failed" },
        { name: "newt-openai-api", status: "failed" },
      ],
      stats: { failed: 2 },
    },
    leaked: false,
  });
});
