/**
 * Editor Gateway — thin wrapper around the $EDITOR temp-file workflow.
 * Isolates filesystem and subprocess I/O so tests can inject a mock instead.
 * Contains no logic to test.
 */

import { execSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class EditorGateway {
  /**
   * Write content to a temp file, open it in $EDITOR, read the result back, then delete the file.
   * @param {string} initialContent - content to pre-populate the editor with
   * @returns {string} the file content after editing
   */
  editTempFile(initialContent) {
    const tmpFile = join(tmpdir(), `mailctl-reply-${Date.now()}.txt`);
    writeFileSync(tmpFile, initialContent);

    const editor = process.env.VISUAL || process.env.EDITOR || "vi";
    execSync(`${editor} "${tmpFile}"`, { stdio: "inherit" });

    const edited = readFileSync(tmpFile, "utf-8");
    unlinkSync(tmpFile);
    return edited;
  }
}
