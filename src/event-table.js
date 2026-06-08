import { defineErrorEvent, defineEvent } from "./define-event.js";
import { createEventRenderer } from "./render-shared-events.js";

/**
 * @param {string} key
 * @returns {string}
 */
function camelToKebab(key) {
  return key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
}

/**
 * Builds event factories and a co-located renderer from a single descriptor table.
 *
 * Each key is a camelCase factory name; the value describes the event:
 *   - params: extra parameter names (after `error` for error events)
 *   - severity: "error" | "warning" — if present, uses defineErrorEvent
 *   - render: (event) => string — optional render function for this event
 *   - type: explicit type string override (defaults to kebab-case of key)
 *
 * Adding a new event = one descriptor entry. No separate renderer edit needed.
 *
 * @param {Record<string, { params?: string[], severity?: string, render?: (e: any) => string, type?: string }>} descriptors
 * @param {{ fallback?: boolean }} [opts]
 * @returns {{ factories: Record<string, any>, renderEvent: (event: object) => string | null }}
 */
export function defineEventTable(descriptors, opts) {
  /** @type {Record<string, any>} */
  const factories = {};
  /** @type {Record<string, (event: any) => string>} */
  const renderMap = {};

  for (const [key, descriptor] of Object.entries(descriptors)) {
    const type = descriptor.type ?? camelToKebab(key);
    const params = descriptor.params ?? [];

    const factory =
      descriptor.severity !== undefined
        ? defineErrorEvent(type, /** @type {"error" | "warning"} */ (descriptor.severity), ...params)
        : defineEvent(type, ...params);

    factories[key] = factory;

    if (descriptor.render) {
      renderMap[type] = descriptor.render;
    }
  }

  const renderEvent = createEventRenderer(renderMap, opts);
  return { factories, renderEvent };
}
