import { expect, it } from "bun:test";
import { KeychainGateway } from "../../src/gateways/keychain-gateway.js";

it("unlocks the Mac keychain with the complete password only on stdin", () => {
  const secret = `UNLOCK_SENTINEL_'"\\\nsecond line`;
  const calls = [];
  const subprocess = {
    execFileSync(command, args, options) {
      calls.push({ command, args, options });
      return calls.length === 1 ? `${secret}\n` : "";
    },
  };
  new KeychainGateway(subprocess, "/home/test").unlockNewtKeychain();
  expect({
    lookup: calls[0].args,
    argv: calls[1].args,
    command: calls[1].command,
    inputContainsPassword: calls[1].options?.input?.includes(JSON.stringify(secret)),
    exposed: JSON.stringify(
      calls.map(({ command, args, options }) => ({ command, args, ...options, input: undefined })),
    ).includes("UNLOCK_SENTINEL"),
  }).toEqual({
    lookup: ["find-generic-password", "-a", "newt", "-s", "newt-keychain-password", "-w"],
    argv: ["-l", "JavaScript", "-"],
    command: "/usr/bin/osascript",
    inputContainsPassword: true,
    exposed: false,
  });
});

it("writes quoting and newline secrets through a native stdin call without argv or environment exposure", () => {
  const secret = `WRITE_SENTINEL_'"\\\nsecond line`;
  const calls = [];
  const store = new KeychainGateway(
    {
      execFileSync(command, args, options) {
        calls.push({ command, args, options });
        return "";
      },
    },
    "/home/test",
  );
  store.writeSecret("newt-openai-api", secret);
  const { input, ...options } = calls[0].options;
  expect({
    command: calls[0].command,
    args: calls[0].args,
    inputHasSecret: input.includes(JSON.stringify(secret)),
    inputHasService: input.includes(JSON.stringify("newt-openai-api")),
    inputHasPath: input.includes(JSON.stringify("/home/test/.newt/newt-keychain-db")),
    outsidePipe: JSON.stringify({ options, args: calls[0].args }).includes("WRITE_SENTINEL"),
  }).toEqual({
    command: "/usr/bin/osascript",
    args: ["-l", "JavaScript", "-"],
    inputHasSecret: true,
    inputHasService: true,
    inputHasPath: true,
    outsidePipe: false,
  });
});

it("returns null only for the Mac missing-secret exit status", () => {
  const store = new KeychainGateway({
    execFileSync() {
      throw Object.assign(new Error("MISSING_SENTINEL"), { status: 44 });
    },
  });
  expect(store.readSecret("missing")).toBeNull();
});

it("retains legacy Mac trimming behavior", () => {
  const store = new KeychainGateway({
    execFileSync() {
      return "  value\n";
    },
  });
  expect(store.readSecret("service")).toBe("value");
});

it("lists service names without requesting secret data and deletes by exact name and path", () => {
  const calls = [];
  const store = new KeychainGateway(
    {
      execFileSync(command, args, options) {
        calls.push({ command, args, options });
        return '"svce"<blob>="newt-openai-api"\n"svce"<blob>="newt-icloud-imap"\n"svce"<blob>="newt-openai-api"';
      },
    },
    "/home/test",
  );
  const names = store.listNames();
  store.deleteSecret("newt-openai-api");
  expect({ names, commands: calls.map(({ command, args }) => ({ command, args })) }).toEqual({
    names: ["newt-icloud-imap", "newt-openai-api"],
    commands: [
      { command: "/usr/bin/security", args: ["dump-keychain", "/home/test/.newt/newt-keychain-db"] },
      {
        command: "/usr/bin/security",
        args: ["delete-generic-password", "-s", "newt-openai-api", "/home/test/.newt/newt-keychain-db"],
      },
    ],
  });
});

for (const operation of ["unlockNewtKeychain", "readSecret", "writeSecret", "deleteSecret", "listNames"]) {
  it(`sanitizes complete secret-bearing Mac ${operation} subprocess errors`, () => {
    const secret = `ERROR_SENTINEL_'"\\\nsecond line`;
    const calls = [];
    const store = new KeychainGateway({
      execFileSync(command, args, options) {
        calls.push({ command, args, options });
        if (operation === "unlockNewtKeychain" && calls.length === 1) return secret;
        throw Object.assign(new Error(`${secret} ${options?.input}`), { stderr: secret, stdout: secret, status: 1 });
      },
    });
    let failure;
    try {
      if (operation === "writeSecret") store.writeSecret("newt-openai-api", secret);
      else store[operation]("newt-openai-api");
    } catch (error) {
      failure = error;
    }
    expect({
      failed: failure instanceof Error,
      disclosed:
        `${failure?.stack}${JSON.stringify(calls.map(({ options, ...call }) => ({ ...call, options: { ...options, input: undefined } })))}`.includes(
          "ERROR_SENTINEL",
        ),
      cause: failure?.cause,
    }).toEqual({ failed: true, disclosed: false, cause: undefined });
  });
}

it("treats deletion of a missing Mac secret as idempotent", () => {
  const store = new KeychainGateway({
    execFileSync() {
      throw Object.assign(new Error("not found"), { status: 44 });
    },
  });
  expect(store.deleteSecret("missing")).toBeUndefined();
});
