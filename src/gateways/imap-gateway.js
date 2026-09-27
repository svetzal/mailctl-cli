/**
 * All IMAP I/O is isolated here so tests can inject a mock instead.
 */
import { listMailboxes as _listMailboxes, connect } from "../imap-client.js";

export class ImapGateway {
  /**
   * @param {Object} account
   * @returns {Promise<import("imapflow").ImapFlow>}
   */
  async connect(account) {
    return connect(account);
  }

  /**
   * @param {import("imapflow").ImapFlow} client
   * @returns {Promise<Array<{ path: string, name: string, flags: Set<string>, specialUse: string|undefined }>>}
   */
  async listMailboxes(client) {
    return _listMailboxes(client);
  }

  /**
   * @param {import("imapflow").ImapFlow} client
   * @param {string} mailbox
   * @returns {Promise<{ release: () => void }>}
   */
  async getMailboxLock(client, mailbox) {
    return client.getMailboxLock(mailbox);
  }

  /**
   * @param {import("imapflow").ImapFlow} client
   * @param {Object} criteria
   * @param {Object} [opts]
   * @returns {Promise<number[]|false|undefined>} undefined when no mailbox is
   * selected — imapflow returns early in that case, so callers must treat the
   * result as falsy rather than assuming an array.
   */
  async search(client, criteria, opts) {
    return client.search(criteria, opts);
  }

  /**
   * @param {import("imapflow").ImapFlow} client
   * @param {string} range - UID range string
   * @param {Object} opts
   * @param {Object} [fetchOpts]
   * @returns {AsyncIterable<Object>}
   */
  fetch(client, range, opts, fetchOpts) {
    return client.fetch(range, opts, fetchOpts);
  }

  /**
   * @param {import("imapflow").ImapFlow} client
   * @param {string} uids - comma-separated UID range
   * @param {string} destination
   * @param {Object} [opts]
   * @returns {Promise<unknown>}
   */
  async messageMove(client, uids, destination, opts) {
    return client.messageMove(uids, destination, opts);
  }

  /**
   * @param {import("imapflow").ImapFlow} client
   * @param {string} uid
   * @param {string|undefined} part
   * @param {Object} [opts]
   * @returns {Promise<{ content: AsyncIterable<Buffer> }>}
   */
  async download(client, uid, part, opts) {
    return client.download(uid, part, opts);
  }

  /**
   * @param {import("imapflow").ImapFlow} client
   * @returns {Promise<void>}
   */
  async logout(client) {
    return client.logout();
  }
}
