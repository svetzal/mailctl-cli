/**
 * Single source of truth for mailctl's user-writable state directory.
 *
 * The receipt pipeline's scratch data — sender/classification JSON, the download
 * manifest — must live in a writable, stable location shared by every command
 * that reads or writes it. Resolving it relative to the binary (`__dirname/../data`)
 * is wrong for a compiled build: `import.meta.url` resolves into Bun's read-only
 * `$bunfs` virtual filesystem, so writes fail and the defaults point at nothing.
 *
 * Follows the XDG Base Directory spec: `$XDG_STATE_HOME/mailctl`, falling back to
 * `~/.local/state/mailctl`.
 */

import { homedir } from "node:os";
import { join } from "node:path";

export const DATA_DIR = process.env.XDG_STATE_HOME
  ? join(process.env.XDG_STATE_HOME, "mailctl")
  : join(homedir(), ".local", "state", "mailctl");
