const ANSI_RED = "\x1b[31m";
const ANSI_YELLOW = "\x1b[33m";
const ANSI_RESET = "\x1b[0m";

/**
 * Applies ANSI color wrapping based on the event's severity field.
 * Events without a severity field are returned unchanged.
 *
 * @param {string} text
 * @param {string | undefined} severity
 * @returns {string}
 */
function applySeverityColor(text, severity) {
  if (severity === "error") return `${ANSI_RED}${text}${ANSI_RESET}`;
  if (severity === "warning") return `${ANSI_YELLOW}${text}${ANSI_RESET}`;
  return text;
}

/**
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
 * Unknown events fall back to renderSharedEvent; pass `false` to disable the fallback
 * (for renderers that don't share common events, e.g. auth).
 *
 * When an event has a `severity` field ("error" or "warning"), the rendered string
 * is wrapped in the corresponding ANSI color code. Events without severity are
 * rendered unchanged — this is backward-compatible.
 *
 * @param {Record<string, (event: object) => string>} eventMap
 * @param {{ fallback?: boolean }} [opts]
 * @returns {(event: object) => string | null}
 */
export function createEventRenderer(eventMap, { fallback = true } = {}) {
  return (event) => {
    const handler = eventMap[event.type];
    const text = handler ? handler(event) : fallback ? renderSharedEvent(event) : null;
    if (text === null) return null;
    return applySeverityColor(text, event.severity);
  };
}
