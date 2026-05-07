/**
 * PDF-to-markdown conversion via docling subprocess and extraction text resolution.
 */

import { join } from "node:path";
import { debug } from "./debug.js";

/**
 * @param {string} pdfPath
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} fs
 * @param {import("./gateways/subprocess-gateway.js").SubprocessGateway} subprocess
 * @param {(err: Error, context: object) => void} [onError] - called when docling conversion fails
 * @returns {string|null}
 */
export function pdfToText(pdfPath, fs, subprocess, onError = () => {}) {
  const doclingPath = join(process.env.HOME ?? "/tmp", ".local/bin/docling");
  if (!fs.exists(doclingPath)) return null;

  const tmpDir = join(process.env.TMPDIR || "/tmp", `mailctl-docling-${Date.now()}`);
  try {
    fs.mkdir(tmpDir);
    subprocess.execFileSync(
      doclingPath,
      [pdfPath, "--to", "md", "--image-export-mode", "placeholder", "--output", tmpDir],
      {
        timeout: 60000,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const files = fs.readdir(tmpDir);
    const mdFile = files.find((f) => f.endsWith(".md"));
    if (mdFile) {
      return fs.readText(join(tmpDir, mdFile)).trim();
    }
    return null;
  } catch (err) {
    onError(err, { pdfPath });
    return null;
  } finally {
    try {
      fs.rm(tmpDir, { recursive: true, force: true });
    } catch (err) {
      debug("pdf-converter", "cleanup failed", err);
    }
  }
}

/**
 * Prefers the first PDF attachment (converted via docling); falls back to email body text.
 * @param {Array} pdfAttachments
 * @param {string} bodyText
 * @param {number} uid
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} fs
 * @param {import("./gateways/subprocess-gateway.js").SubprocessGateway} subprocess
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @param {(err: Error, context: object) => void} [onError] - called when docling conversion fails
 * @returns {string}
 */
export function resolveExtractionText(
  pdfAttachments,
  bodyText,
  uid,
  fs,
  subprocess,
  onProgress = () => {},
  onError = () => {},
) {
  if (pdfAttachments.length === 0) return bodyText;

  const tmpPdfPath = join(process.env.TMPDIR || "/tmp", `mailctl-receipt-${Date.now()}.pdf`);
  try {
    fs.writeFile(tmpPdfPath, pdfAttachments[0].content);
    const pdfMarkdown = pdfToText(tmpPdfPath, fs, subprocess, onError);
    if (pdfMarkdown) {
      onProgress({ type: "using-pdf-content", uid });
      return pdfMarkdown;
    }
  } catch (err) {
    onProgress({ type: "docling-failed", severity: "warning", uid, error: err });
  } finally {
    try {
      fs.rm(tmpPdfPath, { force: true });
    } catch (err) {
      debug("pdf-converter", "cleanup failed", err);
    }
  }
  return bodyText;
}
