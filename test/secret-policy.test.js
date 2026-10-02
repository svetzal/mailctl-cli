import { expect, it } from "bun:test";
import { LinuxSecretStore } from "../src/secret-store.js";

it("uses privileged TPM2-only decryption on systemd 256 through the production store", () => {
  const calls = [];
  const store = new LinuxSecretStore({
    subprocess: {
      execFileSync(command, args) {
        calls.push([command, args]);
        if (args.includes("--version")) return "systemd 256";
        if (args.includes("has-tpm2")) return "yes";
        if (command !== "/usr/bin/sudo" || args.includes("--user")) throw new Error("user-scoped TPM2 rejected");
        return "exact sentinel\nbytes";
      },
    },
    filesystem: {
      mkdir() {},
      chmod() {},
      writeCiphertext() {},
      rename() {},
      rm() {},
      readdir: () => [],
      lstat: () => ({ isDirectory: () => true, isFile: () => true, isSymbolicLink: () => false }),
      readBuffer: () => Buffer.from(Buffer.from("0c7cc07b117645919c4b0bea08bc20fe", "hex").toString("base64")),
    },
  });
  expect({ value: store.readSecret("newt-gmail-imap"), invocation: calls.at(-1) }).toEqual({
    value: "exact sentinel\nbytes",
    invocation: [
      "/usr/bin/sudo",
      ["-n", "/usr/bin/systemd-creds", "decrypt", "--name=newt-gmail-imap", store.path("newt-gmail-imap"), "-"],
    ],
  });
});
