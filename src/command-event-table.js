import { defineEventTable } from "./event-table.js";
import { renderSharedEvent } from "./shared-event-factories.js";

/** @typedef {import('./event-types.js').BaseEvent} BaseEvent */

/**
 * Like defineEventTable but falls back to renderSharedEvent for unknown event types.
 * Use for command-level event tables that share IMAP progress events (mailbox-lock-failed,
 * search-failed, etc.). For command tables with no shared fallback, use defineEventTable directly.
 *
 * @param {Record<string, { params?: string[], severity?: string, render?: (e: BaseEvent) => string, type?: string }>} descriptors
 * @returns {{ factories: Record<string, object>, renderEvent: (event: BaseEvent) => string | null }}
 */
export function defineCommandEventTable(descriptors) {
  return defineEventTable(descriptors, { fallbackRenderer: renderSharedEvent });
}
