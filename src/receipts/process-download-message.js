import { join } from "node:path";
import { findPdfParts } from "../attachment-parts.js";
import {
  downloadDryRun,
  downloaded,
  downloadFailed,
  duplicateContent,
  fetchStructureError,
  invalidPdf,
} from "../download-event-factories.js";
import { buildFilename, vendorName } from "../download-filename.js";
import { buildManifestRecord, contentHash, isValidPdf } from "./receipt-decisions.js";

/**
 * Process a single receipt message: check manifest, fetch BODYSTRUCTURE, find PDF parts,
 * download and write each part. Mutates `manifest`, `existingFiles`, and `existingHashes` in-place.
 *
 * @param {object} client - connected IMAP client
 * @param {object} msg - receipt scan result (uid, address, name, date, mailbox)
 * @param {string} mailbox - current mailbox path
 * @param {object} context
 * @param {{ user: string }} context.account
 * @param {Record<string, object>} context.manifest - mutable manifest map
 * @param {boolean} context.dryRun
 * @param {string} context.outputDir
 * @param {Set<string>} context.existingFiles
 * @param {Set<string>} context.existingHashes
 * @param {{ writeFile: Function, mkdir?: Function }} context.fs
 * @param {function(object): void} [context.onProgress]
 * @returns {Promise<{ action: 'alreadyHave'|'noPdf'|'downloaded'|'skipped' }>}
 */
export async function processDownloadMessage(client, msg, mailbox, context) {
  const { account, manifest, dryRun, outputDir, existingFiles, existingHashes, fs, onProgress = () => {} } = context;
  const manifestKey = `${account.user}:${mailbox}:${msg.uid}`;

  if (manifest[manifestKey]) {
    return { action: "alreadyHave" };
  }

  let bodyStructure;
  try {
    for await (const fetched of client.fetch(String(msg.uid), { bodyStructure: true }, { uid: true })) {
      bodyStructure = fetched.bodyStructure;
    }
  } catch (err) {
    onProgress(fetchStructureError(err, msg.uid));
    return { action: "skipped" };
  }

  if (!bodyStructure) return { action: "skipped" };

  const pdfParts = findPdfParts(bodyStructure);

  if (pdfParts.length === 0) {
    manifest[manifestKey] = buildManifestRecord("no-pdf", { date: msg.date });
    return { action: "noPdf" };
  }

  const vendor = vendorName(msg.address, msg.name);
  /** @type {'downloaded'|'alreadyHave'|'noPdf'|'skipped'} */
  let action = "skipped";

  for (const part of pdfParts) {
    const filename = buildFilename(vendor, msg.date, part.filename, existingFiles);

    if (dryRun) {
      onProgress(downloadDryRun(filename));
      action = "downloaded";
    } else {
      try {
        const { content } = await client.download(String(msg.uid), part.part, { uid: true });
        const chunks = [];
        for await (const chunk of content) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        if (!isValidPdf(buffer)) {
          onProgress(invalidPdf(new Error("Invalid PDF content"), filename));
          continue;
        }

        const hash = contentHash(buffer);
        if (existingHashes.has(hash)) {
          onProgress(duplicateContent(filename));
          manifest[manifestKey] = buildManifestRecord("duplicate", { hash, date: msg.date, vendor });
          action = "alreadyHave";
          continue;
        }
        existingHashes.add(hash);

        const outPath = join(outputDir, filename);
        fs.writeFile(outPath, buffer);
        existingFiles.add(filename.toLowerCase());
        onProgress(downloaded(filename, buffer.length));
        manifest[manifestKey] = buildManifestRecord("downloaded", { filename, hash, date: msg.date, vendor });
        action = "downloaded";
      } catch (err) {
        onProgress(downloadFailed(err, filename));
        action = "skipped";
      }
    }
  }

  return { action };
}
