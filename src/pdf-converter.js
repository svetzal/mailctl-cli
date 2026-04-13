/**
 * PDF-to-markdown conversion via docling subprocess and extraction text resolution.
 */

import { join } from "node:path";

/**
 * Use docling to convert a PDF to markdown for metadata extraction.
 * @param {string} pdfPath
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} fs
 * @param {import("./gateways/subprocess-gateway.js").SubprocessGateway} subprocess
 * @returns {string|null}
 */
export function pdfToText(pdfPath, fs, subprocess) {
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
    console.error(`mailctl: docling conversion failed for ${pdfPath}: ${err.message}`);
    return null;
  } finally {
    try {
      fs.rm(tmpDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`mailctl: failed to clean up temp dir ${tmpDir}: ${err.message}`);
    }
  }
}

/**
 * Determine the text to use for metadata extraction.
 * If the email has PDF attachments, converts the first PDF to markdown via docling.
 * Otherwise returns the email body text.
 * @param {Array} pdfAttachments
 * @param {string} bodyText
 * @param {number} uid
 * @param {import("./gateways/fs-gateway.js").FileSystemGateway} fs
 * @param {import("./gateways/subprocess-gateway.js").SubprocessGateway} subprocess
 * @param {function(object): void} [onProgress] - receives structured progress events
 * @returns {string}
 */
export function resolveExtractionText(pdfAttachments, bodyText, uid, fs, subprocess, onProgress = () => {}) {
  if (pdfAttachments.length === 0) return bodyText;

  const tmpPdfPath = join(process.env.TMPDIR || "/tmp", `mailctl-receipt-${Date.now()}.pdf`);
  try {
    fs.writeFile(tmpPdfPath, pdfAttachments[0].content);
    const pdfMarkdown = pdfToText(tmpPdfPath, fs, subprocess);
    if (pdfMarkdown) {
      onProgress({ type: "using-pdf-content", uid });
      return pdfMarkdown;
    }
  } catch (err) {
    onProgress({ type: "docling-failed", uid, error: err });
  } finally {
    try {
      fs.rm(tmpPdfPath, { force: true });
    } catch (err) {
      console.error(`mailctl: failed to clean up temp file ${tmpPdfPath}: ${err.message}`);
    }
  }
  return bodyText;
}
