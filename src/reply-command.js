/**
 * Reply command orchestrator.
 *
 * Extracts the orchestration logic from the cli.js reply handler so it can
 * be tested independently. All I/O is injected via deps.
 */
import { resolve } from "node:path";
import { withMessage } from "./find-message.js";
import { buildEditorTemplate, buildReplyBody, buildReplyHeaders, parseEditorContent } from "./reply.js";

/**
 * @typedef {object} ReplyCommandDeps
 * @property {object[]} targetAccounts - accounts to search (from resolveCommandContext)
 * @property {Function} forEachAccount - (accounts, fn) → Promise<void>
 * @property {Function} listMailboxes - (client) → Promise<Array>
 * @property {Function} simpleParser - mailparser simpleParser function
 * @property {object} fsGateway - { readText(path: string): string }
 * @property {object} smtpGateway - { send(account, message): Promise<{messageId, accepted}> }
 * @property {object} editorGateway - { editTempFile(content: string): string }
 * @property {object} confirmGateway - { confirm(prompt: string): Promise<string> }
 */

/**
 * Find and fetch the original message for a UID across accounts.
 * Returns { parsed, account } or throws if the UID is not found anywhere.
 *
 * @param {string} uid - message UID to look up
 * @param {object} opts - CLI options (may include opts.mailbox)
 * @param {ReplyCommandDeps} deps
 * @returns {Promise<{ parsed: object, account: object }>}
 */
async function fetchOriginalMessage(uid, opts, deps) {
  const { simpleParser } = deps;

  const { result: parsed, account } = await withMessage(uid, opts, deps, async (client) => {
    const raw = await client.download(uid, undefined, { uid: true });
    const chunks = [];
    for await (const chunk of raw.content) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    return simpleParser(buf);
  });

  return { parsed, account };
}

/**
 * Resolve the user's reply message text from one of three sources:
 * inline --message, --message-file, or interactive --edit.
 *
 * Returns null when the user declines the send confirmation (aborted).
 *
 * @param {object} opts - CLI options
 * @param {object} originalParsed - parsed original email
 * @param {object} headers - reply headers from buildReplyHeaders
 * @param {ReplyCommandDeps} deps
 * @returns {Promise<string|null>} user message text, or null when aborted
 */
async function resolveUserMessage(opts, originalParsed, headers, deps) {
  if (opts.message) {
    return opts.message;
  }

  if (opts.messageFile) {
    return deps.fsGateway.readText(resolve(opts.messageFile)).trim();
  }

  if (opts.edit) {
    const quotedBody = buildReplyBody("", originalParsed);
    const template = buildEditorTemplate(headers, quotedBody);
    const edited = deps.editorGateway.editTempFile(template);
    const userMessage = parseEditorContent(edited);

    if (!userMessage) {
      throw new Error("Empty reply — aborting.");
    }

    if (!opts.yes && !opts.dryRun) {
      const answer = await deps.confirmGateway.confirm("Send this reply? [y/N] ");
      if (answer.toLowerCase() !== "y") {
        return null; // user aborted
      }
    }

    return userMessage;
  }

  throw new Error("Provide --message, --message-file, or --edit to compose a reply.");
}

/**
 * Orchestrate the reply command.
 *
 * Finds the original message, composes the reply, and either sends it or
 * returns a dry-run preview. Returns a result object describing the outcome.
 *
 * @param {string} uid - message UID to reply to
 * @param {object} opts - CLI options (message, messageFile, edit, cc, dryRun, yes, mailbox)
 * @param {ReplyCommandDeps} deps - injected dependencies
 * @returns {Promise<
 *   | { aborted: true }
 *   | { dryRun: true, message: object }
 *   | { sent: true, messageId: string, accepted: string[], message: object }
 * >}
 */
export async function replyCommand(uid, opts, deps) {
  if (!opts.message && !opts.messageFile && !opts.edit) {
    throw new Error("Provide --message, --message-file, or --edit to compose a reply.");
  }

  const { parsed: originalParsed, account: matchedAccount } = await fetchOriginalMessage(uid, opts, deps);

  if (!matchedAccount.smtp) {
    throw new Error(`No SMTP configuration for account "${matchedAccount.name}". Add an smtp section to config.json.`);
  }

  const headers = buildReplyHeaders(originalParsed, matchedAccount.user);
  const userMessage = await resolveUserMessage(opts, originalParsed, headers, deps);

  if (userMessage === null) {
    return { aborted: true };
  }

  const replyBody = buildReplyBody(userMessage, originalParsed);

  const message = {
    from: matchedAccount.user,
    to: headers.to,
    cc: opts.cc || undefined,
    subject: headers.subject,
    text: replyBody,
    inReplyTo: headers.inReplyTo,
    references: headers.references,
  };

  if (opts.dryRun) {
    return { dryRun: true, message };
  }

  const result = await deps.smtpGateway.send(matchedAccount, message);
  return { sent: true, messageId: result.messageId, accepted: result.accepted, message };
}
