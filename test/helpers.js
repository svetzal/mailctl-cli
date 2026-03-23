import { mock } from "bun:test";

/**
 * Creates a mock IMAP mailbox lock with a mocked release function.
 * Universal across all tests that interact with IMAP mailbox locking.
 */
export function makeLock() {
  return { release: mock(() => {}) };
}

/**
 * Creates a base test account object. Override individual fields as needed.
 * For SMTP-capable accounts (e.g., reply-command), pass smtp in overrides.
 */
export function makeAccount(overrides = {}) {
  return { name: "Test Account", user: "user@test.com", ...overrides };
}

/**
 * Creates a standard forEachAccount mock that calls fn with the given client and account.
 * This is the most common pattern across all command orchestrator tests.
 */
export function makeForEachAccount(client, account) {
  return mock(async (_accounts, fn) => {
    await fn(client, account);
  });
}

/**
 * Creates a standard listMailboxes mock returning INBOX and Sent by default.
 * Override the mailbox list by passing a custom array.
 */
export function makeListMailboxes(mailboxes = [{ path: "INBOX" }, { path: "Sent" }]) {
  return mock(() => Promise.resolve(mailboxes));
}
