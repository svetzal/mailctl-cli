/**
 * Event factories for scan progress events emitted by src/scanner.js.
 */

export const scanAccountStart = (name, user) => ({ type: "scan-account-start", name, user });
export const scanAccountComplete = (name, count) => ({ type: "scan-account-complete", name, count });
