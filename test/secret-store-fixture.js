import { createSecretStore } from "../src/secret-store.js";
export const SECRET = `CREDENTIAL_SENTINEL_'"\\\nsecond line`;
export const CIPHERTEXT = Buffer.concat([
  Buffer.from("0c7cc07b117645919c4b0bea08bc20fe", "hex"),
  Buffer.from("FAKE_AUTHENTICATED_PAYLOAD"),
]).toString("base64");
export const DIRECTORY = "/home/stacey/.config/mailctl/credstore.encrypted";
export const SERVICE = "newt-m365-imap";
export const CONFIG = [
  {
    prefix: "M365",
    name: "Microsoft 365",
    user: "stacey@example.com",
    host: "imap.example.com",
    keychainService: SERVICE,
  },
];

export function fixture({
  platform = "linux",
  version = 256,
  // The real command prints the answer, then one line per component.
  tpm = "yes\n+firmware\n+driver\n+system\n+subsystem\n+libraries\n",
  fail = "",
  rejectUserTpm2 = false,
  secrets = {},
} = {}) {
  const calls = [];
  const files = new Map();
  const io = [];
  const filesystem = {
    mkdir(path, mode) {
      io.push(["mkdir", path, mode]);
    },
    lstat(path) {
      if (path !== DIRECTORY && !files.has(path)) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return { isDirectory: () => path === DIRECTORY, isFile: () => path !== DIRECTORY, isSymbolicLink: () => false };
    },
    chmod(path, mode) {
      io.push(["chmod", path, mode]);
    },
    readBuffer(path) {
      return files.get(path);
    },
    writeCiphertext(path, payload, mode) {
      io.push(["write", path, payload.toString(), mode]);
      files.set(path, payload);
    },
    rename(from, to) {
      io.push(["rename", from, to]);
      files.set(to, files.get(from));
      files.delete(from);
    },
    readdir() {
      return [...files.keys()].map((path) => path.slice(DIRECTORY.length + 1));
    },
    rm(path) {
      io.push(["rm", path]);
      files.delete(path);
    },
  };
  const subprocess = {
    execFileSync(command, args, options) {
      calls.push({ command, args, options });
      if (rejectUserTpm2 && args.includes("--user") && args.includes("--with-key=tpm2"))
        throw new Error("Selected key not available in --uid= scoped mode, refusing.");
      if (args.includes(fail))
        throw Object.assign(new Error(`subprocess echoed ${SECRET}`), { stdout: SECRET, stderr: SECRET, status: 1 });
      if (args.includes("--version")) return `systemd ${version}\n`;
      if (args.includes("has-tpm2")) return tpm;
      if (args.includes("encrypt")) {
        return CIPHERTEXT;
      }
      if (args.includes("decrypt")) return secrets[args.find((arg) => arg.startsWith("--name=")).slice(7)] ?? SECRET;
      if (args[0] === "find-generic-password") {
        if (args.includes("-a")) return `${SECRET}\n`;
        const service = args[args.indexOf("-s") + 1];
        if (!(service in secrets)) throw Object.assign(new Error(SECRET), { status: 44 });
        return secrets[service];
      }
      if (args[0] === "dump-keychain") return '"svce"<blob>="newt-openai-api"\n"svce"<blob>="newt-m365-imap"';
      return "";
    },
  };
  for (const service of Object.keys(secrets)) files.set(`${DIRECTORY}/${service}.cred`, Buffer.from(CIPHERTEXT));
  const store = createSecretStore({ platform, subprocess, filesystem, home: "/home/stacey", username: "stacey" });
  return { store, calls, files, io, filesystem, subprocess };
}
