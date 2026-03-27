/**
 * IMAP Gateway — thin wrapper around ImapFlow.
 * All IMAP I/O is isolated here so tests can inject a mock instead.
 * Contains no logic to test.
 */
import { listMailboxes as _listMailboxes, connect } from "../imap-client.js";

export class ImapGateway {
  /**
   * Connect to an IMAP server.
   * @param {object} account
   * @returns {Promise<import("imapflow").ImapFlow>}
   */
  async connect(account) {
    return connect(account);
  }

  /**
   * List all available mailboxes for a connected account.
   * @param {import("imapflow").ImapFlow} client
   * @returns {Promise<Array<{ path: string, name: string, flags: Set<string>, specialUse: string|undefined }>>}
   */
  async listMailboxes(client) {
    return _listMailboxes(client);
  }

  /**
   * Obtain an exclusive lock on a mailbox.
   * @param {import("imapflow").ImapFlow} client
   * @param {string} mailbox
   * @returns {Promise<{ release: () => void }>}
   */
  async getMailboxLock(client, mailbox) {
    return client.getMailboxLock(mailbox);
  }

  /**
   * Search messages in the currently-locked mailbox.
   * @param {import("imapflow").ImapFlow} client
   * @param {object} criteria
   * @param {object} [opts]
   * @returns {Promise<number[]|false>}
   */
  async search(client, criteria, opts) {
    return client.search(criteria, opts);
  }

  /**
   * Fetch messages from the currently-locked mailbox.
   * @param {import("imapflow").ImapFlow} client
   * @param {string} range - UID range string
   * @param {object} opts
   * @param {object} [fetchOpts]
   * @returns {AsyncIterable<object>}
   */
  fetch(client, range, opts, fetchOpts) {
    return client.fetch(range, opts, fetchOpts);
  }

  /**
   * Move messages to a destination mailbox.
   * @param {import("imapflow").ImapFlow} client
   * @param {string} uids - comma-separated UID range
   * @param {string} destination
   * @param {object} [opts]
   * @returns {Promise<unknown>}
   */
  async messageMove(client, uids, destination, opts) {
    return client.messageMove(uids, destination, opts);
  }

  /**
   * Download a message or message part.
   * @param {import("imapflow").ImapFlow} client
   * @param {string} uid
   * @param {string|undefined} part
   * @param {object} [opts]
   * @returns {Promise<{ content: AsyncIterable<Buffer> }>}
   */
  async download(client, uid, part, opts) {
    return client.download(uid, part, opts);
  }

  /**
   * Log out and close the connection.
   * @param {import("imapflow").ImapFlow} client
   * @returns {Promise<void>}
   */
  async logout(client) {
    return client.logout();
  }
}
