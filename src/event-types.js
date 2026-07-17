/**
 * @module event-types
 * Shared event-type unions for the mailctl event subsystem.
 * Import AppEvent wherever a function accepts or emits any application event.
 */

/** @typedef {import('./shared-event-factories.js').SharedEvent} SharedEvent */
/** @typedef {import('./auth-event-factories.js').AuthEvent} AuthEvent */
/** @typedef {import('./scan-event-factories.js').ScanEvent} ScanEvent */
/** @typedef {import('./sort-event-factories.js').SortEvent} SortEvent */
/** @typedef {import('./download-event-factories.js').DownloadEvent} DownloadEvent */
/** @typedef {import('./receipts/download-receipts-event-factories.js').DownloadReceiptsEvent} DownloadReceiptsEvent */

/**
 * Union of all application event types. Documents every known event the application
 * can emit. Used for documentation and for callers that construct typed events via factories.
 *
 * @typedef {SharedEvent | AuthEvent | ScanEvent | SortEvent | DownloadEvent | DownloadReceiptsEvent} AppEvent
 */

/**
 * Structural minimum satisfied by every AppEvent member and by event-shaped test
 * fixtures. Use as the parameter type for render functions and progress callbacks —
 * it preserves structure (type, severity, error) while accepting any event-shaped object.
 *
 * @typedef {{ type: string, severity?: string, error?: { message: string } } & Record<string, unknown>} BaseEvent
 */

export {};
