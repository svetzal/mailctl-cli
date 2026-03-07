/**
 * Pure logic and IMAP operations for the `flag` command.
 * computeFlagChanges is pure (no I/O); applyFlagChanges performs IMAP calls.
 */

/**
 * Compute which IMAP flag operations to perform based on CLI options.
 * Pure function — no I/O.
 * @param {object} opts
 * @param {boolean} [opts.read]
 * @param {boolean} [opts.unread]
 * @param {boolean} [opts.star]
 * @param {boolean} [opts.unstar]
 * @returns {{ add: string[], remove: string[] }}
 */
export function computeFlagChanges(opts) {
  if (opts.read && opts.unread) {
    throw new Error("--read and --unread are mutually exclusive.");
  }
  if (opts.star && opts.unstar) {
    throw new Error("--star and --unstar are mutually exclusive.");
  }
  if (!opts.read && !opts.unread && !opts.star && !opts.unstar) {
    throw new Error("No flag options specified. Use --read, --unread, --star, or --unstar.");
  }

  const add = [];
  const remove = [];

  if (opts.read) add.push("\\Seen");
  if (opts.unread) remove.push("\\Seen");
  if (opts.star) add.push("\\Flagged");
  if (opts.unstar) remove.push("\\Flagged");

  return { add, remove };
}

/**
 * Apply flag changes to messages via IMAP.
 * @param {any} client - connected IMAP client with mailbox locked
 * @param {string} uidRange - comma-separated UIDs
 * @param {{ add: string[], remove: string[] }} changes
 * @returns {Promise<{ added: string[], removed: string[] }>}
 */
export async function applyFlagChanges(client, uidRange, changes) {
  if (changes.add.length > 0) {
    await client.messageFlagsAdd(uidRange, changes.add, { uid: true });
  }
  if (changes.remove.length > 0) {
    await client.messageFlagsRemove(uidRange, changes.remove, { uid: true });
  }

  return { added: changes.add, removed: changes.remove };
}
