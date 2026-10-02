import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export class SecretConfigGateway {
  constructor() {
    this.directory = join(homedir(), ".config", "mailctl");
    this.path = join(this.directory, "config.json");
  }
  /** @returns {unknown} */
  read() {
    try {
      return JSON.parse(readFileSync(this.path, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return { accounts: [] };
      throw new Error("Unable to read account configuration.");
    }
  }
  /** @param {unknown} config */
  write(config) {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(config, null, 2), { mode: 0o600, flag: "wx" });
      renameSync(temporary, this.path);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
}
