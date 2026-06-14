const ANSI_RED = "\x1b[31m";
const ANSI_YELLOW = "\x1b[33m";
const ANSI_RESET = "\x1b[0m";

/**
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
 * Builds an event renderer from an event-type → render-function map.
 *
 * Unknown events are delegated to `fallbackRenderer` when provided; otherwise null is
 * returned. Pass `{ fallbackRenderer: renderSharedEvent }` to chain through shared
 * IMAP events — use `defineCommandEventTable` instead of calling this directly.
 *
 * When an event has a `severity` field ("error" or "warning"), the rendered string
 * is wrapped in the corresponding ANSI color code.
 *
 * @param {Record<string, (event: object) => string>} eventMap
 * @param {{ fallbackRenderer?: ((event: object) => string | null) | null }} [opts]
 * @returns {(event: object) => string | null}
 */
export function createEventRenderer(eventMap, { fallbackRenderer = null } = {}) {
  return (event) => {
    const handler = eventMap[/** @type {any} */ (event).type];
    const text = handler ? handler(event) : fallbackRenderer ? fallbackRenderer(event) : null;
    if (text === null) return null;
    return applySeverityColor(text, /** @type {any} */ (event).severity);
  };
}
