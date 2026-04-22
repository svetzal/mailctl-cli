/**
 * Shared pure renderer for event types that appear across multiple command renderers.
 * No I/O — returns a string (or null if the event type isn't shared).
 */

/**
 * Render a shared progress event as a human-readable string.
 *
 * Handles event types that are emitted by multiple commands:
 * - mailbox-lock-failed
 * - search-failed
 *
 * @param {object} event
 * @returns {string | null}
 */
export function renderSharedEvent(event) {
  switch (event.type) {
    case "mailbox-lock-failed":
      return `   Could not lock mailbox ${event.mailbox}: ${event.error.message}`;
    case "search-failed":
      return `   Search failed in ${event.mailbox}: ${event.error.message}`;
    default:
      return null;
  }
}

/**
 * Create a table-driven event renderer from a map of event type → formatter function.
 * Unknown events fall back to renderSharedEvent; pass `false` to disable the fallback
 * (for renderers that don't share common events, e.g. auth).
 *
 * @param {Record<string, (event: object) => string>} eventMap
 * @param {{ fallback?: boolean }} [opts]
 * @returns {(event: object) => string | null}
 */
export function createEventRenderer(eventMap, { fallback = true } = {}) {
  return (event) => {
    const handler = eventMap[event.type];
    if (handler) return handler(event);
    return fallback ? renderSharedEvent(event) : null;
  };
}
