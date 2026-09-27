/**
 * Shared JSDoc typedefs for IMAP client handles.
 * Import in consuming files with, for example:
 *   typedef {import('./imap-types.js').ImapClient} ImapClient
 * (omit the at-sign prefix; this comment avoids being parsed by tsc)
 *
 * Strategy: three narrow structural interfaces rather than one full ImapFlow alias.
 * Each interface covers only the methods a given function group actually calls.
 * This lets test fixtures supply partial duck-typed mocks without needing casts,
 * while still documenting the real contract.
 *
 * - ImapLockable  — only getMailboxLock; used by withMailboxLock / forEachMailboxGroup
 * - ImapClient    — getMailboxLock + search + fetch + optional mailbox; used by all
 *                   search / fetch / detect functions
 * - ImapFlaggable — messageFlagsAdd + messageFlagsRemove; used by applyFlagChanges
 */

export {};

/**
 * Minimal IMAP handle: only the mailbox-lock capability.
 * Satisfied by any object that has getMailboxLock — including real ImapFlow
 * instances and test mocks that only stub that method.
 *
 * @typedef {Object} ImapLockable
 * @property {(path: string | string[], options?: Object) => Promise<{ release(): void }>} getMailboxLock
 */

/**
 * IMAP handle for search and fetch operations.
 * All three primary methods are required, reflecting what a real ImapFlow
 * connection always provides.  Test mocks must stub all three even when a
 * lock-failure test only exercises the getMailboxLock path — adding no-op
 * stubs for search/fetch is safer than optional properties, which would force
 * source code to use unsafe casts or TypeScript-only `!` assertions.
 * mailbox is optional (imapflow sets it to false | MailboxObject after a lock
 * is acquired; tests typically supply { exists: number } or omit it).
 *
 * @typedef {Object} ImapClient
 * @property {(path: string | string[], options?: Object) => Promise<{ release(): void }>} getMailboxLock
 * @property {(criteria: Object, options?: Object) => Promise<number[]>} search
 * @property {(range: string | number[], query: Object, options?: Object) => AsyncIterable<Object>} fetch
 * @property {false | { exists?: number } | null | undefined} [mailbox]
 */

/**
 * IMAP handle for flag mutation operations.
 * Satisfied by objects that have messageFlagsAdd and messageFlagsRemove.
 * Return type is Promise<any> to stay compatible with test stubs that return
 * void or any other value (applyFlagChanges does not use the return value).
 *
 * @typedef {Object} ImapFlaggable
 * @property {(range: string | number[], flags: string[], options?: Object) => Promise<any>} messageFlagsAdd
 * @property {(range: string | number[], flags: string[], options?: Object) => Promise<any>} messageFlagsRemove
 */
